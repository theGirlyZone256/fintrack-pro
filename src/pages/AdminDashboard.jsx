import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

const isWithin24Hours = (dateString) => {
  const diff = new Date() - new Date(dateString);
  return diff < 24 * 60 * 60 * 1000;
};

// --- HELPER FUNCTIONS ---
const formatNumber = (val) => {
  if (!val) return '';
  const num = val.toString().replace(/[^0-9]/g, '');
  return num ? Number(num).toLocaleString('en-US') : '';
};

const parseNumber = (str) => {
  if (!str) return 0;
  return Number(str.toString().replace(/[^0-9]/g, ''));
};

const AdminEntryPage = () => {
  // Navigation State
  const [step, setStep] = useState(1);
  
  // Data States
  const [editingId, setEditingId] = useState(null);
  const [opening, setOpening] = useState('');
  const [credited, setCredited] = useState('');
  const [distributions, setDistributions] = useState([]);
  const [finalBalance, setFinalBalance] = useState('');
  
  // Current Distribution Input States
  const [curRecipient, setCurRecipient] = useState('');
  const [curCategory, setCurCategory] = useState('');
  const [curAmount, setCurAmount] = useState('');
  const [curRemark, setCurRemark] = useState('');

  // System States
  const [history, setHistory] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletedId, setDeletedId] = useState(null); // Tracks the deleted session for the UI feedback

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('financial_sessions')
      .select('*, distributions(*)')
      .order('created_at', { ascending: false });
    if (data) setHistory(data);
  };

  // --- CALCULATIONS ---
  const totalDistributed = useMemo(() => {
    return distributions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  }, [distributions]);

  // --- VALIDATIONS ---
  const isStep1Valid = opening.toString().trim() !== '' && credited.toString().trim() !== '';
  const isCurrentDistValid = curRecipient.trim() !== '' && curCategory.trim() !== '' && curAmount.toString().trim() !== '' && curRemark.trim() !== '';
  const isStep3Valid = finalBalance.toString().trim() !== '';

  // --- ACTIONS ---
  const handleAddDistribution = () => {
    if (!isCurrentDistValid) return;
    setDistributions([...distributions, { 
      recipient: curRecipient, 
      category: curCategory, 
      amount: curAmount, 
      remark: curRemark 
    }]);
    setCurRecipient(''); setCurCategory(''); setCurAmount(''); setCurRemark('');
  };

  const removeDistribution = (index) => {
    const newDists = [...distributions];
    newDists.splice(index, 1);
    setDistributions(newDists);
  };

  const handleEditSession = (session) => {
    setEditingId(session.id);
    setOpening(session.bank_opening);
    setCredited(session.total_credited);
    setFinalBalance(session.final_balance);
    setDistributions(session.distributions.map(d => ({
      ...d, amount: d.amount
    })));
    setStep(1);
  };

  const handleDeleteSession = async (id) => {
    if (window.confirm("Are you sure you want to permanently delete this session and all its distributions?")) {
      
      // 1. Immediately trigger the strikethrough UI
      setDeletedId(id); 

      try {
        // 2. Delete child records (distributions) first
        const { error: distError } = await supabase
          .from('distributions')
          .delete()
          .eq('session_id', id);
          
        if (distError) throw new Error("Distributions: " + distError.message);

        // 3. Delete parent record (financial_sessions)
        const { error: sessionError } = await supabase
          .from('financial_sessions')
          .delete()
          .eq('id', id);
          
        if (sessionError) throw new Error("Session: " + sessionError.message);
        
        // 4. Leave the strikethrough visible for 2 seconds, then clear it out
        setTimeout(() => {
          setDeletedId(null);
          fetchHistory();
        }, 2000);

      } catch (error) {
        // Revert UI if the database blocked it
        setDeletedId(null); 
        alert("Deletion Blocked by Database: " + error.message);
      }
    }
  };

  const handleSubmit = async () => {
  setIsSubmitting(true);
  
  try {
    const sessionData = { 
      bank_opening: parseNumber(opening), 
      total_credited: parseNumber(credited), 
      total_distributed: parseNumber(totalDistributed), 
      final_balance: parseNumber(finalBalance)
    };

    let sessionId = editingId;

    if (editingId) {
      // 1. Update session
      const { error: updateError } = await supabase
        .from('financial_sessions')
        .update(sessionData)
        .eq('id', editingId);
      
      if (updateError) throw updateError;

      // 2. Wipe old distributions to avoid duplicate ID errors
      const { error: deleteError } = await supabase
        .from('distributions')
        .delete()
        .eq('session_id', editingId);
      
      if (deleteError) throw deleteError;
    } else {
      // Create new session
      const { data, error: insertError } = await supabase
        .from('financial_sessions')
        .insert([sessionData])
        .select();
      
      if (insertError) throw insertError;
      sessionId = data[0].id;
    }

    // 3. Re-insert distributions (strip old IDs to prevent primary key conflicts)
    const distToInsert = distributions.map(d => ({
      session_id: sessionId,
      recipient: d.recipient,
      category: d.category,
      amount: parseNumber(d.amount),
      remark: d.remark
    }));

    const { error: distError } = await supabase
      .from('distributions')
      .insert(distToInsert);

    if (distError) throw distError;

    alert(editingId ? "Update Successful" : "Data Committed to Vault");
    setEditingId(null);
    setStep(1);
    fetchHistory();
    setOpening(''); setCredited(''); setDistributions([]);
  } catch (error) {
    console.error(error);
    alert("Database Error: " + error.message);
  } finally {
    setIsSubmitting(false);
  }
};
  const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, x: -20 } };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] pb-32 pt-12 px-6">
      <div className="max-w-xl mx-auto">
        
        <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold italic tracking-tighter uppercase">Data Ingestion</h1>
            <p className="text-[10px] text-green-500 font-mono tracking-widest mt-1">
              {editingId ? 'EDITING SECURE RECORD' : 'NEW SESSION PROTOCOL'}
            </p>
          </div>
          <button 
            onClick={() => setStep(step === 4 ? 1 : 4)}
            className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white transition"
          >
            {step === 4 ? 'Back to Entry' : 'View History'}
          </button>
        </div>

        <AnimatePresence mode="wait">
          
          {step === 1 && (
            <motion.div key="step1" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="space-y-8">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-6">Phase 1: Initial Metrics</h2>
              
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest ml-2 opacity-50">Opening Balance</label>
                <input type="number" value={opening} onChange={(e) => setOpening(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-xl font-mono outline-none focus:border-white/40 transition" placeholder="0" />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest ml-2 opacity-50">Credited (Inflow)</label>
                <input type="number" value={credited} onChange={(e) => setCredited(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-xl font-mono outline-none focus:border-white/40 transition text-green-500" placeholder="0" />
              </div>

              <button disabled={!isStep1Valid} onClick={() => setStep(2)}
                className="w-full py-5 rounded-2xl bg-white text-black font-bold uppercase tracking-widest text-xs disabled:opacity-30 disabled:cursor-not-allowed transition">
                Proceed to Distributions →
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="space-y-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Phase 2: Distributions</h2>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-widest text-red-500">Total Outflow</p>
                  <p className="font-mono text-lg">{totalDistributed.toLocaleString('en-US')}</p>
                </div>
              </div>

              {distributions.length > 0 && (
                <div className="space-y-3 mb-8">
                  {distributions.map((d, i) => (
                    <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm">{d.recipient} <span className="opacity-50 font-normal ml-2">| {d.category}</span></p>
                        <p className="text-[10px] opacity-60 mt-1 truncate max-w-[200px]">{d.remark}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-mono text-red-400">-{Number(d.amount).toLocaleString('en-US')}</p>
                        <button onClick={() => removeDistribution(i)} className="text-red-500 hover:text-red-400">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-6 bg-white/[0.02] border border-white/10 rounded-3xl space-y-4">
                <h3 className="text-[10px] uppercase tracking-widest mb-4">Add Recipient</h3>
                
                <input type="text" value={curRecipient} onChange={(e) => setCurRecipient(e.target.value)} placeholder="Recipient Name"
                  className="w-full bg-transparent border-b border-white/10 px-2 py-3 outline-none focus:border-white transition" />
                
                <input type="text" value={curCategory} onChange={(e) => setCurCategory(e.target.value)} placeholder="Category (e.g., Operational, Salary)"
                  className="w-full bg-transparent border-b border-white/10 px-2 py-3 outline-none focus:border-white transition" />
                
                <input type="number" value={curAmount} onChange={(e) => setCurAmount(e.target.value)} placeholder="Amount"
                  className="w-full bg-transparent border-b border-white/10 px-2 py-3 outline-none focus:border-white transition font-mono text-red-400" />
                
                <textarea value={curRemark} onChange={(e) => setCurRemark(e.target.value)} placeholder="Detailed Remarks / Sentences..." rows="2"
                  className="w-full bg-transparent border-b border-white/10 px-2 py-3 outline-none focus:border-white transition resize-none" />

                <button disabled={!isCurrentDistValid} onClick={handleAddDistribution}
                  className="w-full py-4 mt-4 rounded-xl border border-white/20 text-xs font-bold uppercase tracking-widest disabled:opacity-30 hover:bg-white/10 transition">
                  + Add to List
                </button>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="w-1/3 py-5 rounded-2xl border border-white/20 text-xs uppercase tracking-widest">Back</button>
                <button onClick={() => setStep(3)} className="w-2/3 py-5 rounded-2xl bg-white text-black font-bold uppercase tracking-widest text-xs transition">
                  Verify & Finalize →
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="space-y-8">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-6">Phase 3: Verification</h2>
              
              <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4 mb-8">
                <div className="flex justify-between text-sm"><span className="opacity-50">Opening</span><span className="font-mono">{Number(opening).toLocaleString('en-US')}</span></div>
                <div className="flex justify-between text-sm"><span className="opacity-50">Credited</span><span className="font-mono text-green-400">+{Number(credited).toLocaleString('en-US')}</span></div>
                <div className="flex justify-between text-sm"><span className="opacity-50">Distributed</span><span className="font-mono text-red-400">-{totalDistributed.toLocaleString('en-US')}</span></div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest ml-2 opacity-50">Manual Final Balance</label>
                <input type="number" value={finalBalance} onChange={(e) => setFinalBalance(e.target.value)}
                  className="w-full bg-black border border-white/20 rounded-2xl px-6 py-6 text-2xl font-mono outline-none focus:border-white transition" placeholder="Enter Final Balance" />
              </div>

              <div className="flex gap-4 mt-8">
                <button onClick={() => setStep(2)} className="w-1/3 py-5 rounded-2xl border border-white/20 text-xs uppercase tracking-widest">Back</button>
                <button disabled={!isStep3Valid || isSubmitting} onClick={handleSubmit}
                  className="w-2/3 py-5 rounded-2xl bg-green-500 text-black font-bold uppercase tracking-widest text-xs disabled:opacity-30 transition">
                  {isSubmitting ? 'Syncing...' : 'Commit to Database'}
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="space-y-4">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-6">System Logs & History</h2>
              
              {history.length === 0 ? (
                <p className="text-center italic opacity-50 py-10">No records found.</p>
              ) : (
                history.map((session) => {
                  // If this session was just deleted, show the feedback animation instead
                  // If this session was just deleted, show the strikethrough feedback
                  if (deletedId === session.id) {
                    return (
                      <div key={`deleted-${session.id}`} className="p-5 bg-red-500/5 border border-red-500/20 rounded-2xl transition-all duration-500">
                        <div className="flex justify-between items-start mb-4 opacity-40 line-through text-red-500">
                          <div>
                            <p className="text-sm font-bold">{new Date(session.created_at).toLocaleDateString('en-GB')}</p>
                            <p className="text-[10px] font-mono mt-1">Bal: {session.final_balance?.toLocaleString('en-US')}</p>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-red-500 animate-pulse">Purging...</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const editable = isWithin24Hours(session.created_at);
                  return (
                    <div key={session.id} className="p-5 bg-white/5 border border-white/10 rounded-2xl">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-sm font-bold">{new Date(session.created_at).toLocaleDateString('en-GB')}</p>
                          <p className="text-[10px] font-mono opacity-50 mt-1">Bal: {session.final_balance?.toLocaleString('en-US')}</p>
                        </div>
                        <div className="flex gap-3">
                          {editable ? (
                            <button onClick={() => handleEditSession(session)} className="text-[10px] uppercase tracking-widest text-blue-400 hover:text-blue-300">Edit (24h)</button>
                          ) : (
                            <span className="text-[10px] uppercase tracking-widest text-neutral-600">Locked</span>
                          )}
                          <button onClick={() => handleDeleteSession(session.id)} className="text-[10px] uppercase tracking-widest text-red-500 hover:text-red-400">Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminEntryPage;