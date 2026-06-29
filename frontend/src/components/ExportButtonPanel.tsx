'use client';

import React, { useState, useEffect } from 'react';

export default function ExportButtonPanel() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('token'));
    const handleAuth = () => {
      setToken(localStorage.getItem('token'));
    };
    window.addEventListener('auth-change', handleAuth);
    return () => window.removeEventListener('auth-change', handleAuth);
  }, []);

  const handleExport = async (groupBy: 'book' | 'type') => {
    if (!token) {
      alert('You must be signed in to export notes.');
      return;
    }
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/export/notes?group_by=${groupBy}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `study_notes_by_${groupBy}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export study notes.');
    }
  };

  if (!token) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleExport('book')}
        className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-amber-400 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Export by Book
      </button>
      <button
        onClick={() => handleExport('type')}
        className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-amber-400 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Export by Type
      </button>
    </div>
  );
}
