import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { PDFDocument } from 'pdf-lib';
import { GoogleGenAI, Type } from "@google/genai";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export function ScanSheets() {
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);
  const addScan = useStore(state => state.addScan);
  const updateTest = useStore(state => state.updateTest);
  
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTestId = searchParams.get('testId');
  const initialScanId = searchParams.get('scanId');
  
  const [selectedTestId, setSelectedTestId] = useState<string>(initialTestId || (tests.length > 0 ? tests[0].id : ''));
  const [isScanning, setIsScanning] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [reviewScanId, setReviewScanId] = useState<string | null>(initialScanId || null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [selectedScansForDelete, setSelectedScansForDelete] = useState<Set<string>>(new Set());

  // Function to delete scans
  const deleteScans = useStore(state => state.deleteScans);

  const toggleScanSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedScansForDelete);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedScansForDelete(next);
  };

  const handleDeleteSelected = async () => {
    if (selectedScansForDelete.size === 0) return;
    if (deleteScans) {
       await deleteScans(Array.from(selectedScansForDelete));
    }
    setSelectedScansForDelete(new Set());
  };

  const selectedTest = tests.find(t => t.id === selectedTestId);
  const currentScans = scans.filter(s => s.testId === selectedTestId);
  const scanToReview = scans.find(s => s.id === reviewScanId);

  const [batchName, setBatchName] = useState<string>('Default Batch');

  // Local state for manual score editing
  const [editingScore, setEditingScore] = useState<number | null>(null);
  
  // Image Review & Cropping
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [isReviewingImage, setIsReviewingImage] = useState(false);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // Local state for editing answer key
  const [localKey, setLocalKey] = useState<Record<number, string>>(selectedTest?.answerKey || {});

  const handleOpenKeyEditor = () => {
    setLocalKey(selectedTest?.answerKey || {});
    setIsEditingKey(true);
  };

  // Sync localKey when selected test changes
  useEffect(() => {
    setLocalKey(selectedTest?.answerKey || {});
  }, [selectedTestId]);

  const handleSaveKey = () => {
    if (!selectedTest) return;
    const missingQs = Array.from({ length: selectedTest.numQuestions }).filter((_, i) => !localKey[i + 1] || localKey[i + 1] === '');
    if (missingQs.length > 0) return;
    
    updateTest(selectedTest.id, { answerKey: localKey });
    setIsEditingKey(false);
  };

  const getOptions = (format: string) => {
    switch(format) {
      case 'A-D': return ['A', 'B', 'C', 'D'];
      case 'A-E': return ['A', 'B', 'C', 'D', 'E'];
      case 'TF': return ['T', 'F'];
      default: return ['A', 'B', 'C', 'D'];
    }
  };

  const gradeWithAI = async (base64Data: string, mimeType: string) => {
    if (!selectedTest) return;
    
    setIsScanning(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `You are an expert grading assistant. 
      Analyze the provided ${mimeType === 'application/pdf' ? 'PDF document' : 'image'} of an answer sheet.
      The sheet belongs to an assessment with ${selectedTest.numQuestions} questions.
      Extract the student's selected answers for each question based on the bubble sheet markings or short handwritten answers.
      If it's a PDF, examine all pages.
      If a marking is unclear or handwriting is illegible, leave it blank or use "?".
      Look for student name and ID if visible.
      Return the results as a JSON object.`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data.split(',')[1], mimeType } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              studentName: { type: Type.STRING },
              studentId: { type: Type.STRING },
              responses: {
                type: Type.OBJECT,
                additionalProperties: { type: Type.STRING },
                description: "Keys are question numbers (1 to N), values are the student's answer (e.g. 'A', 'B', 'T', 'F')"
              }
            },
            required: ["responses"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const aiResponses: Record<number, string> = {};
      
      // Normalize responses
      Object.entries(result.responses || {}).forEach(([k, v]) => {
        aiResponses[Number(k)] = String(v).toUpperCase();
      });

      // Calculate score
      let rawScore = 0;
      let reviewRecommended = false;
      
      for (let i = 1; i <= selectedTest.numQuestions; i++) {
        const studentAns = aiResponses[i];
        const correctAns = selectedTest.answerKey?.[i] || '';
        
        if (!studentAns || studentAns === '?') {
          reviewRecommended = true;
        } else if (studentAns.toLowerCase().trim() === correctAns.toLowerCase().trim()) {
          rawScore++;
        }
      }

      const pct = Math.round((rawScore / selectedTest.numQuestions) * 100);
      let grade = 'F';
      if (pct >= 90) grade = 'A';
      else if (pct >= 80) grade = 'B';
      else if (pct >= 70) grade = 'C';
      else if (pct >= 60) grade = 'D';

      addScan({
        testId: selectedTest.id,
        studentId: result.studentId || String(Math.floor(10000 + Math.random() * 90000)),
        studentName: result.studentName || "Captured Sheet",
        rawScore,
        maxScore: selectedTest.numQuestions,
        percentage: pct,
        grade,
        needsReview: reviewRecommended,
        responses: aiResponses,
        imageData: base64Data,
        batchName: batchName || undefined
      });

    } catch (err) {
      console.error(err);
      setError("AI Grading failed. Please ensure the image is clear and try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
       setError("Use the 'Upload PDFs' button for digital PDF documents.");
       e.target.value = '';
       return;
    }

    setPreviewFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedImage(event.target?.result as string);
      setIsReviewingImage(true);
    };
    reader.readAsDataURL(file);
    
    // Clear input so same file can be selected again
    e.target.value = '';
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        1 / 1.4,
        width,
        height
      ),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const getCroppedImg = async (image: HTMLImageElement, pixelCrop: PixelCrop): Promise<string> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('No 2d context');

    ctx.drawImage(
      image,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg');
  };

  const handleConfirmCrop = async () => {
    if (imgRef.current && completedCrop) {
      const croppedBase64 = await getCroppedImg(imgRef.current, completedCrop);
      setIsReviewingImage(false);
      gradeWithAI(croppedBase64, 'image/jpeg');
    } else if (capturedImage) {
      // Fallback to original image if no crop
      setIsReviewingImage(false);
      gradeWithAI(capturedImage, 'image/jpeg');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setIsReviewingImage(false);
    fileInputRef.current?.click();
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;
    
    setIsScanning(true);
    setError(null);
    let errorCount = 0;
    
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      if (file.type === 'application/pdf') {
        const success = await gradePDFProgrammatically(file);
        if (!success) errorCount++;
      }
    }
    
    setIsScanning(false);
    if (errorCount > 0) {
      setError(`Failed to process ${errorCount} PDF(s). Ensure they are digitally filled PDFs exported from GradeStack.`);
    }
    
    e.target.value = '';
  };

  const gradePDFProgrammatically = async (file: File): Promise<boolean> => {
    if (!selectedTest) return false;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      if (fields.length === 0) {
        throw new Error("No fields found");
      }

      const studentResponses: Record<number, string> = {};
      let studentName = "";
      let studentId = "";

      fields.forEach(field => {
        const name = field.getName();
        if (name === 'student_name') {
           try { studentName = (field as any).getText(); } catch(e) {}
        } else if (name === 'student_id') {
           try { studentId = (field as any).getText(); } catch(e) {}
        } else if (name.startsWith('q.')) {
           const parts = name.split('.');
           const qNum = parseInt(parts[1]);
           const option = parts[2];
           
           if (!isNaN(qNum)) {
             if (field.constructor.name === 'PDFRadioGroup' || (field as any).getSelected) {
                try {
                  const selected = (field as any).getSelected();
                  if (typeof selected === 'string' && selected && selected !== 'Off') {
                    studentResponses[qNum] = selected;
                  }
                } catch (e) {}
             } else if (field.constructor.name === 'PDFCheckBox' || (field as any).isChecked) {
                if ((field as any).isChecked && (field as any).isChecked()) {
                   if (studentResponses[qNum]) {
                      const existing = studentResponses[qNum].split(',');
                      if (!existing.includes(option)) {
                        studentResponses[qNum] = [...existing, option].sort().join(',');
                      }
                   } else if (option) {
                      studentResponses[qNum] = option;
                   }
                }
             } else if (field.constructor.name === 'PDFTextField' || (field as any).getText) {
                try {
                  const text = (field as any).getText();
                  if (text) studentResponses[qNum] = text;
                } catch(e) {}
             }
           }
        }
      });

      // Calculate score
      let rawScore = 0;
      for (let i = 1; i <= selectedTest.numQuestions; i++) {
        const studentAns = studentResponses[i];
        const correctAns = selectedTest.answerKey?.[i] || '';
        if (studentAns && studentAns.toLowerCase().trim() === correctAns.toLowerCase().trim()) {
          rawScore++;
        }
      }

      const pct = Math.round((rawScore / selectedTest.numQuestions) * 100);
      let grade = 'F';
      if (pct >= 90) grade = 'A';
      else if (pct >= 80) grade = 'B';
      else if (pct >= 70) grade = 'C';
      else if (pct >= 60) grade = 'D';

      await addScan({
        testId: selectedTest.id,
        studentId: studentId || "PDF-" + Math.floor(1000 + Math.random() * 9000),
        studentName: studentName || file.name,
        rawScore,
        maxScore: selectedTest.numQuestions,
        percentage: pct,
        grade,
        needsReview: false,
        responses: studentResponses,
        imageData: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOGwtNi02eiIvPjxwb2x5bGluZSBwb2ludHM9IjE0IDIgMTQgOCAyMCA4Ii8+PC9zdmc+",
        batchName: batchName || undefined
      });

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleUpdateScore = (scanId: string, newScore: number) => {
    if (!selectedTest) return;
    const max = selectedTest.numQuestions;
    const cappedScore = Math.min(max, Math.max(0, newScore));
    const pct = Math.round((cappedScore / max) * 100);
    
    let grade = 'F';
    if (pct >= 90) grade = 'A';
    else if (pct >= 80) grade = 'B';
    else if (pct >= 70) grade = 'C';
    else if (pct >= 60) grade = 'D';

    useStore.getState().updateScan(scanId, {
      rawScore: cappedScore,
      percentage: pct,
      grade,
      needsReview: false
    });
    
    setEditingScore(null);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full relative bg-[#0B0E14] text-white w-full overflow-hidden">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        multiple
        ref={pdfInputRef} 
        onChange={handlePdfUpload} 
        accept="application/pdf" 
        className="hidden" 
      />

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-surface text-on-surface border-b border-outline-variant z-40 w-full shrink-0">
        <h1 className="text-xl font-bold text-primary">Scan Responses</h1>
        <button onClick={() => setShowDrawer(!showDrawer)} className="p-2 rounded-full bg-surface-container text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined">{showDrawer ? 'close' : 'analytics'}</span>
          <span className="text-xs font-bold pr-1">BATCH</span>
        </button>
      </header>
      
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 grayscale-[0.5] bg-[url('https://images.unsplash.com/photo-1434030216411-0b793f4b4173?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')]" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-black/40 to-black/80"></div>
        
        <div className="relative w-[90%] max-w-sm aspect-[1/1.4] border-[1.5px] border-white/20 rounded-2xl flex flex-col items-center justify-center z-10 pointer-events-none mb-16 overflow-hidden">
          {/* Scanning Animation */}
          {isScanning && (
            <motion.div 
              initial={{ top: '0%' }}
              animate={{ top: '100%' }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute left-0 right-0 h-[2px] bg-primary shadow-[0_0_15px_var(--color-primary)] z-20"
            />
          )}

          <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/40 rounded-tl-lg"></div>
          <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white/40 rounded-tr-lg"></div>
          <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white/40 rounded-bl-lg"></div>
          <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/40 rounded-br-lg"></div>
          
          <div className="absolute -bottom-14 w-full text-center">
            <p className="text-lg font-bold text-white drop-shadow-md tracking-wide">
              {isScanning ? 'AI GRADING...' : 'CENTER SHEET IN VIEW'}
            </p>
          </div>
        </div>

        {error && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-error text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
            <span className="material-symbols-outlined">error</span>
            <span className="text-sm font-bold">{error}</span>
          </div>
        )}

        {/* Global UI Overlays */}
        <div className="absolute top-6 left-6 z-20 hidden md:block">
           <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex flex-col gap-1 min-w-[180px]">
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Active Session</span>
              <span className="text-sm font-bold text-white">{selectedTest?.name || 'Select Assessment'}</span>
              <div className="flex items-center gap-2 mt-2">
                 <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                 <span className="text-[11px] font-medium text-success uppercase">System Ready</span>
              </div>
           </div>
        </div>

        <div className="absolute top-6 right-6 z-20 hidden md:flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-full">
          <span className="material-symbols-outlined text-[16px] text-primary-container">lightbulb</span>
          <span className="text-[11px] font-bold text-white/90 uppercase tracking-tight">Optimal Lighting</span>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-10 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center justify-end z-20 pb-16 h-64 pointer-events-none">
          <button 
            disabled={!selectedTestId || isScanning || (!selectedTest || !selectedTest.answerKey)}
            onClick={() => fileInputRef.current?.click()}
            className={`w-24 h-24 rounded-full border-[6px] border-white/10 flex items-center justify-center transition-all pointer-events-auto backdrop-blur-sm
              ${(!selectedTestId || !selectedTest?.answerKey) ? 'opacity-20 cursor-not-allowed grayscale' : 'hover:scale-105 active:scale-90 shadow-[0_0_30px_rgba(255,255,255,0.1)]'}`
            }
          >
            <div className={`w-16 h-16 rounded-full transition-all flex items-center justify-center shadow-inner
              ${isScanning ? 'bg-primary-container scale-90' : 'bg-white group-hover:bg-primary-container'}`}
            >
              <span className={`material-symbols-outlined text-4xl transform transition-transform ${isScanning ? 'rotate-180 text-primary animate-spin' : 'text-primary'}`}>
                {isScanning ? 'sync' : 'photo_camera'}
              </span>
            </div>
          </button>
          <p className="text-sm font-medium text-white/60 mt-6 tracking-wide uppercase">
            {selectedTestId 
              ? (selectedTest?.answerKey ? 'UPLOAD OR CAPTURE SHEET' : 'Set answer key first') 
              : 'Select a test to begin'}
          </p>
        </div>
      </div>

      <aside className={`absolute md:static inset-y-0 right-0 w-full sm:w-96 bg-surface border-l border-outline-variant z-30 transform transition-transform ${showDrawer ? 'translate-x-0' : 'translate-x-full md:translate-x-0'} flex flex-col shadow-[-4px_0_30px_rgba(0,0,0,0.1)] md:shadow-none text-on-surface`}>
        <div className="p-6 border-b border-outline-variant bg-surface-container-low mt-16 md:mt-0">
           <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">TARGET ASSESSMENT</label>
           <div className="relative mb-4 group">
              <select 
                value={selectedTestId} 
                onChange={(e) => setSelectedTestId(e.target.value)}
                className="w-full bg-surface text-on-surface rounded-xl p-3 pr-10 font-bold border border-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none outline-none cursor-pointer transition-all hover:bg-surface-container-lowest"
              >
                <option value="" disabled>-- Select Assessment --</option>
                {tests.map(t => <option key={t.id} value={t.id}>{t.name || 'Untitled'} ({new Date(t.date).toLocaleDateString()})</option>)}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-hover:text-primary transition-colors pointer-events-none">expand_more</span>
           </div>

           <div className="mb-6">
             <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">BATCH / CLASS PERIOD</label>
             <input 
               type="text" 
               value={batchName} 
               onChange={(e) => setBatchName(e.target.value)} 
               placeholder="e.g. Period 1" 
               className="w-full bg-surface text-on-surface rounded-xl p-3 font-bold border border-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
             />
           </div>

           {selectedTest && (
             <div className="flex gap-2">
               <button 
                 onClick={handleOpenKeyEditor}
                 className="flex-1 py-3 px-2 bg-primary/10 text-primary flex justify-center items-center gap-1 rounded-xl transition-all hover:bg-primary/20 font-bold text-xs"
               >
                 <span className="material-symbols-outlined text-[18px]">edit_note</span>
                 EDIT KEY
               </button>
               <button 
                 onClick={() => pdfInputRef.current?.click()}
                 className="flex-1 py-3 px-2 bg-primary text-white flex justify-center items-center gap-1 rounded-xl transition-all hover:bg-primary/90 hover:shadow-md font-bold text-xs shadow-sm"
               >
                 <span className="material-symbols-outlined text-[18px]">upload_file</span>
                 UPLOAD PDFs
               </button>
             </div>
           )}
        </div>
        
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-lowest shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3">
             <h2 className="text-xl font-bold text-primary">Live Queue</h2>
             <span className="px-2 py-0.5 bg-primary/5 text-primary rounded-full font-bold text-[10px] border border-primary/10 tracking-widest uppercase">{currentScans.length} IN BATCH</span>
          </div>
          {selectedScansForDelete.size > 0 && (
             <button
               onClick={handleDeleteSelected}
               className="text-[11px] font-bold text-error bg-error/10 hover:bg-error/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 uppercase tracking-wider"
             >
               <span className="material-symbols-outlined text-[14px]">delete</span>
               Delete ({selectedScansForDelete.size})
             </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-container-low">
          {currentScans.map((scan) => (
            <motion.div 
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              key={scan.id} 
              onClick={() => setReviewScanId(scan.id)}
              className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all relative ${!scan.needsReview ? 'bg-surface border-outline shadow-sm hover:border-primary hover:shadow-md' : 'bg-error-container/10 border-error-container shadow-sm hover:bg-error-container/20 group'} ${selectedScansForDelete.has(scan.id) ? 'ring-2 ring-error border-transparent' : ''}`}
            >
              <div 
                 onClick={(e) => toggleScanSelection(scan.id, e)}
                 className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selectedScansForDelete.has(scan.id) ? 'bg-error border-error text-white' : 'border-outline-variant text-transparent hover:border-error'}`}
              >
                  <span className="material-symbols-outlined text-[14px]">check</span>
              </div>
              
              <div className={`w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center relative overflow-hidden ${!scan.needsReview ? 'bg-surface-container-high border border-outline' : 'bg-error-container text-error'}`}>
                 {scan.imageData ? (
                   <img src={scan.imageData} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                 ) : (
                   <div className="absolute inset-0 bg-primary/5 animate-pulse opacity-50"></div>
                 )}
                 <span className={`material-symbols-outlined z-10 ${!scan.needsReview ? 'text-primary' : 'text-error'}`}>
                  {!scan.needsReview ? 'check_circle' : 'priority_high'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                   <p className="text-xs font-bold text-on-surface-variant uppercase tracking-tight">
                     ID: {scan.studentId}
                     {scan.batchName && <span className="ml-2 px-1.5 py-0.5 bg-outline-variant/30 rounded text-[9px]">{scan.batchName}</span>}
                   </p>
                   {!scan.needsReview ? (
                     <span className="text-[10px] font-bold text-success uppercase">SAVED</span>
                   ) : (
                     <span className="text-[10px] font-bold text-error uppercase group-hover:underline">Manual Review</span>
                   )}
                </div>
                <p className={`text-lg font-bold truncate mt-1 ${scan.needsReview ? 'text-error' : 'text-primary'}`}>
                  {scan.percentage}% Correct
                </p>
                <div className="flex items-center gap-2 mt-1">
                   <div className="w-full bg-outline-variant rounded-full h-1">
                      <div className={`h-full rounded-full transition-all duration-1000 ${scan.needsReview ? 'bg-error' : 'bg-primary'}`} style={{ width: `${scan.percentage}%` }}></div>
                   </div>
                </div>
              </div>
            </motion.div>
          ))}
          {currentScans.length === 0 && (
            <div className="text-center py-20 px-6">
              <div className="w-16 h-16 bg-outline-variant/20 rounded-full flex items-center justify-center mx-auto mb-4">
                 <span className="material-symbols-outlined text-[32px] text-outline">photo_camera</span>
              </div>
              <p className="text-sm font-bold text-on-surface-variant/40 uppercase tracking-widest">No scans detected</p>
            </div>
          )}
        </div>
      </aside>

      {/* Manual Review Modal */}
      {scanToReview && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="bg-surface w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl relative text-on-surface"
           >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
                 <div>
                    <h2 className="text-xl font-bold text-on-surface">Sheet Review</h2>
                    <p className="text-sm text-on-surface-variant">Review extracted scores and markings</p>
                 </div>
                 <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (deleteScans) await deleteScans([scanToReview.id]);
                        setReviewScanId(null);
                      }}
                      className="px-4 py-2 bg-error/10 text-error hover:bg-error/20 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Delete
                    </button>
                    <button onClick={() => { setReviewScanId(null); setEditingScore(null); }} className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-colors">
                       <span className="material-symbols-outlined">close</span>
                    </button>
                 </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                 {/* Visual Proof Section */}
                 <div className="flex-1 bg-black p-4 flex items-center justify-center relative overflow-hidden group">
                    {scanToReview.imageData ? (
                      <img src={scanToReview.imageData} className="max-w-full max-h-full object-contain rounded-lg" />
                    ) : (
                      <div className="w-full h-full border-4 border-dashed border-primary/20 rounded-2xl flex flex-col items-center justify-center gap-4 text-primary/40">
                         <span className="material-symbols-outlined text-[100px] opacity-10">photo_library</span>
                         <p className="font-bold text-xs uppercase tracking-widest opacity-30">Image Unavailable</p>
                      </div>
                    )}
                 </div>

                 {/* Control Panel */}
                 <div className="w-full lg:w-80 bg-surface-container-low border-l border-outline-variant p-8 flex flex-col gap-6 overflow-y-auto">
                    <div>
                       <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Student Info</label>
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                             <span className="material-symbols-outlined">person</span>
                          </div>
                          <div>
                             <p className="font-bold text-on-surface">{scanToReview.studentName}</p>
                             <p className="text-xs text-on-surface-variant">ID: {scanToReview.studentId}</p>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Grading Summary</label>
                       <div className="bg-surface p-4 rounded-2xl border border-outline shadow-sm">
                          <div className="flex items-end justify-between mb-4">
                             <span className="text-sm font-medium text-on-surface-variant">Correct answers</span>
                             <div className="flex items-center gap-2">
                                <input 
                                  type="number" 
                                  value={editingScore ?? scanToReview.rawScore}
                                  onChange={(e) => setEditingScore(parseInt(e.target.value) || 0)}
                                  className="w-16 h-10 border border-outline-variant rounded-xl text-center font-bold text-primary focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                                />
                                <span className="font-bold text-on-surface-variant">/ {scanToReview.maxScore}</span>
                             </div>
                          </div>
                          <div className="pt-4 border-t border-outline flex flex-col items-center">
                             <span className="text-[10px] font-bold text-on-surface-variant uppercase mb-2">Final Grade</span>
                             <span className="text-4xl font-black text-primary">
                                {(() => {
                                  const s = editingScore !== null ? editingScore : scanToReview.rawScore;
                                  const p = Math.round((s / scanToReview.maxScore) * 100);
                                  if (p >= 90) return 'A';
                                  if (p >= 80) return 'B';
                                  if (p >= 70) return 'C';
                                  if (p >= 60) return 'D';
                                  return 'F';
                                })()}
                             </span>
                          </div>
                       </div>
                    </div>

                    <div>
                       <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Extracted Markings</label>
                       <div className="grid grid-cols-5 gap-2">
                          {Array.from({ length: scanToReview.maxScore }).map((_, i) => {
                            const qNum = i + 1;
                            const ans = scanToReview.responses?.[qNum];
                            const correct = selectedTest?.answerKey?.[qNum] || '';
                            const isCorrect = !!ans && ans.toLowerCase().trim() === correct.toLowerCase().trim();
                            return (
                              <div key={i} className={`flex flex-col items-center justify-center p-1 rounded-lg border text-[10px] font-bold overflow-hidden ${!ans || ans === '?' ? 'bg-error/10 border-error' : isCorrect ? 'bg-success/10 border-success' : 'bg-error/5 border-error/50'}`}>
                                 <span className="opacity-40">{qNum}</span>
                                 <span className="truncate w-full text-center px-0.5" title={ans || '?'}>{ans || '?'}</span>
                              </div>
                            );
                          })}
                       </div>
                    </div>

                    <div className="mt-auto flex flex-col gap-3 pt-4">
                       <button 
                         onClick={() => {
                           handleUpdateScore(scanToReview.id, editingScore ?? scanToReview.rawScore);
                           setReviewScanId(null);
                           setEditingScore(null);
                         }}
                         className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg active:scale-95"
                       >
                         SAVE CHANGES
                       </button>
                    </div>
                 </div>
              </div>
           </motion.div>
        </div>
      )}

      {/* Answer Key Editor Modal */}
      {isEditingKey && selectedTest && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 md:p-8">
          <div className="bg-surface w-full max-w-2xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl relative overflow-hidden text-on-surface">
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-xl font-bold text-primary">Answer Key</h2>
                <p className="text-sm text-on-surface-variant mt-1">{selectedTest.name}</p>
              </div>
              <button 
                onClick={() => setIsEditingKey(false)}
                className="w-10 h-10 rounded-full hover:bg-surface-container flex justify-center items-center transition-colors text-on-surface"
               >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-surface-container-lowest">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                 {Array.from({ length: selectedTest.numQuestions }).map((_, i) => {
                   const qNum = i + 1;
                   const qFormats = selectedTest.sections ? selectedTest.sections.flatMap(sec => Array.from({ length: sec.count }).fill(sec.format) as string[]) : [];
                   const rowFormat = qFormats[qNum - 1] || selectedTest.format;
                   const options = getOptions(rowFormat);
                   const isMultiple = rowFormat.endsWith('-M');
                   const isMissing = !localKey[qNum] || localKey[qNum] === '';
                   
                   return (
                     <div key={qNum} className={`flex flex-col items-center p-3 rounded-lg border shadow-sm transition-colors ${isMissing ? 'bg-error-container/10 border-error-container/50' : 'bg-surface border-outline-variant'}`}>
                       <span className={`text-[11px] font-bold font-mono mb-2 ${isMissing ? 'text-error' : 'text-on-surface-variant'}`}>Q{qNum}</span>
                       {rowFormat === 'SA' ? (
                          <input 
                            type="text" 
                            value={localKey[qNum] || ''}
                            onChange={(e) => setLocalKey(prev => ({ ...prev, [qNum]: e.target.value }))}
                            placeholder="Answer"
                            className="w-[100px] text-center h-7 text-[11px] font-bold border border-outline-variant rounded-sm px-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-on-surface bg-surface"
                          />
                       ) : (
                       <div className="flex gap-1.5 flex-wrap justify-center">
                         {options.map(opt => {
                           const currentSelected = localKey[qNum] ? localKey[qNum].split(',') : [];
                           const isSelected = currentSelected.includes(opt);
                           
                           return (
                             <button
                               key={opt}
                               onClick={() => setLocalKey(prev => {
                                 if (isMultiple) {
                                   let newSelected = [...currentSelected];
                                   if (isSelected) {
                                     newSelected = newSelected.filter(o => o !== opt);
                                   } else {
                                     newSelected.push(opt);
                                   }
                                   newSelected.sort();
                                   return { ...prev, [qNum]: newSelected.join(',') };
                                 } else {
                                   return { ...prev, [qNum]: prev[qNum] === opt ? '' : opt };
                                 }
                               })}
                               className={`w-7 h-7 rounded-sm font-bold text-[11px] flex items-center justify-center transition-colors ${
                                 isSelected 
                                   ? 'bg-primary text-white border-primary border' 
                                   : 'bg-surface text-on-surface border border-outline-variant hover:border-primary hover:text-primary hover:bg-primary/5'
                               }`}
                             >
                               {opt}
                             </button>
                           );
                         })}
                       </div>
                       )}
                     </div>
                   );
                 })}
              </div>
            </div>
            
            <div className="p-4 border-t border-outline-variant bg-surface-container flex justify-between items-center shrink-0">
              <div className="text-sm font-medium text-error">
                {Array.from({ length: selectedTest.numQuestions }).filter((_, i) => !localKey[i + 1] || localKey[i + 1] === '').length > 0 && 
                  `${Array.from({ length: selectedTest.numQuestions }).filter((_, i) => !localKey[i + 1] || localKey[i + 1] === '').length} questions missing answers`
                }
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsEditingKey(false)}
                  className="px-6 py-2 rounded-full font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveKey}
                  disabled={Array.from({ length: selectedTest.numQuestions }).filter((_, i) => !localKey[i + 1] || localKey[i + 1] === '').length > 0}
                  className="px-8 py-2 rounded-full font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Review & Cropping Modal */}
      <AnimatePresence>
        {isReviewingImage && capturedImage && (
          <div className="fixed inset-0 bg-black/95 z-[70] flex flex-col items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface w-full max-w-4xl max-h-full rounded-3xl overflow-hidden flex flex-col shadow-2xl relative text-on-surface"
            >
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
                <div>
                   <h2 className="text-xl font-bold text-on-surface">Review & Alignment</h2>
                   <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mt-1">Adjust crop to fit the bubble sheet</p>
                </div>
                <div className="flex gap-2">
                   <button 
                     onClick={handleRetake}
                     className="px-4 py-2 bg-surface-container text-on-surface font-bold text-sm rounded-xl hover:bg-surface-variant transition-all flex items-center gap-2"
                   >
                     <span className="material-symbols-outlined text-[18px]">replay</span>
                     RETAKE
                   </button>
                   <button 
                     onClick={() => setIsReviewingImage(false)}
                     className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center transition-colors"
                   >
                     <span className="material-symbols-outlined">close</span>
                   </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-black/20 flex items-center justify-center p-4">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1 / 1.4}
                  className="max-h-full"
                >
                  <img 
                    ref={imgRef}
                    src={capturedImage} 
                    onLoad={onImageLoad} 
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                </ReactCrop>
              </div>

              <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-between items-center">
                 <div className="flex items-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined">info</span>
                    <span className="text-xs font-medium">Ensure all black squares and bubbles are within the selection.</span>
                 </div>
                 <div className="flex gap-3">
                    <button 
                      onClick={handleConfirmCrop}
                      className="px-8 py-3 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 hover:shadow-lg transition-all flex items-center gap-2 active:scale-95"
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      START GRADING
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
