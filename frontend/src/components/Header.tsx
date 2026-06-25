'use client';

import { useState, useEffect } from 'react';
import { fetchAuthMe, User } from '@/lib/api';
import AuthModal from './AuthModal';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUser = async (token: string) => {
    try {
      setLoading(true);
      const userData = await fetchAuthMe(token);
      setUser(userData);
    } catch (err) {
      // Token is invalid/expired
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleAuthChange = () => {
      const token = localStorage.getItem('token');
      if (token) {
        fetchUser(token);
      } else {
        setUser(null);
      }
    };

    handleAuthChange(); // check on mount

    window.addEventListener('auth-change', handleAuthChange);
    
    // Listen for custom trigger to open authentication modal from other components
    const handleOpenAuth = () => setIsOpen(true);
    window.addEventListener('open-auth-modal', handleOpenAuth);

    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
      window.removeEventListener('open-auth-modal', handleOpenAuth);
    };
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-change'));
  };

  const handleSuccess = (token: string) => {
    localStorage.setItem('token', token);
    window.dispatchEvent(new Event('auth-change'));
  };

  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-900 pb-6 mb-2">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400">
          א Aleph-Tav Engine ת
        </h1>
        <p className="text-neutral-500 text-sm font-medium">
          Hebrew-English Interlinear Translation Bible Engine
        </p>
      </div>

      <div className="flex items-center gap-4">
        {loading ? (
          <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-800 rounded-xl px-4 py-2 text-neutral-400 text-xs">
            <span className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            Loading account...
          </div>
        ) : user ? (
          <div className="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-2">
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Account</span>
              <span className="text-sm font-semibold text-neutral-200 truncate max-w-[180px]">{user.email}</span>
            </div>
            <div className="w-px h-6 bg-neutral-800" />
            <button
              onClick={handleSignOut}
              className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 hover:border-amber-500/80 text-amber-300 hover:text-amber-200 font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(245,158,11,0.05)] text-sm cursor-pointer"
          >
            Sign In / Sign Up
          </button>
        )}
        <div className="hidden md:block text-neutral-500 font-mono text-xs text-right border-l border-neutral-900 pl-4">
          DATABASE: postgresql/aleph_tav_db
        </div>
      </div>

      <AuthModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
      />
    </header>
  );
}
