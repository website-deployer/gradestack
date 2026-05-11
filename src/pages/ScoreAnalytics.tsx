import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export function ScoreAnalytics() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const testId = searchParams.get('testId');
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);
  
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');

  const test = tests.find(t => t.id === testId) || tests[0];
  const allTestScans = test ? scans.filter(s => s.testId === test.id) : [];
  
  // Get unique batches
  const batches = Array.from(new Set(allTestScans.map(s => s.batchName).filter(Boolean))) as string[];
  
  const testScans = selectedBatch ? allTestScans.filter(s => s.batchName === selectedBatch) : allTestScans;

  if (!test) {
    const isNoTests = tests.length === 0;
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 max-w-2xl mx-auto text-center">
        <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mb-8">
          <span className="material-symbols-outlined text-[48px] text-primary opacity-40">{isNoTests ? 'library_books' : 'analytics'}</span>
        </div>
        <h2 className="text-3xl font-bold text-on-surface mb-3 tracking-tight">
          {isNoTests ? 'No Assessments Yet' : 'Assessment Not Found'}
        </h2>
        <p className="text-lg text-on-surface-variant mb-10 max-w-md mx-auto">
          {isNoTests
            ? 'Create your first assessment to start tracking student performance.'
            : "We couldn't locate the assessment data you're looking for. It may have been renamed or no longer exists."
          }
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          {!isNoTests && (
            <Link 
              to="/history" 
              className="px-8 py-3.5 bg-surface text-primary border-2 border-primary/20 rounded-2xl font-bold hover:bg-primary/5 transition-all text-sm uppercase tracking-widest shadow-sm"
            >
              Review History
            </Link>
          )}
          <Link 
            to="/builder" 
            className="px-8 py-3.5 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all text-sm uppercase tracking-widest shadow-lg shadow-primary/20"
          >
            Create New Test
          </Link>
        </div>
      </div>
    );
  }

  const numScanned = testScans.length;
  const avgPct = numScanned > 0 ? (testScans.reduce((acc, s) => acc + s.percentage, 0) / numScanned).toFixed(1) : '0';
  const highScore = numScanned > 0 ? Math.max(...testScans.map(s => s.percentage)) : 0;
  const lowScore = numScanned > 0 ? Math.min(...testScans.map(s => s.percentage)) : 0;
  const highRaw = numScanned > 0 ? testScans.find(s => s.percentage === highScore)?.rawScore : 0;
  
  // Calculate distribution
  const dist = {
    '<50': testScans.filter(s => s.percentage < 50).length,
    '50-59': testScans.filter(s => s.percentage >= 50 && s.percentage < 60).length,
    '60-69': testScans.filter(s => s.percentage >= 60 && s.percentage < 70).length,
    '70-79': testScans.filter(s => s.percentage >= 70 && s.percentage < 80).length,
    '80-89': testScans.filter(s => s.percentage >= 80 && s.percentage < 90).length,
    '90-100': testScans.filter(s => s.percentage >= 90).length,
  };
  const maxInDist = Math.max(...Object.values(dist), 1);

  // Calculate question accuracy
  const questionStats = Array.from({ length: test.numQuestions }).map((_, i) => {
    const qNum = i + 1;
    const answeredCount = testScans.filter(s => s.responses && s.responses[qNum]).length;
    const correctCount = testScans.filter(s => s.responses && s.responses[qNum] === test.answerKey?.[qNum]).length;
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    
    // Guessing a relevant tag / title based on position if sections exist
    let title = `Question ${qNum}`;
    return { q: String(qNum).padStart(2, '0'), text: title, correct: accuracy };
  }).sort((a, b) => a.correct - b.correct);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full flex-1">
      <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div>
          <nav aria-label="Breadcrumb" className="flex text-on-surface-variant font-bold text-[10px] uppercase tracking-widest mb-3">
            <ol className="inline-flex items-center space-x-2">
              <li className="inline-flex items-center">
                <Link to="/history" className="hover:text-primary transition-colors">Test History</Link>
              </li>
              <li>
                <div className="flex items-center">
                  <span className="material-symbols-outlined text-[14px] mx-1 opacity-50">chevron_right</span>
                  <span className="text-on-surface">{test.name}</span>
                </div>
              </li>
            </ol>
          </nav>
          <h2 className="text-display text-on-background">{test.name}</h2>
          <p className="text-lg text-on-surface-variant mt-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            {new Date(test.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-end gap-4">
          {batches.length > 0 && (
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">BATCH:</span>
               <select 
                 value={selectedBatch || ''} 
                 onChange={(e) => setSelectedBatch(e.target.value || null)}
                 className="bg-surface border border-outline-variant text-on-surface rounded-xl px-4 py-3 font-bold focus:ring-2 outline-none transition-all cursor-pointer shadow-sm text-sm"
               >
                 <option value="">All Batches</option>
                 {batches.map(b => <option key={b} value={b}>{b}</option>)}
               </select>
            </div>
          )}
          <Link to={`/scan?testId=${test.id}`} className="bg-primary text-white font-bold rounded-xl py-3 px-6 flex items-center gap-2 hover:bg-primary/90 transition-all shadow-md active:scale-95">
            <span className="material-symbols-outlined text-[20px]">photo_camera</span>
            CONTINUE SCANNING
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
        <div className="col-span-1 lg:col-span-4 bg-primary text-white rounded-2xl p-8 flex flex-col justify-between shadow-xl relative overflow-hidden group">
          <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform transform rotate-12">
             <span className="material-symbols-outlined text-[180px]">analytics</span>
          </div>
          <div className="relative z-10">
            <p className="text-[10px] items-center gap-1 font-bold text-white/60 uppercase tracking-widest mb-6 flex">
               <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
               Performance Index
            </p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-6xl font-bold tracking-tighter">{numScanned > 0 ? `${avgPct}%` : 'N/A'}</h3>
            </div>
          </div>
          <div className="mt-8 relative z-10">
            <div className="w-full bg-white/10 rounded-full h-2 mb-4 overflow-hidden">
              <div className="bg-white h-full rounded-full transition-all duration-1000" style={{ width: `${numScanned > 0 ? avgPct : 0}%` }}></div>
            </div>
            <p className="text-xs font-medium text-white/70">
              {numScanned > 0 ? `Class benchmark set ${numScanned} assessments ago` : 'No results in yet'}
            </p>
          </div>
        </div>
        
        <div className="col-span-1 lg:col-span-4 bg-surface border border-outline-variant rounded-2xl p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-6">Quality metrics</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-5xl font-bold text-primary tracking-tighter">{numScanned > 0 ? `${highScore}%` : 'N/A'}</h3>
              <span className="text-body-sm text-on-surface-variant font-medium">
                {numScanned > 0 ? `${highRaw} of ${test.numQuestions} items` : 'No results in'}
              </span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-outline-variant pt-4">
            <div className="flex flex-col">
               <span className="text-[10px] font-bold text-on-surface-variant uppercase">Lowest Result</span>
               <span className="text-xl font-bold text-primary">{numScanned > 0 ? `${lowScore}%` : 'N/A'}</span>
            </div>
            <div className="w-12 h-12 bg-primary/5 rounded-full flex items-center justify-center">
               <span className="material-symbols-outlined text-primary">emoji_events</span>
            </div>
          </div>
        </div>
        
        <div className="col-span-1 lg:col-span-4 bg-surface border border-outline-variant rounded-2xl p-8 flex flex-col justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-6">Participation</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-5xl font-bold text-primary tracking-tighter">{numScanned}</h3>
              <span className="text-lg font-bold text-on-surface-variant uppercase tracking-tighter">Students</span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-outline-variant flex items-center gap-2">
             <div className="flex -space-x-2.5">
                {[
                  { id: 1, bg: 'bg-indigo-500' },
                  { id: 2, bg: 'bg-blue-500' },
                  { id: 3, bg: 'bg-cyan-500' },
                  { id: 4, bg: 'bg-teal-500' }
                ].map(item => (
                  <div key={item.id} className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface ${item.bg} text-white text-[11px] font-bold shadow-sm transition-all hover:z-10 hover:-translate-y-1`}>
                    {item.id % 10 === 1 ? 'A' : item.id % 10 === 2 ? 'B' : item.id % 10 === 3 ? 'C' : 'D'}
                  </div>
                ))}
                {numScanned > 4 && (
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-surface-container-high text-on-surface-variant text-[11px] font-bold shadow-sm">
                    +{numScanned - 4}
                  </div>
                )}
             </div>
             <div className="flex flex-col ml-2">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Active Dataset</span>
                <span className="text-[10px] font-medium text-on-surface-variant">Validated Participation</span>
             </div>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-8 bg-surface border border-outline-variant rounded-2xl p-8 shadow-sm">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold text-on-background">Score Distribution</h3>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Global frequency</span>
          </div>
          <div className="h-[250px] flex items-end gap-2 border-b border-outline-variant pb-1 relative">
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-on-surface-variant/40 font-mono text-[10px] w-6 pb-8">
              <span>{maxInDist}</span><span>{Math.floor(maxInDist/2)}</span><span>0</span>
            </div>
            <div className="flex-1 flex items-end justify-between h-full pl-8 pb-8 relative">
              <div className="absolute top-0 left-8 right-0 border-t border-outline border-dashed opacity-30"></div>
              <div className="absolute top-1/2 left-8 right-0 border-t border-outline border-dashed opacity-30"></div>
              
              {[
                { range: '<50', count: dist['<50'], bg: 'bg-outline-variant/30' },
                { range: '50-59', count: dist['50-59'], bg: 'bg-outline-variant/50' },
                { range: '60-69', count: dist['60-69'], bg: 'bg-primary/20' },
                { range: '70-79', count: dist['70-79'], bg: 'bg-primary/40' },
                { range: '80-89', count: dist['80-89'], bg: 'bg-primary/60' },
                { range: '90-100', count: dist['90-100'], bg: 'bg-primary' },
              ].map((bar, i) => (
                <div key={i} className={`w-full max-w-[50px] rounded-t-lg hover:opacity-80 transition-all relative group shadow-sm ${bar.bg}`} style={{ height: `${Math.max((bar.count / maxInDist) * 100, (bar.count > 0 ? 5 : 0))}%` }}>
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-bold text-on-surface-variant/80 uppercase whitespace-nowrap tracking-tight">{bar.range}</span>
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-10 left-1/2 -translate-x-1/2 bg-on-background text-white text-[11px] font-bold py-1.5 px-3 rounded-lg whitespace-nowrap z-10 shadow-2xl transition-all">
                    {bar.count} Students
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-4 bg-surface border border-outline-variant rounded-2xl flex flex-col shadow-sm">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-2xl">
            <h3 className="text-xl font-bold text-on-background">Item Accuracy</h3>
            <span className="text-[10px] font-bold text-primary bg-white border border-primary/20 px-2.5 py-1 rounded-full uppercase tracking-tighter">Automatic Analysis</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: '300px' }}>
            <ul className="space-y-3">
              {questionStats.slice(0, 10).map((item, i) => (
                <li key={i} className="flex items-center justify-between p-4 border border-outline rounded-xl hover:bg-surface-container-low hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-container text-on-surface font-bold text-sm border border-outline group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-colors">{item.q}</div>
                    <div className="flex flex-col">
                       <span className="text-sm font-bold text-on-surface">{item.text}</span>
                       <span className="text-[10px] font-bold text-on-surface-variant uppercase">{item.correct < 50 ? 'Critical Review' : 'Good Performance'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${item.correct < 50 ? 'text-error' : 'text-primary'}`}>{item.correct}%</p>
                  </div>
                </li>
              ))}
              {questionStats.length === 0 && (
                <div className="text-center py-10 text-on-surface-variant/50 text-sm italic">
                  No scan data available to analyze questions
                </div>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden flex flex-col shadow-sm">
        <div className="px-8 py-6 border-b border-outline-variant bg-surface-container-low flex flex-col sm:flex-row justify-between items-center gap-6">
          <h3 className="text-xl font-bold text-on-background">Student Performance Roster</h3>
          <div className="relative w-full sm:w-80 group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 group-focus-within:text-primary transition-colors text-[20px]">search</span>
            <input 
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-outline bg-surface text-sm font-medium focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all placeholder:text-on-surface-variant/30" 
              placeholder="Search by student identifier..." 
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto w-full table-scroll">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                <th className="py-5 px-8">ID</th>
                <th className="py-5 px-8">Student Name</th>
                <th className="py-5 px-8">Raw Score</th>
                <th className="py-5 px-8">Percentage</th>
                <th className="py-5 px-8">Scale Grade</th>
                <th className="py-5 px-8 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {testScans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-24 text-center">
                    <div className="flex flex-col items-center opacity-30">
                       <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                       <p className="font-bold uppercase tracking-widest text-xs">No records available</p>
                    </div>
                  </td>
                </tr>
              ) : testScans.filter(s => {
                if (!studentSearch) return true;
                const q = studentSearch.toLowerCase();
                return s.studentName.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || (s.batchName && s.batchName.toLowerCase().includes(q));
              }).map((student, i) => (
                <tr key={i} className="border-b last:border-0 border-outline hover:bg-surface-container-low transition-colors group">
                  <td className="py-5 px-8">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs font-bold text-on-surface-variant">{student.studentId}</span>
                      {student.batchName && <span className="text-[9px] px-1.5 py-0.5 bg-outline-variant/30 text-on-surface-variant font-bold rounded w-fit uppercase">{student.batchName}</span>}
                    </div>
                  </td>
                  <td className="py-5 px-8">
                    <div className="flex items-center gap-2">
                       <span className="font-bold text-on-surface">{student.studentName}</span>
                       {student.needsReview && (
                         <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-error/10 text-error text-[9px] font-bold uppercase border border-error/20">
                           <span className="material-symbols-outlined text-[10px]">error</span>
                           Review
                         </span>
                       )}
                    </div>
                  </td>
                  <td className="py-5 px-8">
                     <span className="font-medium text-on-surface-variant">{student.rawScore} / {student.maxScore}</span>
                  </td>
                  <td className="py-5 px-8">
                    <div className="flex items-center gap-3">
                      <span className={`font-bold w-10 ${student.needsReview ? 'text-error' : 'text-primary'}`}>{student.percentage}%</span>
                      <div className="flex-1 max-w-[80px] bg-outline-variant h-1.5 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${student.needsReview ? 'bg-error' : student.percentage >= 90 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${student.percentage}%` }}></div>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-8">
                     <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-xs ${student.needsReview ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
                       {student.grade}
                     </span>
                  </td>
                  <td className="py-5 px-8 text-right">
                    <button 
                      onClick={() => navigate(`/scan?testId=${test.id}&scanId=${student.id}`)}
                      className="text-on-surface-variant hover:text-primary hover:bg-primary/5 p-2 rounded-xl transition-all" 
                      title="View Full Report"
                    >
                      <span className="material-symbols-outlined text-[20px]">visibility</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
