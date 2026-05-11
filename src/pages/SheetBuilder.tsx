import React, { useState, useEffect, useRef } from 'react';
import { useStore, QuestionFormat, TestSection } from '../store';
import { useNavigate, useLocation } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import { generatePDF } from '../lib/pdfGenerator';
import { Reorder, motion } from 'motion/react';

export function SheetBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const editingTestId = (location.state as { editingTestId?: string })?.editingTestId;
  const initialImportPdf = (location.state as { importPdf?: boolean })?.importPdf;
  
  const tests = useStore(state => state.tests);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isImporting, setIsImporting] = useState(initialImportPdf || false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [sections, setSections] = useState<TestSection[]>([
    { id: crypto.randomUUID(), count: 50, format: 'A-D' }
  ]);
  const [testName, setTestName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [includeStudentId, setIncludeStudentId] = useState(true);
  const [extractedAnswerKey, setExtractedAnswerKey] = useState<Record<number, string>>({});
  
  const addTest = useStore(state => state.addTest);
  const updateTest = useStore(state => state.updateTest);

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    setImportError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      // Extract metadata
      const title = pdfDoc.getTitle();
      const subject = pdfDoc.getSubject();
      const author = pdfDoc.getAuthor();

      setTestName(title && title !== 'Assessment' ? title : file.name.replace('.pdf', ''));
      setCourseName(subject && subject !== 'Test Template' ? subject : '');
      setInstructorName(author && author !== 'GradeStack' ? author : '');
      
      const keywordsStr = pdfDoc.getKeywords() || '';
      let parsedMetadata: any = null;
      try {
        if (keywordsStr) {
          const kw = typeof keywordsStr === 'string' ? keywordsStr : keywordsStr[0];
          if (kw) parsedMetadata = JSON.parse(kw);
        }
      } catch (e) {}

      if (parsedMetadata && parsedMetadata.sections) {
         setSections(parsedMetadata.sections);
         if (parsedMetadata.hasOwnProperty('includeStudentId')) {
            setIncludeStudentId(parsedMetadata.includeStudentId);
         }
         setIsImporting(false);
         return;
      }

      // Group fields by question number
      const questionMap = new Map<number, { format: QuestionFormat; options: Set<string> }>();
      
      fields.forEach(field => {
        const name = field.getName();
        const parts = name.split('.'); // q.1 or q.1.A
        if (parts[0] === 'q' && parts[1]) {
          const qNum = parseInt(parts[1]);
          if (!isNaN(qNum)) {
            if (!questionMap.has(qNum)) {
              let initialFormat: QuestionFormat = 'A-D';
              if (field.constructor.name === 'PDFTextField') initialFormat = 'SA';
              questionMap.set(qNum, { format: initialFormat, options: new Set() });
            }
            const qData = questionMap.get(qNum)!;
            if (parts[2]) {
              // It's a multiple choice checkbox
              qData.options.add(parts[2]);
            } else if (field.constructor.name === 'PDFRadioGroup') {
              try {
                const options = (field as any).getOptions();
                if (options) {
                  options.forEach((opt: string) => qData.options.add(opt));
                }
              } catch (e) {}
            }
          }
        }
      });

      const maxQ = Math.max(...Array.from(questionMap.keys()), 0);
      if (maxQ === 0) {
        throw new Error("No valid bubble sheet fields found. Make sure this PDF was exported from this app.");
      }

      // Infer formats
      questionMap.forEach((qData) => {
         if (qData.format === 'SA') return;
         if (qData.options.has('T')) {
            qData.format = 'TF';
         } else if (qData.options.has('E')) {
            qData.format = qData.options.size > 0 && Array.from(qData.options).length > 0 && Array.from(qData.options).some(o => o === 'A') && !qData.format.endsWith('-M') && qData.options.has('E') && Array.from(qData.options).length === 5 ? (qData.options.has('A') ? 'A-E' : 'A-E-M') : 'A-E'; // Rough fallback, actually we can check if it's checkboxes
         } else if (qData.options.size === 4 && qData.options.has('D')) {
            qData.format = 'A-D';
         }
      });
      
      // We can check if it has checkboxes vs radio groups via checking if elements like `q.1.A` exist which implies it's a multiple choice.
      fields.forEach(field => {
        const name = field.getName();
        const parts = name.split('.');
        if (parts[0] === 'q' && parts[1] && parts[2]) {
           const qNum = parseInt(parts[1]);
           if (!isNaN(qNum) && questionMap.has(qNum)) {
             const format = questionMap.get(qNum)!.format;
             if (format === 'A-D') questionMap.get(qNum)!.format = 'A-D-M';
             if (format === 'A-E') questionMap.get(qNum)!.format = 'A-E-M';
           }
        }
      });

      // Reconstruct sections (group contiguous questions with the same format)
      const importedSections: TestSection[] = [];
      let currentSection: TestSection | null = null;

      for (let i = 1; i <= maxQ; i++) {
        const qFormat = questionMap.get(i)?.format || 'A-D';
        if (!currentSection || currentSection.format !== qFormat) {
          if (currentSection) {
            importedSections.push(currentSection);
          }
          currentSection = { id: crypto.randomUUID(), count: 1, format: qFormat };
        } else {
          currentSection.count = (currentSection.count as number) + 1;
        }
      }
      if (currentSection) {
        importedSections.push(currentSection);
      }
      setSections(importedSections);
      setIsImporting(false);
    } catch (err) {
      console.error(err);
      setImportError("Failed to parse PDF. Only PDFs exported from this app can be re-imported without AI.");
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Load test data if editing
  useEffect(() => {
    if (editingTestId && tests.length > 0 && !hasLoaded) {
      const test = tests.find(t => t.id === editingTestId);
      if (test) {
        setTestName(test.name);
        setCourseName(test.courseName || '');
        setInstructorName(test.instructorName || '');
        setIncludeStudentId(test.includeStudentId !== false);
        if (test.sections && test.sections.length > 0) {
          setSections(test.sections);
        }
        setHasLoaded(true);
      }
    }
  }, [editingTestId, tests, hasLoaded]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (manualZoom !== null) return;
      
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width < 840) {
          setScale(Math.max((width - 40) / 800, 0.2));
        } else {
          setScale(1);
        }
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [manualZoom]);
  
  const effectiveScale = manualZoom !== null ? manualZoom : scale;
  
  const numQuestions = sections.reduce((acc, s) => acc + (parseInt(s.count as any) || 0), 0);
  const questionFormats = sections.flatMap(sec => Array.from({ length: parseInt(sec.count as any) || 0 }).fill(sec.format) as QuestionFormat[]);
  
  const getOptions = (f: QuestionFormat) => f === 'SA' ? [] : f.startsWith('A-D') ? ['A', 'B', 'C', 'D'] : f.startsWith('A-E') ? ['A', 'B', 'C', 'D', 'E'] : ['T', 'F'];

  const handlePrint = async () => {
    setIsGeneratingPdf(true);
    await generatePDF({
      name: testName,
      courseName,
      instructorName,
      includeStudentId,
      sections,
      numQuestions,
    }, 
    () => setIsGeneratingPdf(false),
    () => setIsGeneratingPdf(false));
  };

  const handleSave = async () => {
    const testData = {
      name: testName || 'Untitled Assessment',
      courseName,
      instructorName,
      numQuestions,
      format: sections.length > 0 ? sections[0].format : 'A-D', // legacy field
      sections,
      includeStudentId
    };

    if (editingTestId) {
      await updateTest(editingTestId, testData);
    } else {
      await addTest({
        ...testData,
        answerKey: extractedAnswerKey
      });
    }
    navigate('/');
  };

  const renderBubbleRow = (num: number, index: number) => {
    const isFifth = (index + 1) % 5 === 0;
    const qFormat = questionFormats[num - 1] || 'A-D';
    const ops = getOptions(qFormat);
    const isMultiple = qFormat.endsWith('-M');
    
    if (qFormat === 'SA') {
      return (
        <div key={num} className={`flex items-start gap-[4px] mt-[2px] ${isFifth ? 'mb-[12px]' : 'mb-[2px]'}`}>
          <span className="font-mono text-on-surface w-7 text-right select-none font-bold text-sm tracking-tighter pt-1">{num}.</span>
          <div className="flex-1 mt-[10px] mr-4 select-none">
            <div className="border-b-[1.5px] border-[#444] w-full"></div>
            <div className="text-[7px] text-gray-400 mt-0.5 uppercase font-bold tracking-widest text-center">Short Answer</div>
          </div>
        </div>
      );
    }

    return (
      <div key={num} className={`flex items-center gap-[4px] mt-[2px] ${isFifth ? 'mb-[12px]' : 'mb-[2px]'}`}>
        <span className="font-mono text-on-surface w-7 text-right select-none font-bold text-sm tracking-tighter">{num}.</span>
        <div className="flex gap-[5px]">
          {ops.map(opt => (
            <label 
              key={opt}
              className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#444] flex items-center justify-center font-bold text-[9px] text-[#444] cursor-pointer relative select-none bg-transparent transition-colors hover:bg-surface-container-lowest hover:border-primary hover:text-primary"
            >
              <input 
                type={isMultiple ? "checkbox" : "radio"} 
                name={`question-${num}`} 
                value={opt} 
                className="peer absolute opacity-0 w-full h-full cursor-pointer z-30"
              />
              <span className="pointer-events-none z-20 w-full h-full flex justify-center items-center rounded-full transition-all peer-checked:bg-[#444] peer-checked:text-white peer-checked:border-[#444]">
                {opt}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const maxQuestionsPerPage = 80;
  const numPages = Math.max(1, Math.ceil(numQuestions / maxQuestionsPerPage));
  
  const pages = [];
  for (let p = 0; p < numPages; p++) {
    const startQ = p * maxQuestionsPerPage + 1;
    const endQ = Math.min((p + 1) * maxQuestionsPerPage, numQuestions);
    
    // Split into columns
    const columnCount = 4;
    const rowsPerColumn = Math.ceil(maxQuestionsPerPage / columnCount);
    const columns = [];
    
    if (numQuestions > 0) {
      for (let c = 0; c < columnCount; c++) {
        const colStart = startQ + c * rowsPerColumn;
        const colEnd = Math.min(startQ + (c + 1) * rowsPerColumn - 1, endQ);
        if (colStart > endQ) break;
        
        const rows = [];
        for (let i = colStart; i <= colEnd; i++) {
          rows.push(renderBubbleRow(i, i - colStart));
        }
        columns.push(rows);
      }
    } else {
      // Empty state
      columns.push([]);
    }

    pages.push(
      <div key={p} className="mb-8 print-page-wrapper text-left inline-block" style={{ width: 800 * effectiveScale, height: 1056 * effectiveScale, position: 'relative' }}>
        <div 
          className="paper-sheet shrink-0 bg-white flex flex-col relative overflow-hidden shadow-2xl print-page"
          style={{ transform: `scale(${effectiveScale})`, transformOrigin: 'top left', width: 800, height: 1056, position: 'absolute', top: 0, left: 0, padding: 40 }}
        >
          <div className="w-full bg-[#1A659E] text-white p-4 flex justify-between items-center rounded-sm">
             <h3 className="font-bold text-2xl uppercase tracking-wider">{testName || 'Untitled Assessment'}</h3>
             <span className="font-bold text-sm">PAGE {p + 1} OF {numPages}</span>
          </div>

          <div className="flex justify-between items-start mt-6 w-full">
            <div className="flex-1 pr-6 flex flex-col gap-1">
              {(courseName || instructorName) && (
                <div className="mb-4">
                  {courseName && <p className="font-bold text-sm text-gray-800 uppercase">COURSE: {courseName}</p>}
                  {instructorName && <p className="font-bold text-sm text-gray-800 uppercase">INSTRUCTOR: {instructorName}</p>}
                </div>
              )}
              <p className="font-bold text-[13px] text-[#1A659E] uppercase tracking-wide">INSTRUCTIONS: Use a No. 2 pencil. Fill circles completely.</p>
            </div>
            
            {includeStudentId && p === 0 && (
              <div className="border-2 border-[#1A659E] rounded-sm w-[300px] h-[75px] p-3 flex flex-col justify-between shrink-0 relative">
                <div className="flex items-end gap-2">
                   <span className="font-bold text-[10px] text-[#1A659E]">STUDENT NAME:</span>
                   <div className="flex-1 border-b border-gray-400"></div>
                </div>
                <div className="flex items-end gap-2">
                   <span className="font-bold text-[10px] text-[#1A659E]">DATE:</span>
                   <div className="flex-1 border-b border-gray-400"></div>
                </div>
              </div>
            )}
          </div>
          
          <div className="w-full border-b-[3px] border-[#1A659E] mt-3 mb-4"></div>
        
          <div className="flex-1 grid grid-cols-4 gap-x-8 gap-y-0 content-start min-h-0 relative">
            <div className="absolute top-2 bottom-0 left-1/4 border-l border-gray-200"></div>
            <div className="absolute top-2 bottom-0 left-2/4 border-l border-gray-200"></div>
            <div className="absolute top-2 bottom-0 left-3/4 border-l border-gray-200"></div>
            
            {columns.map((col, idx) => (
              <div key={idx} className="flex flex-col gap-0 justify-start pl-2 z-10 bg-white">
                {col}
              </div>
            ))}
            {numQuestions === 0 && (
              <div className="col-span-4 mt-20 text-center text-on-surface-variant opacity-50 italic">
                Fields will populate here when you add questions
              </div>
            )}
          </div>

          <div className="mt-auto pt-sm flex justify-between items-center text-gray-400 font-bold shrink-0">
            <span className="text-[10px]">FORM A</span>
            <span className="text-[10px]">GRADESTACK</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden w-full h-full relative bg-surface-container-low">
      {isImporting && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col"
          >
            <div className="p-8 text-center border-b border-outline-variant">
               <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="material-symbols-outlined text-4xl">picture_as_pdf</span>
               </div>
               <h2 className="text-2xl font-bold text-on-surface">Restore Sheet Template</h2>
               <p className="text-on-surface-variant mt-2">Upload a GradeStack PDF to recover its configuration and structure.</p>
            </div>
            
            <div className="p-8">
               {isProcessingPdf ? (
                 <div className="flex flex-col items-center py-10">
                    <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-6"></div>
                    <p className="font-bold text-primary animate-pulse">READING DOCUMENT...</p>
                    <p className="text-sm text-on-surface-variant mt-2">Extracting form fields and metadata.</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                    <label className="block border-2 border-dashed border-outline-variant rounded-2xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group">
                       <input type="file" accept="application/pdf" onChange={handleImportPdf} className="hidden" />
                       <span className="material-symbols-outlined text-4xl text-on-surface-variant group-hover:text-primary transition-colors mb-2">cloud_upload</span>
                       <p className="font-bold text-on-surface group-hover:text-primary transition-colors">Click to upload GradeStack PDF</p>
                       <p className="text-xs text-on-surface-variant mt-1 font-mono uppercase opacity-60">RESTORATION PDF</p>
                    </label>
                    
                    {importError && (
                      <div className="p-4 bg-error-container text-error rounded-xl flex items-center gap-3 text-sm font-medium">
                         <span className="material-symbols-outlined">error</span>
                         {importError}
                      </div>
                    )}
                 </div>
               )}
            </div>
            
            {!isProcessingPdf && (
              <div className="p-6 bg-surface-container-low flex justify-end gap-3">
                 <button 
                   onClick={() => setIsImporting(false)}
                   className="px-6 py-3 text-on-surface-variant font-bold hover:bg-surface-container rounded-xl transition-all"
                 >
                   CANCEL
                 </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      <section className="w-full md:w-80 lg:w-[380px] flex-shrink-0 bg-surface border-r border-outline-variant overflow-y-auto p-6 flex flex-col gap-8 z-10 relative shadow-sm">
        <header className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-on-surface mb-1" id="sheet-designer-title">Sheet Designer</h2>
            <p className="text-sm text-on-surface-variant">Configure your custom assessment sheet.</p>
          </div>
          {!editingTestId && (
            <button 
              onClick={() => setIsImporting(true)}
              className="mt-1 p-2 text-primary hover:bg-primary/10 rounded-lg transition-all border border-primary/20 flex flex-col items-center gap-0.5"
              title="Restore from PDF"
              id="restore-pdf-btn-sidebar"
            >
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              <span className="text-[9px] font-bold">RE-IMPORT</span>
            </button>
          )}
        </header>
        
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
               <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px]">1</span>
               Assessment Details
            </div>
            <div className="grid gap-4 bg-surface-container-low p-4 rounded-xl border border-outline-variant/50">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5" htmlFor="test-name">Test Name</label>
                <input 
                  id="test-name" type="text" 
                  value={testName}
                  placeholder="e.g. Quarter 1 Final"
                  onChange={(e) => setTestName(e.target.value)}
                  className="w-full h-11 px-3 border border-outline-variant rounded-lg font-medium text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none bg-surface transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5" htmlFor="course-name">Course (Optional)</label>
                <input 
                  id="course-name" type="text" 
                  value={courseName}
                  placeholder="e.g. Advanced Mathematics"
                  onChange={(e) => setCourseName(e.target.value)}
                  className="w-full h-11 px-3 border border-outline-variant rounded-lg font-medium text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none bg-surface transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase mb-1.5" htmlFor="instructor-name">Instructor (Optional)</label>
                <input 
                  id="instructor-name" type="text" 
                  value={instructorName}
                  placeholder="e.g. Dr. Roberts"
                  onChange={(e) => setInstructorName(e.target.value)}
                  className="w-full h-11 px-3 border border-outline-variant rounded-lg font-medium text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none bg-surface transition-all" 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                 <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px]">2</span>
                 Question Sections
              </div>
              <button 
                onClick={() => setSections([...sections, { id: crypto.randomUUID(), count: 10, format: 'A-D' }])}
                className="text-primary text-[10px] font-bold hover:bg-primary/5 px-2 py-1 rounded-md border border-primary/20 transition-colors uppercase tracking-tight"
              >
                + Add Section
              </button>
            </div>
            
            <Reorder.Group 
              axis="y" 
              values={sections} 
              onReorder={setSections}
              className="space-y-3"
            >
              {sections.map((sec, idx) => (
                <Reorder.Item 
                  key={sec.id} 
                  value={sec}
                  className="p-4 flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface relative group hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">drag_indicator</span>
                      <span className="font-bold text-[11px] text-on-surface-variant uppercase tracking-widest">Section {idx + 1}</span>
                    </div>
                    {sections.length > 1 && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSections(sections.filter(s => s.id !== sec.id));
                        }} 
                        className="text-on-surface-variant hover:text-error hover:bg-error/10 p-1 rounded-md transition-all"
                        title="Remove Section"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3" onPointerDown={e => e.stopPropagation()}>
                    <div>
                       <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase mb-1">Questions</label>
                       <input 
                         type="number" min="1" max="500" 
                         value={sec.count.toString()}
                         onChange={(e) => setSections(sections.map(s => s.id === sec.id ? { ...s, count: parseInt(e.target.value) || 0 } : s))}
                         className="w-full h-9 px-3 border border-outline-variant rounded-lg text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" 
                       />
                    </div>
                    <div>
                       <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase mb-1">Format</label>
                       <select 
                         value={sec.format}
                         onChange={(e) => setSections(sections.map(s => s.id === sec.id ? { ...s, format: e.target.value as QuestionFormat } : s))}
                         className="w-full h-9 px-2 border border-outline-variant rounded-lg text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 bg-surface"
                       >
                         <option value="A-D">A, B, C, D</option>
                         <option value="A-E">A, B, C, D, E</option>
                         <option value="A-D-M">A-D (Choose Multiple)</option>
                         <option value="A-E-M">A-E (Choose Multiple)</option>
                         <option value="TF">T / F</option>
                         <option value="SA">Short Answer</option>
                       </select>
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
              <div className="flex justify-between items-center px-2 py-1">
                 <span className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">Total Items</span>
                 <span className="text-lg font-bold text-primary">{numQuestions}</span>
              </div>
            </div>

          <div className="pt-4 border-t">
            <label className="flex items-center justify-between cursor-pointer group px-2">
              <span className="text-sm font-bold text-on-surface uppercase tracking-tight">Include Student ID</span>
              <div className="relative">
                <input 
                  type="checkbox" className="sr-only" 
                  checked={includeStudentId}
                  onChange={(e) => setIncludeStudentId(e.target.checked)}
                />
                <div className={`block w-11 h-6 rounded-full transition-colors ${includeStudentId ? 'bg-primary' : 'bg-outline-variant'}`}></div>
                <div className={`dot absolute top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${includeStudentId ? 'translate-x-6' : 'translate-x-1'}`}></div>
              </div>
            </label>
          </div>

          <div className="mt-auto pt-8 flex flex-col gap-3 pb-4">
          <button 
            onClick={handlePrint} 
            disabled={isGeneratingPdf}
            className="w-full h-12 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGeneratingPdf ? (
               <span className="material-symbols-outlined animate-spin">sync</span>
            ) : (
               <span className="material-symbols-outlined">description</span>
            )}
            {isGeneratingPdf ? 'GENERATING...' : 'DOWNLOAD PDF'}
          </button>
          <button onClick={handleSave} className="w-full h-12 bg-surface text-primary border-2 border-primary/20 font-bold rounded-xl hover:bg-primary/5 hover:border-primary/40 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">save</span>
            SAVE TEMPLATE
          </button>
        </div>
      </section>

      <section className="flex-1 overflow-auto bg-surface-container-low preview-container relative flex flex-col items-center" id="printable-area" ref={containerRef}>
        <div className="flex flex-col items-center w-full py-10 px-10">
          <div className="sticky top-4 z-20 flex mx-auto bg-surface/80 backdrop-blur-md border border-outline-variant rounded-full shadow-lg overflow-hidden mb-10 shrink-0 p-1">
            <button onClick={() => setManualZoom(Math.max(0.2, effectiveScale - 0.1))} className="w-10 h-10 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center text-on-surface" title="Zoom Out">
              <span className="material-symbols-outlined text-[20px]">remove</span>
            </button>
            <span className="px-4 font-mono text-sm font-bold flex items-center justify-center w-20 select-none text-primary">{Math.round(effectiveScale * 100)}%</span>
            <button onClick={() => setManualZoom(Math.min(2, effectiveScale + 0.1))} className="w-10 h-10 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center text-on-surface" title="Zoom In">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
            <div className="w-px h-6 bg-outline-variant my-auto mx-1"></div>
            <button onClick={() => setManualZoom(null)} className="w-10 h-10 rounded-full hover:bg-surface-container transition-colors flex items-center justify-center text-on-surface" title="Fit to Screen">
              <span className="material-symbols-outlined text-[20px]">fit_screen</span>
            </button>
          </div>
          
          <div className="flex flex-col items-center justify-center w-full perspective-[1000px]">
            {pages}
          </div>
        </div>
      </section>
    </div>
  );
}
