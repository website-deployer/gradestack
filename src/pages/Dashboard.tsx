import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { motion } from 'motion/react';
import { generatePDF } from '../lib/pdfGenerator';

export function Dashboard() {
  const tests = useStore(state => state.tests);
  const scans = useStore(state => state.scans);
  const navigate = useNavigate();

  // Calculate real trends
  const recentTestsWithScans = tests
    .map(test => {
      const testScans = scans.filter(s => s.testId === test.id);
      const avg = testScans.length > 0 ? testScans.reduce((acc, s) => acc + s.percentage, 0) / testScans.length : null;
      return { ...test, avg };
    })
    .filter(t => t.avg !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-5);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex-1"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="mb-8 flex justify-between items-end border-b pb-6">
        <div>
          <h2 className="text-3xl font-bold text-primary">Overview</h2>
          <p className="text-lg text-on-surface-variant mt-1">Welcome back. Performance metrics for your recent assessments.</p>
        </div>
        <div className="hidden sm:flex gap-3">
          <div className="bg-surface border p-3 rounded-lg flex flex-col min-w-[120px]">
             <span className="text-sm text-on-surface-variant">Total Tests</span>
             <span className="text-2xl font-bold text-primary">{tests.length}</span>
          </div>
          <div className="bg-surface border p-3 rounded-lg flex flex-col min-w-[120px]">
             <span className="text-sm text-on-surface-variant">Scans Ready</span>
             <span className="text-2xl font-bold text-success">{scans.length}</span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Link to="/builder" className="group bg-surface border border-outline-variant rounded-2xl p-6 text-left hover:border-primary hover:shadow-xl transition-all duration-300 block relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 transform group-hover:scale-110 group-hover:opacity-20 transition-all text-primary">
            <span className="material-symbols-outlined text-6xl">edit_document</span>
          </div>
          <div className="w-14 h-14 bg-primary/5 text-primary rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>edit_document</span>
          </div>
          <h3 className="text-xl font-bold text-primary mb-2">Create New Sheet</h3>
          <p className="text-sm text-on-surface-variant max-w-[280px]">Design custom bubble sheets tailored for your exams and quizzes.</p>
        </Link>

        <button 
          onClick={() => navigate('/builder', { state: { importPdf: true } })}
          className="group bg-surface border border-outline-variant rounded-2xl p-6 text-left hover:border-primary hover:shadow-xl transition-all duration-300 block relative overflow-hidden w-full"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 transform group-hover:scale-110 group-hover:opacity-20 transition-all text-primary">
            <span className="material-symbols-outlined text-6xl">picture_as_pdf</span>
          </div>
          <div className="w-14 h-14 bg-primary/5 text-primary rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>picture_as_pdf</span>
          </div>
          <h3 className="text-xl font-bold text-primary mb-2 text-left">Restore from PDF</h3>
          <p className="text-sm text-on-surface-variant max-w-[280px] text-left">Re-import a previously exported bubble sheet to use as a template.</p>
        </button>

        <Link to="/scan" className="group bg-surface border border-outline-variant rounded-2xl p-6 text-left hover:border-primary hover:shadow-xl transition-all duration-300 block relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 transform group-hover:scale-110 group-hover:opacity-20 transition-all">
            <span className="material-symbols-outlined text-6xl">document_scanner</span>
          </div>
          <div className="w-14 h-14 bg-success/10 text-success rounded-xl flex items-center justify-center mb-6 group-hover:bg-success group-hover:text-white transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>document_scanner</span>
          </div>
          <h3 className="text-xl font-bold text-primary mb-2">Scan Responses</h3>
          <p className="text-sm text-on-surface-variant max-w-[280px]">Instantly grade completed sheets using high-precision OCR.</p>
        </Link>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-surface border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <h3 className="text-xl font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">history</span>
              Recent Assessments
            </h3>
            <Link to="/history" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
          <div className="overflow-x-auto">
            {tests.length === 0 ? (
              <div className="py-20 px-6 text-center text-on-surface-variant">
                <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-[40px] opacity-30">library_books</span>
                </div>
                <p className="text-xl font-bold opacity-50">No tests created yet.</p>
                <Link to="/builder" className="bg-primary text-on-primary px-6 py-2 rounded-full font-medium mt-6 inline-block hover:bg-primary/90 transition-all">Create your first test</Link>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant border-b">
                    <th className="text-xs uppercase tracking-wider font-bold py-4 px-6">Test Name</th>
                    <th className="text-xs uppercase tracking-wider font-bold py-4 px-6">Date</th>
                    <th className="text-xs uppercase tracking-wider font-bold py-4 px-6">Questions</th>
                    <th className="text-xs uppercase tracking-wider font-bold py-4 px-6 text-right">Format</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {tests.slice(0, 5).map(test => (
                    <tr key={test.id} className="border-b last:border-0 hover:bg-surface-container-low transition-colors group">
                      <td className="py-4 px-6 text-primary font-medium">
                        <Link to={`/analytics?testId=${test.id}`} className="hover:underline">{test.name}</Link>
                      </td>
                      <td className="py-4 px-6 text-on-surface-variant font-mono text-[11px] font-bold opacity-60">
                         {new Date(test.date).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' })}
                      </td>
                      <td className="py-4 px-6"><span className="bg-surface-container-high px-2 py-0.5 rounded font-mono text-xs">{test.numQuestions} Qs</span></td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <Link 
                             to="/builder"
                             state={{ editingTestId: test.id }}
                             className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-md transition-all sm:opacity-0 group-hover:opacity-100 flex items-center justify-center"
                             title="Edit Configuration"
                           >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                           </Link>
                           <button
                             onClick={() => generatePDF(test)}
                             className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-md transition-all sm:opacity-0 group-hover:opacity-100 flex items-center justify-center"
                             title="Download Template"
                           >
                              <span className="material-symbols-outlined text-[18px]">download</span>
                           </button>
                           <Link 
                             to={`/analytics?testId=${test.id}`} 
                             className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-md transition-all"
                             title="View Analytics"
                           >
                              <span className="material-symbols-outlined text-[18px]">analytics</span>
                           </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        
        <div className="bg-surface border border-outline-variant rounded-2xl p-6 flex flex-col shadow-sm">
          <h3 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">trending_up</span>
            Performance
          </h3>
          <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">Class average trends over time.</p>
          
          <div className="flex-1 min-h-[250px] flex items-end relative border-b border-l border-outline-variant pb-1 pl-1 mt-6">
            <div className="absolute -left-8 top-0 h-full flex flex-col justify-between text-[10px] text-on-surface-variant/60 font-mono py-1">
              <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
            </div>
            {recentTestsWithScans.length < 2 ? (
              <div className="absolute inset-0 flex items-center justify-center text-center text-on-surface-variant/40 text-sm px-6">
                Not enough data. Scan at least two assessments to visualize trends.
              </div>
            ) : (
              <div className="w-full h-full flex items-end justify-between px-2 relative">
                <svg className="absolute inset-0 w-full h-[100%] overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.1" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  <path
                    d={`M 0 100 ${recentTestsWithScans.map((t, i) => `L ${(i / (recentTestsWithScans.length - 1)) * 100} ${100 - (t.avg as number)}`).join(' ')} L 100 100 Z`}
                    fill="url(#chartGradient)"
                  />
                  
                  <polyline 
                    className="text-primary transition-all duration-500" 
                    fill="none" 
                    points={recentTestsWithScans.map((t, i) => `${(i / (recentTestsWithScans.length - 1)) * 100},${100 - (t.avg as number)}`).join(' ')} 
                    stroke="currentColor" 
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></polyline>
                  
                  {recentTestsWithScans.map((t, i) => (
                    <circle 
                      key={t.id}
                      className="fill-white stroke-primary stroke-[3] hover:r-6 cursor-pointer transition-all" 
                      cx={(i / (recentTestsWithScans.length - 1)) * 100} 
                      cy={100 - (t.avg as number)} 
                      r="5"
                    >
                      <title>{t.name}: {Math.round(t.avg as number)}%</title>
                    </circle>
                  ))}
                </svg>
              </div>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant/60 font-mono mt-3 px-2">
            {recentTestsWithScans.length >= 2 ? (
              recentTestsWithScans.map((t, i) => <span key={t.id} title={t.name} className="w-4 text-center">T{i+1}</span>)
            ) : (
              <><span>-</span><span>-</span></>
            )}
          </div>
          
          <div className="mt-8 pt-6 border-t border-outline-variant">
             <Link to="/analytics" className="w-full bg-surface-container border hover:bg-surface-container-high transition-colors text-primary font-bold text-xs py-3 rounded-lg flex items-center justify-center gap-2">
                DETAILED ANALYTICS
                <span className="material-symbols-outlined text-sm">open_in_new</span>
             </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
