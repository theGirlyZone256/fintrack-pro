import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setPassword('');
      setLoading(false);
    } else {
      onLoginSuccess(data.session);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 1, y: 0 }} 
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* BRANDING */}
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold italic tracking-tight uppercase text-[#FAFAFA]">
            FINTRACK PRO
          </h2>
          <p className="text-[9px] text-green-500 font-mono tracking-[0.3em] mt-2">
            PERSONAL FINANCIAL TRACKER
          </p>
        </div>

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">Email Address</label>
            <input 
              type="email" 
              required
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm outline-none focus:border-white/30 transition-colors text-white"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500 ml-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm outline-none focus:border-white/30 transition-colors text-white"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500 italic text-center animate-shake">{errorMsg}</p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl uppercase tracking-widest text-xs hover:bg-neutral-200 transition-all disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Authorize Entry'}
          </button>
        </form>

        <footer className="mt-12 text-center">
          <p className="text-[9px] text-neutral-600 font-mono tracking-widest">
            MARVIN'S CUSTOM-WARE @2026
          </p>
        </footer>
      </motion.div>
    </div>
  );
};

export default Login;