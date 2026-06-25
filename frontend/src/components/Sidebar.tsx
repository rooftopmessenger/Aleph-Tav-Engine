'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fetchAuthMe, User } from '@/lib/api';
import AuthModal from './AuthModal';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUser = async (token: string) => {
    try {
      setLoading(true);
      const userData = await fetchAuthMe(token);
      setUser(userData);
    } catch (err) {
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

  const links = [
    {
      name: 'Dashboard',
      href: '/',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Reader',
      href: '/read',
      activePattern: /^\/read/,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: 'AI Search',
      href: '/search',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      ),
    },
    {
      name: 'Study Notes',
      href: '/notes',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-neutral-950 border-r border-neutral-900 h-screen sticky top-0 text-neutral-200 z-40 shrink-0">
        <div className="p-6 border-b border-neutral-900">
          <Link href="/" className="flex flex-col gap-1">
            <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400">
              א Aleph-Tav ת
            </h1>
            <span className="text-[10px] text-neutral-500 font-mono tracking-wider">HEBREW STUDY SUITE</span>
          </Link>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {links.map((link) => {
            const isActive = link.activePattern 
              ? link.activePattern.test(pathname)
              : pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_2px_10px_rgba(245,158,11,0.05)]'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50 border-transparent'
                }`}
              >
                {link.icon}
                {link.name}
              </Link>
            );
          })}
        </nav>
        
        {/* Auth section & DB indicator at the bottom of the Sidebar */}
        <div className="p-4 border-t border-neutral-900 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center gap-2 bg-neutral-900/40 border border-neutral-800 rounded-xl px-4 py-2 text-neutral-400 text-xs">
              <span className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
              Loading account...
            </div>
          ) : user ? (
            <div className="flex flex-col gap-2 bg-neutral-900/60 border border-neutral-850 rounded-xl p-3">
              <div className="flex flex-col">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Account</span>
                <span className="text-xs font-semibold text-neutral-255 truncate">{user.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="text-left text-xs font-bold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsOpen(true)}
              className="w-full px-4 py-2 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 hover:border-amber-500/80 text-amber-300 hover:text-amber-200 font-bold rounded-xl transition-all text-xs cursor-pointer text-center"
            >
              Sign In / Sign Up
            </button>
          )}
          
          <div className="text-[10px] text-neutral-500 font-mono text-center pt-1 border-t border-neutral-900/40 mt-1">
            Local SQLite: kjv_strongs.db
          </div>
        </div>

        <div className="px-6 py-4 border-t border-neutral-900 text-xs text-neutral-600 font-mono">
          © {new Date().getFullYear()} Aleph-Tav
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-neutral-950/95 border-t border-neutral-900 backdrop-blur-md flex items-center justify-around px-2 z-50">
        {links.map((link) => {
          const isActive = link.activePattern 
            ? link.activePattern.test(pathname)
            : pathname === link.href;
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`flex flex-col items-center justify-center gap-1 w-14 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                isActive
                  ? 'text-amber-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {link.icon}
              <span className="truncate">{link.name}</span>
            </Link>
          );
        })}
        
        {/* Mobile Auth Button */}
        {user ? (
          <button
            onClick={handleSignOut}
            className="flex flex-col items-center justify-center gap-1 w-14 py-1 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="truncate">Sign Out</span>
          </button>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="flex flex-col items-center justify-center gap-1 w-14 py-1 rounded-lg text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="truncate">Sign In</span>
          </button>
        )}
      </nav>

      <AuthModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
