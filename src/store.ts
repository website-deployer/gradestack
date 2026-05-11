import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, auth } from './lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

export type QuestionFormat = 'A-D' | 'A-E' | 'TF' | 'A-D-M' | 'A-E-M' | 'SA';

export interface TestSection {
  id: string;
  count: number;
  format: QuestionFormat;
}

export interface Test {
  id: string;
  name: string;
  courseName?: string;
  instructorName?: string;
  date: string;
  numQuestions: number;
  format: QuestionFormat;
  sections?: TestSection[];
  includeStudentId: boolean;
  userId?: string;
  createdAt?: number;
  answerKey?: Record<number, string>;
}

export interface Scan {
  id: string;
  testId: string;
  studentId: string;
  studentName: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  needsReview: boolean;
  responses?: Record<number, string>;
  imageData?: string;
  userId?: string;
  createdAt?: number;
  batchName?: string;
}

interface AppState {
  user: any | null;
  setUser: (user: any | null) => void;
  tests: Test[];
  scans: Scan[];
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setTests: (tests: Test[]) => void;
  setScans: (scans: Scan[]) => void;
  addTest: (test: Omit<Test, 'id' | 'date' | 'createdAt' | 'userId'>) => Promise<void>;
  deleteTest: (id: string) => Promise<void>;
  addScan: (scan: Omit<Scan, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  deleteScan: (id: string) => Promise<void>;
  deleteScans: (ids: string[]) => Promise<void>;
  updateScan: (id: string, updates: Partial<Scan>) => Promise<void>;
  updateTest: (id: string, updates: Partial<Test>) => Promise<void>;
  clearAllData: () => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      tests: [],
      scans: [],
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      setTests: (tests) => set({ tests }),
      setScans: (scans) => set({ scans }),
      addTest: async (test) => {
        const user = auth.currentUser;
        const id = crypto.randomUUID();
        const newTest: Test = {
          ...test,
          id,
          date: new Date().toISOString(),
          userId: user?.uid,
          createdAt: Date.now()
        };
        
        set((state) => ({ tests: [newTest, ...state.tests] }));

        if (user) {
          try {
            await setDoc(doc(db, 'tests', id), newTest);
          } catch(e) {
            console.error(e);
          }
        }
      },
      deleteTest: async (id) => {
        set((state) => ({ tests: state.tests.filter(t => t.id !== id) }));
        if (auth.currentUser) {
          try { await deleteDoc(doc(db, 'tests', id)); } catch(e) {}
        }
      },
      addScan: async (scan) => {
        const user = auth.currentUser;
        const id = crypto.randomUUID();
        const newScan: Scan = {
          ...scan,
          id,
          userId: user?.uid,
          createdAt: Date.now()
        };
        
        set((state) => ({ scans: [newScan, ...state.scans] }));

        if (user) {
          try { await setDoc(doc(db, 'scans', id), newScan); } catch(e) {}
        }
      },
      deleteScan: async (id) => {
        set((state) => ({ scans: state.scans.filter(s => s.id !== id) }));
        if (auth.currentUser) {
          try { await deleteDoc(doc(db, 'scans', id)); } catch(e) {}
        }
      },
      deleteScans: async (ids) => {
        set((state) => ({ scans: state.scans.filter(s => !ids.includes(s.id)) }));
        if (auth.currentUser) {
          try {
            await Promise.all(ids.map(id => deleteDoc(doc(db, 'scans', id))));
          } catch(e) {}
        }
      },
      updateScan: async (id, updates) => {
        set((state) => ({ 
          scans: state.scans.map(s => s.id === id ? { ...s, ...updates } : s) 
        }));
        if (auth.currentUser) {
          try { await updateDoc(doc(db, 'scans', id), updates); } catch(e) {}
        }
      },
      updateTest: async (id, updates) => {
        set((state) => {
          const updatedTests = state.tests.map(t => t.id === id ? { ...t, ...updates } : t);
          
          // If answerKey was updated, re-grade all associated scans
          let updatedScans = state.scans;
          if (updates.answerKey) {
            updatedScans = state.scans.map(scan => {
              if (scan.testId === id && scan.responses) {
                let newRawScore = 0;
                Object.entries(updates.answerKey!).forEach(([qNum, correctAns]) => {
                  const studentAns = scan.responses![Number(qNum)];
                  if (studentAns && studentAns.toLowerCase().trim() === correctAns.toLowerCase().trim()) {
                    newRawScore++;
                  }
                });
                
                const pct = Math.round((newRawScore / scan.maxScore) * 100);
                let grade = 'F';
                if (pct >= 90) grade = 'A';
                else if (pct >= 80) grade = 'B';
                else if (pct >= 70) grade = 'C';
                else if (pct >= 60) grade = 'D';

                return {
                  ...scan,
                  rawScore: newRawScore,
                  percentage: pct,
                  grade
                };
              }
              return scan;
            });

            // Update Firebase for each re-graded scan if user is logged in
            if (auth.currentUser) {
              Promise.all(
                updatedScans
                  .filter(s => s.testId === id)
                  .map(s =>
                    updateDoc(doc(db, 'scans', s.id), {
                      rawScore: s.rawScore,
                      percentage: s.percentage,
                      grade: s.grade
                    }).catch(() => {})
                  )
              );
            }
          }

          return { tests: updatedTests, scans: updatedScans };
        });

        if (auth.currentUser) {
          try { await updateDoc(doc(db, 'tests', id), updates); } catch(e) {}
        }
      },
      clearAllData: async () => {
        const state = get();
        const user = auth.currentUser;

        // Clear local state immediately for instant feedback
        set({ tests: [], scans: [] });

        if (user) {
          // Delete from Firebase in the background
          const deletePromises = [
            ...state.tests.map(t => deleteDoc(doc(db, 'tests', t.id))),
            ...state.scans.map(s => deleteDoc(doc(db, 'scans', s.id)))
          ];
          Promise.all(deletePromises).catch(e => console.error("Error clearing data from Firebase", e));
        }
      }
    }),
    {
      name: 'gradestack-storage',
      partialize: (state) => ({ tests: state.tests, scans: state.scans, theme: state.theme }), // keep local sync for offline
    }
  )
);
