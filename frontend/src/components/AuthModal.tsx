'use client';

import { useState } from 'react';
import { loginUser, signupUser } from '@/lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const data = await loginUser(email, password);
        onSuccess(data.access_token);
      } else {
        const data = await signupUser(email, password);
        onSuccess(data.access_token);
      }
      setEmail('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Modal Container */}
      <div 
        className="w-full max-w-md p-8 bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl backdrop-blur-md relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-200 to-orange-400">
            {isLogin ? 'Sign In to Engine' : 'Create Study Account'}
          </h2>
          <p className="text-neutral-500 text-xs mt-1">
            {isLogin ? 'Access your saved study notes and custom alerts' : 'Start saving notes on verses and tracking your studies'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-red-400 text-xs leading-relaxed text-center">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-200 text-sm focus:outline-none focus:border-amber-500/80 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-200 text-sm focus:outline-none focus:border-amber-500/80 transition-colors"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-neutral-950 font-bold rounded-xl transition-all shadow-[0_4px_20px_rgba(245,158,11,0.15)] disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              isLogin ? 'Sign In' : 'Sign Up'
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="text-center mt-6 border-t border-neutral-800/60 pt-4 text-xs text-neutral-500">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-amber-400 hover:underline font-semibold transition-colors"
          >
            {isLogin ? 'Create one here' : 'Sign in instead'}
          </button>
        </div>
      </div>
    </div>
  );
}
