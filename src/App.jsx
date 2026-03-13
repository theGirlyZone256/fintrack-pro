import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Login from './pages/Login';
import ViewerDashboard from './pages/ViewerDashboard';
import AdminDashboard from './pages/AdminDashboard'; 

// Define variants outside to prevent re-creation on every render
const bubbleVariants = {
  hidden: { opacity: 0, scale: 0, y: 0 },
  visible: (i) => ({ 
    opacity: 1, 
    scale: 1, 
    y: -(70 * (i + 1)),
    transition: { type: "spring", stiffness: 300, damping: 20 } 
  })
};

function App() {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState('view');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const timeoutRef = useRef(null);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Network timeout during logout. Forcing local exit.");
    } finally {
      // This guarantees the app locks down even if the network fails
      setSession(null);
      setMenuOpen(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, []);

  // Timer only runs if session exists
  const resetTimer = useCallback(() => {
    if (!session) return; 
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // Admin: 2 mins | Viewer: 1 min
    const delay = mode === 'entry' ? 2 * 60 * 1000 : 1 * 60 * 1000;
    timeoutRef.current = setTimeout(() => handleLogout(), delay);
  }, [mode, session, handleLogout]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const events = ['mousemove', 'mousedown', 'scroll', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [mode, session, resetTimer]);

  if (!session) return <Login onLoginSuccess={(s) => setSession(s)} />;

  const isAdmin = session.user.email === 'epignosistic@gmail.com';

  return (
    <div className="min-h-screen bg-[#0A0A0A] overflow-x-hidden">
      <main>
        {mode === 'view' ? (
          <ViewerDashboard session={session} isCalcForcedOpen={isCalcOpen} />
        ) : (
          <AdminDashboard />
        )}
      </main>

      {/* ACCESSIBILITY HUB (Mobile Fix: Added keys and removed fragments) */}
      <div className="fixed bottom-8 right-8 z-[1000]">
        <AnimatePresence>
          {menuOpen && (
            <div key="hub-container">
              <motion.div 
                key="backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[-1]"
              />

              {/* 1. SIGN OUT BUTTON (Red, custom={0}) */}
              <motion.button
                key="btn-signout"
                custom={0} variants={bubbleVariants} initial="hidden" animate="visible" exit="hidden"
                onClick={handleLogout}
                className="absolute w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center shadow-2xl"
                title="Sign Out"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </motion.button>

              {/* 2. MONITOR BUTTON (White, custom={1}) */}
              <motion.button
                key="btn-monitor"
                custom={1} variants={bubbleVariants} initial="hidden" animate="visible" exit="hidden"
                onClick={() => { setMode('view'); setMenuOpen(false); }}
                className="absolute w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-2xl"
                title="Monitor Mode"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M21 5c0 1.66-4 3-9 3s-9-1.34-9-3 4-3 9-3 9 1.34 9 3z"/></svg>
              </motion.button>

              {/* 3. CALCULATOR BUTTON (Blue, custom={2}) */}
              <motion.button
                key="btn-calc"
                custom={2} variants={bubbleVariants} initial="hidden" animate="visible" exit="hidden"
                onClick={() => { setIsCalcOpen(!isCalcOpen); setMenuOpen(false); }}
                className="absolute w-14 h-14 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl"
                title="Calculator"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
              </motion.button>

              {/* 4. ADMIN ENTRY BUTTON (Green, custom={3} - Only shows for you) */}
              {isAdmin && (
                <motion.button
                  key="btn-admin"
                  custom={3} variants={bubbleVariants} initial="hidden" animate="visible" exit="hidden"
                  onClick={() => { setMode('entry'); setMenuOpen(false); }}
                  className="absolute w-14 h-14 bg-green-500 text-black rounded-full flex items-center justify-center shadow-2xl"
                  title="Data Entry"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </motion.button>
              )}
              
            </div>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setMenuOpen(!menuOpen)}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border-2 transition-all duration-300 ${menuOpen ? 'bg-white text-black border-white' : 'bg-neutral-900 text-white border-white/20'}`}
        >
          <motion.div animate={{ rotate: menuOpen ? 135 : 0 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </motion.div>
        </motion.button>
      </div>
    </div>
  );
}

export default App;