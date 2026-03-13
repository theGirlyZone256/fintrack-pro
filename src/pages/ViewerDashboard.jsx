import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const ViewerDashboard = ({ session, isCalcForcedOpen }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('All');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [focusedSession, setFocusedSession] = useState(null);
  
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcView, setCalcView] = useState('pad'); 
  useEffect(() => {
    if (isCalcForcedOpen !== undefined) {
      setIsCalcOpen(isCalcForcedOpen);
    }
  }, [isCalcForcedOpen]);
  const [calcInput, setCalcInput] = useState('');
  const [calcHistory, setCalcHistory] = useState([]);

  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('financial_sessions')
        .select(`*, distributions(*)`)
        .order('created_at', { ascending: false });
      if (!error) setSessions(data);
      setLoading(false);
    };

    fetchSessions();

    // Listen for ALL changes (Delete, Update, Insert)
    const sub = supabase.channel('db-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'financial_sessions' }, 
        () => fetchSessions() // Re-fetch on any change
      )
      .subscribe();

    return () => supabase.removeChannel(sub);
  }, []);

  

  // FIXED: Restored Intelligent Search to check dates, remarks, categories, and names properly
  const { filteredSessions, searchResults } = useMemo(() => {
    let searchRows = [];
    const filtered = sessions.filter(session => {
      const dateObj = new Date(session.created_at);
      const monthStr = dateObj.toLocaleString('default', { month: 'long' });
      const yearStr = dateObj.getFullYear().toString();
      
      const matchesMonth = filterMonth === 'All' || filterMonth === 'All Months' || monthStr === filterMonth;
      const matchesYear = filterYear === '' || yearStr === filterYear;
      
      if (!matchesMonth || !matchesYear) return false;

      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        const dateStrUS = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toLowerCase();
        const dateStrGB = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toLowerCase();
        
        const matchingDists = session.distributions?.filter(d => 
          (d.recipient && d.recipient.toLowerCase().includes(lowerSearch)) || 
          (d.category && d.category.toLowerCase().includes(lowerSearch)) || 
          (d.remark && d.remark.toLowerCase().includes(lowerSearch))
        ) || [];
        
        const matchesDate = dateStrUS.includes(lowerSearch) || dateStrGB.includes(lowerSearch);
        
        if (matchingDists.length > 0 || matchesDate) {
          searchRows.push({ 
            session, 
            dists: matchingDists.length > 0 ? matchingDists : (session.distributions || []) 
          });
          return true;
        }
        return false;
      }
      return true;
    });

    return { filteredSessions: filtered, searchResults: searchRows };
  }, [sessions, searchTerm, filterMonth, filterYear]);

  const analyticsData = useMemo(() => {
    let totalIn = 0; let totalOut = 0; const categoryMap = {};
    filteredSessions.forEach(s => {
      totalIn += Number(s.total_credited || 0);
      totalOut += Number(s.total_distributed || 0);
      s.distributions?.forEach(d => { categoryMap[d.category] = (categoryMap[d.category] || 0) + Number(d.amount); });
    });
    const categoryChartData = Object.keys(categoryMap).map(key => ({ name: key, value: categoryMap[key] }));
    const cashflowData = [{ name: 'Cashflow', Credited: totalIn, Distributed: totalOut }];
    return { cashflowData, categoryChartData, totalIn, totalOut };
  }, [filteredSessions]);

  const recipientData = useMemo(() => {
    if (!selectedRecipient) return null;
    let total = 0; let history = [];
    sessions.forEach(s => {
      s.distributions?.forEach(d => {
        if (d.recipient === selectedRecipient) {
          total += Number(d.amount); history.push({ ...d, date: s.created_at, sessionObj: s });
        }
      });
    });
    return { name: selectedRecipient, total, history: history.sort((a,b) => new Date(b.date) - new Date(a.date)) };
  }, [selectedRecipient, sessions]);

  const handleCalcEval = () => {
    try {
      if (!/^[0-9+\-*/. ]+$/.test(calcInput)) return;
      const result = new Function('return ' + calcInput)();
      const newHistory = [{ eq: calcInput, res: result, time: new Date().toLocaleTimeString() }, ...calcHistory].slice(0, 10);
      setCalcHistory(newHistory); localStorage.setItem('fintrack_calc_history', JSON.stringify(newHistory)); setCalcInput(String(result));
    } catch (e) { setCalcInput('Error'); setTimeout(() => setCalcInput(''), 1000); }
  };

  const handleKeypad = (val) => {
    if (val === 'C') setCalcInput(''); else if (val === '=') handleCalcEval(); else setCalcInput(prev => prev + val);
  };

  const clearCalcHistory = () => { setCalcHistory([]); localStorage.removeItem('fintrack_calc_history'); };

  const formatDateTime = (isoString) => {
    const d = new Date(isoString);
    const datePart = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return (
      <span>{datePart} <span className="text-red-500 font-mono text-sm ml-1">({timePart} EAT)</span></span>
    );
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0A] text-black dark:text-white italic animate-pulse">Loading architecture...</div>;

  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

  const transactionCount = searchTerm ? searchResults.length : filteredSessions.reduce((acc, s) => acc + (s.distributions?.length || 0), 0);
  const activeFilterLabel = filterMonth === 'All Months' ? `total transactions in ${filterYear}` : `transactions in ${filterMonth} ${filterYear}`;
  

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0A0A0A] text-[#111] dark:text-[#FAFAFA] font-sans transition-colors duration-500 pb-20">
      
      

      {/* DRAGGABLE CALCULATOR */}
      <AnimatePresence>
        {isCalcOpen && (
          <motion.div drag dragMomentum={false} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} 
            className="fixed top-20 right-20 z-50 w-72 bg-white dark:bg-[#171717] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden cursor-move perspective-[1000px]">
            <div className="p-4 bg-black/5 dark:bg-white/5 flex justify-between items-center border-b border-black/5 dark:border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">Calc Engine</span>
              <div className="flex gap-4">
                <button onClick={() => setCalcView(v => v === 'pad' ? 'history' : 'pad')} className="text-[10px] uppercase font-bold text-blue-500">{calcView === 'pad' ? 'History' : 'Keypad'}</button>
                <button onClick={() => setIsCalcOpen(false)} className="text-xs hover:text-red-500">✕</button>
              </div>
            </div>

            
            
            <div className="relative h-72">
              <AnimatePresence mode="wait">
                {calcView === 'pad' ? (
                  <motion.div key="pad" initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.3 }} className="absolute inset-0 p-4 flex flex-col">
                    <div className="w-full bg-transparent text-3xl font-mono outline-none text-right mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide text-black dark:text-white pb-2" dir="rtl">
                      {calcInput || '0'}
                    </div>
                    <div className="grid grid-cols-4 gap-2 flex-1">
                      {['7','8','9','/','4','5','6','*','1','2','3','-','C','0','=','+'].map(btn => (
                        <button key={btn} onClick={() => handleKeypad(btn)} className={`rounded-xl text-lg font-mono flex items-center justify-center transition hover:bg-black/10 dark:hover:bg-white/10 ${btn === '=' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-black/5 dark:bg-white/5'}`}>{btn}</button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="history" initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.3 }} className="absolute inset-0 p-4 flex flex-col">
                    <div className="flex-1 overflow-y-auto space-y-3">
                      {calcHistory.length === 0 ? <p className="text-xs text-center opacity-50 mt-10 text-neutral-500 italic">No history</p> : calcHistory.map((h, i) => (
                        <div key={i} className="flex justify-between text-xs font-mono"><span className="opacity-60">{h.eq}</span><span className="font-bold">= {h.res}</span></div>
                      ))}
                    </div>
                    <button onClick={clearCalcHistory} className="w-full mt-2 py-3 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-bold tracking-widest uppercase hover:bg-red-500/20 transition">Wipe History</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 1 }} animate={{ opacity: 1 }} className="p-6 md:p-12 max-w-6xl mx-auto pt-16">
        
        {/* BRANDING HEADER */}
        <div className="mb-12">
          <div className="inline-block">
            {/* FIXED: Italicized and bold FINTRACK PRO */}
            <h2 className="text-4xl font-bold italic tracking-tight uppercase">FINTRACK PRO</h2>
            <p className="text-[9px] text-green-500 font-mono tracking-widest text-right mt-1">DEVELOPED BY MARVIN TAMALE</p>
          </div>
        </div>

        {/* TITLE & FILTERS */}
        <header className="mb-12">
          
          <div className="flex flex-col md:flex-row items-center gap-4 bg-white dark:bg-white/5 p-2 rounded-2xl border border-black/10 dark:border-white/10 shadow-sm">
            <div className="flex items-center pl-3 w-full md:w-auto md:flex-1 relative border-b md:border-b-0 md:border-r border-black/10 dark:border-white/10 pb-2 md:pb-0">
              <span className="text-lg opacity-50">⌕</span>
              <input type="text" placeholder="Search records..." className="bg-transparent px-3 py-2 text-sm outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-4 text-xs bg-black/10 dark:bg-white/10 w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition">✕</button>}
            </div>
            <div className="flex items-center w-full md:w-auto gap-2 px-2">
              <select className="bg-transparent text-[10px] uppercase tracking-widest outline-none px-2 py-2 cursor-pointer dark:bg-[#0A0A0A] flex-1 md:flex-none" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option>All Months</option>
                {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => <option key={m}>{m}</option>)}
              </select>
              <input type="number" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-transparent text-[10px] uppercase tracking-widest outline-none px-2 py-2 w-20 text-center border-l border-black/10 dark:border-white/10" placeholder="Year" />
            </div>
          </div>

          {/* TRANSACTION COUNTER */}
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="mt-4 ml-2"
              >
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-500">
                  ● {transactionCount} {activeFilterLabel}
                </p>
              </motion.div>

        </header>

        {/* FEED */}
        <div className="space-y-16">
          <AnimatePresence mode="popLayout">
            {searchTerm ? (
              searchResults.length > 0 ? (
                searchResults.map((row) => (
                  <motion.div key={row.session.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="mb-8 border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-white/[0.02]">
                    <div className="bg-black/5 dark:bg-white/5 px-6 py-3 border-b border-black/10 dark:border-white/10 flex justify-between items-center cursor-pointer hover:bg-black/10 transition" onClick={() => setFocusedSession(row.session)}>
                      <span className="text-xs font-bold uppercase tracking-widest">{formatDateTime(row.session.created_at)}</span>
                      <span className="text-[10px] uppercase italic opacity-50">View Full Session ↗</span>
                    </div>
                    <div className="divide-y divide-black/5 dark:divide-white/5">
                      {row.dists.map(dist => (
                        <div key={dist.id} className="p-4 px-6 flex justify-between items-center hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition" onClick={() => setSelectedRecipient(dist.recipient)}>
                          <div><span className="font-medium text-sm block">{dist.recipient}</span><span className="text-[10px] opacity-60 uppercase">{dist.category} — {dist.remark}</span></div>
                          <span className="font-mono text-sm text-red-500 dark:text-red-400">-{dist.amount?.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))
              ) : (
                /* FIXED: Added Empty State for Search Results */
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20 border-2 border-dashed border-black/10 dark:border-white/10 rounded-[2rem]">
                  <p className="text-neutral-500 italic tracking-widest text-sm">No records found matching "{searchTerm}"</p>
                </motion.div>
              )
            ) : (
              filteredSessions.map((session, index) => (
                <motion.section key={session.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: index * 0.05 }} className="border-t border-black/10 dark:border-white/10 pt-8">
                  <div className="flex justify-between items-end mb-6">
                    <h3 className="text-xl font-medium tracking-tight cursor-pointer hover:opacity-70 transition" onClick={() => setFocusedSession(session)}>
                      {formatDateTime(session.created_at)}
                    </h3>
                    <div className="text-right">
                      <span className="text-[9px] text-neutral-500 uppercase tracking-widest block mb-1">Opening Balance</span>
                      <span className="text-xl font-mono opacity-80">UGX {session.bank_opening?.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="p-6 bg-white dark:bg-neutral-900/50 rounded-2xl border border-black/5 dark:border-white/5 shadow-sm">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">Credited</p>
                      <p className="text-2xl font-mono text-green-600 dark:text-green-400">+{session.total_credited?.toLocaleString()}</p>
                    </div>
                    <div className="p-6 bg-white dark:bg-neutral-900/50 rounded-2xl border border-black/5 dark:border-white/5 shadow-sm">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">Distributed</p>
                      <p className="text-2xl font-mono text-red-600 dark:text-red-400">-{session.total_distributed?.toLocaleString()}</p>
                    </div>
                    <div className="p-6 bg-black text-white dark:bg-white dark:text-black rounded-2xl shadow-xl">
                      <p className="text-[9px] opacity-60 uppercase tracking-widest mb-1">Final Balance</p>
                      <p className="text-2xl font-mono font-bold">UGX {session.final_balance?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto pb-4">
                    <div className="min-w-[500px] rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/[0.01] overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-black/5 dark:bg-white/5 text-neutral-500 uppercase text-[9px] tracking-[0.2em]">
                          <tr><th className="p-4">Recipient</th><th className="p-4">Category</th><th className="p-4 text-right">Amount</th></tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                          {session.distributions?.map((dist) => (
                            <tr key={dist.id} className="hover:bg-black/5 dark:hover:bg-white/[0.03] transition-colors cursor-pointer group" onClick={() => setSelectedRecipient(dist.recipient)}>
                              <td className="p-4 group-hover:pl-6 transition-all"><span className="block font-medium text-sm underline-offset-4 group-hover:underline">{dist.recipient}</span><span className="text-[10px] text-neutral-500 italic truncate max-w-[200px] block">{dist.remark}</span></td>
                              <td className="p-4 text-neutral-500 uppercase tracking-widest">{dist.category}</td>
                              <td className="p-4 text-right font-mono text-sm text-red-500 dark:text-red-400">-{dist.amount?.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.section>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      
      {/* MODAL: RECIPIENT DEEP DIVE */}
      <AnimatePresence>
        {selectedRecipient && recipientData && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 50, scale: 0.95 }} className="w-full max-w-2xl bg-[#F5F5F7] dark:bg-[#0A0A0A] rounded-[2rem] border border-white/20 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
              <div className="p-8 border-b border-black/10 dark:border-white/10 flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-light tracking-tighter italic">{recipientData.name}</h2>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 mt-2">Overall Sent</p>
                  <p className="text-4xl font-mono font-bold text-red-500 mt-1">-{recipientData.total.toLocaleString()}</p>
                </div>
                <button onClick={() => setSelectedRecipient(null)} className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center hover:scale-110 transition">✕</button>
              </div>
              <div className="p-8 overflow-y-auto space-y-4">
                {recipientData.history.map((hist, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 hover:border-black/30 dark:hover:border-white/30 cursor-pointer transition" 
                       onClick={() => { setSelectedRecipient(null); setFocusedSession(hist.sessionObj); }}>
                    <div>
                      <span className="text-xs font-bold block">{formatDateTime(hist.date)}</span>
                      <span className="text-[10px] uppercase tracking-widest opacity-60">{hist.category}</span>
                    </div>
                    <span className="font-mono text-sm text-red-500">-{hist.amount?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: SPECIFIC SESSION VIEW */}
      <AnimatePresence>
        {focusedSession && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-3xl bg-[#F5F5F7] dark:bg-[#0A0A0A] rounded-[2rem] border border-white/20 shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8 border-b border-black/10 dark:border-white/10 pb-6">
                <h2 className="text-2xl font-bold tracking-tighter">{formatDateTime(focusedSession.created_at)}</h2>
                <button onClick={() => setFocusedSession(null)} className="text-sm font-bold uppercase tracking-widest hover:text-red-500">Close</button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl"><p className="text-[10px] uppercase opacity-50">Opening</p><p className="font-mono">{focusedSession.bank_opening?.toLocaleString()}</p></div>
                <div className="p-4 bg-black text-white dark:bg-white dark:text-black rounded-xl"><p className="text-[10px] uppercase opacity-50">Final</p><p className="font-mono font-bold">{focusedSession.final_balance?.toLocaleString()}</p></div>
              </div>
              <div className="space-y-2">
                {focusedSession.distributions?.map(d => (
                  <div key={d.id} className="flex justify-between text-xs p-3 bg-white dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5">
                    <span><strong>{d.recipient}</strong> <span className="opacity-50 mx-2">|</span> {d.category}</span>
                    <span className="font-mono text-red-500 dark:text-red-400">-{d.amount?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ViewerDashboard;