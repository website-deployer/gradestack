import { useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useStore, Test, Scan } from '../store';

// Helper for error handling
enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write'
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const setUser = useStore(state => state.setUser);
  const setTests = useStore(state => state.setTests);
  const setScans = useStore(state => state.setScans);
  const user = useStore(state => state.user);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Create a simplified user object to pass to Zustand
      setUser(firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL } : null);
    });
    return () => unsubscribeAuth();
  }, [setUser]);

  useEffect(() => {
    if (!user?.uid) return;

    const qTests = query(collection(db, 'tests'), where('userId', '==', user.uid));
    const unsubscribeTests = onSnapshot(qTests, (snapshot) => {
      const testsData: Test[] = [];
      snapshot.forEach(doc => {
        testsData.push({ id: doc.id, ...doc.data() } as Test);
      });
      setTests(testsData.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tests');
    });

    const qScans = query(collection(db, 'scans'), where('userId', '==', user.uid));
    const unsubscribeScans = onSnapshot(qScans, (snapshot) => {
      const scansData: Scan[] = [];
      snapshot.forEach(doc => {
        scansData.push({ id: doc.id, ...doc.data() } as Scan);
      });
      setScans(scansData.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'scans');
    });

    return () => {
      unsubscribeTests();
      unsubscribeScans();
    };
  }, [user?.uid, setTests, setScans]);

  return <>{children}</>;
}
