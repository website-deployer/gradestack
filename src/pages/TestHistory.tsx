import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { generatePDF } from '../lib/pdfGenerator';

export function TestHistory() {
  const tests = useStore(state => state.tests);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTests = useMemo(() => {
    if (!searchQuery) return tests;
    const lowerQuery = searchQuery.toLowerCase();
    return tests.filter(
      test => 
        (test.name && test.name.toLowerCase().includes(lowerQuery)) ||
        (test.courseName && test.courseName.toLowerCase().includes(lowerQuery)) ||
        (test.instructorName && test.instructorName.toLowerCase().includes(lowerQuery))
    );
  }, [tests, searchQuery]);

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto w-full flex-1">
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div>
          <h2 className="text-3xl font-bold text-primary">Test History</h2>
          <p className="text-lg text-on-surface-variant mt-1">Manage and review all your previously generated assessments.</p>
        </div>
        <Link to="/builder" className="bg-primary text-white font-bold rounded-xl py-3 px-6 flex items-center gap-2 hover:bg-primary/90 transition-all shadow-md active:scale-95">
          <span className="material-symbols-outlined text-[20px]">add</span>
          NEW ASSESSMENT
        </Link>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center flex-wrap gap-4">
          <h3 className="text-xl font-bold text-primary">Assessments Archive ({filteredTests.length})</h3>
          <div className="relative w-full sm:w-72 group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 group-focus-within:text-primary transition-colors text-[20px]">search</span>
            <input 
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-outline bg-surface text-sm font-medium focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all placeholder:text-on-surface-variant/40" 
              placeholder="Search by name, course or instructor..." 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto table-scroll">
          {filteredTests.length === 0 ? (
            <div className="py-24 px-6 text-center text-on-surface-variant">
              <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-6">
                 <span className="material-symbols-outlined text-[48px] opacity-20">library_books</span>
              </div>
              <p className="text-xl font-bold opacity-40 uppercase tracking-widest">No assessments found</p>
              {!searchQuery && <Link to="/builder" className="bg-primary text-white px-8 py-3 rounded-full font-bold mt-8 inline-block hover:bg-primary/90 transition-all shadow-lg uppercase text-xs tracking-wider">Create test template</Link>}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline">
                  <th className="text-[10px] font-bold uppercase tracking-widest py-5 px-6">Assessment Details</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest py-5 px-6">Date</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest py-5 px-6">Volume</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest py-5 px-6">Format</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest py-5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredTests.map(test => (
                  <tr key={test.id} className="border-b last:border-0 border-outline hover:bg-surface-container-low transition-colors group">
                    <td className="py-5 px-6">
                       <div className="flex flex-col">
                          <span className="text-primary font-bold text-base leading-tight group-hover:underline cursor-pointer">
                            <Link to={`/analytics?testId=${test.id}`}>{test.name}</Link>
                          </span>
                          <span className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-tighter mt-0.5">{test.courseName || 'Unassigned Course'}</span>
                       </div>
                    </td>
                    <td className="py-5 px-6 font-medium text-on-surface-variant">{new Date(test.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="py-5 px-6"><span className="bg-surface-container-high text-primary px-3 py-1 rounded-lg font-mono text-xs font-bold">{test.numQuestions} q</span></td>
                    <td className="py-5 px-6">
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/5 text-primary font-bold text-[10px] uppercase tracking-tighter border border-primary/10">
                        {test.sections && test.sections.length > 1 ? 'Mixed Battery' : test.format}
                      </span>
                    </td>
                    <td className="py-5 px-6 text-right">
                      <div className="flex items-center justify-end gap-3 font-bold text-xs uppercase tracking-tighter">
                        <button 
                          onClick={() => navigate('/builder', { state: { editingTestId: test.id } })}
                          className="text-on-surface-variant hover:bg-primary hover:text-white p-2.5 rounded-xl border border-outline transition-all flex items-center justify-center shadow-sm" 
                          title="Edit Template"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <Link to={`/analytics?testId=${test.id}`} className="text-primary hover:bg-primary hover:text-white p-2.5 rounded-xl border border-primary/20 transition-all flex items-center justify-center shadow-sm" title="View Results">
                          <span className="material-symbols-outlined text-[20px]">analytics</span>
                        </Link>
                        <button 
                          onClick={() => generatePDF(test)}
                          className="text-on-surface-variant hover:bg-primary hover:text-white p-2.5 rounded-xl border border-outline transition-all flex items-center justify-center shadow-sm" 
                          title="Download Template"
                        >
                          <span className="material-symbols-outlined text-[20px]">download</span>
                        </button>
                        <Link to={`/scan?testId=${test.id}`} className="text-success hover:bg-success hover:text-white p-2.5 rounded-xl border border-success/20 transition-all flex items-center justify-center shadow-sm" title="Scan Sheets">
                          <span className="material-symbols-outlined text-[20px]">document_scanner</span>
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
    </div>
  );
}
