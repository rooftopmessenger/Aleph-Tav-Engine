'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchAllNotes, SavedNote } from '@/lib/api';

// Helper to determine Pardes level from note text
const parsePardesLevel = (text: string) => {
  const lower = text.toLowerCase();
  if (lower.includes('#peshat') || lower.includes('[peshat]') || lower.includes('peshat:')) {
    return { name: 'Peshat', label: 'פְּשָׁט', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
  }
  if (lower.includes('#remez') || lower.includes('[remez]') || lower.includes('remez:')) {
    return { name: 'Remez', label: 'רֶמֶז', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
  }
  if (lower.includes('#derash') || lower.includes('[derash]') || lower.includes('derash:')) {
    return { name: 'Derash', label: 'דְּרַשׁ', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
  }
  if (lower.includes('#sod') || lower.includes('[sod]') || lower.includes('sod:')) {
    return { name: 'Sod', label: 'סוֹד', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
  }
  return null;
};

// Helper to strip Pardes tags from displayed text
const cleanNoteText = (text: string) => {
  return text
    .replace(/(?:#|\[)peshat(?:\]|:)?/gi, '')
    .replace(/(?:#|\[)remez(?:\]|:)?/gi, '')
    .replace(/(?:#|\[)derash(?:\]|:)?/gi, '')
    .replace(/(?:#|\[)sod(?:\]|:)?/gi, '')
    .trim();
};

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [loading, setLoading] = useState(false);

  // Sync token from localStorage
  useEffect(() => {
    const handleAuth = () => {
      setToken(localStorage.getItem('token'));
    };
    handleAuth();
    window.addEventListener('auth-change', handleAuth);
    return () => window.removeEventListener('auth-change', handleAuth);
  }, []);

  // Fetch recent notes when token changes
  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchAllNotes(token)
        .then((fetchedNotes) => {
          // Limit to 5 most recent notes
          setNotes(fetchedNotes.slice(0, 5));
        })
        .catch((err) => {
          console.error('Failed to fetch recent notes:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setNotes([]);
    }
  }, [token]);

  const handleOpenAuth = () => {
    window.dispatchEvent(new Event('open-auth-modal'));
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-10 w-full py-4">
      {/* 1. Hero Welcome Banner */}
      <section className="bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 border border-neutral-900 rounded-3xl p-8 md:p-12 overflow-hidden relative shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full filter blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-orange-500/5 rounded-full filter blur-3xl pointer-events-none -ml-20 -mb-20" />
        
        <div className="relative z-10 flex flex-col gap-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-bold text-amber-400 w-fit">
            <span>א Aleph-Tav Study Suite ת</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-neutral-100">
            Unlocking the Depth of the <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400">Hebrew Scriptures</span>
          </h2>
          <p className="text-neutral-400 text-base md:text-lg leading-relaxed mt-2">
            Welcome to the Aleph-Tav engine. Dig into original BHS Hebrew root words, explore interlinear morphology, query linguistic patterns with AI guidance, and visually map theological connections.
          </p>
        </div>
      </section>

      {/* 2. Feature Grid Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Reader */}
        <Link 
          href="/read" 
          className="group flex flex-col justify-between p-6 bg-neutral-900/40 border border-neutral-900 rounded-2xl hover:border-amber-500/40 hover:bg-neutral-900/80 transition-all duration-300 hover:-translate-y-1 shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral-100 group-hover:text-amber-400 transition-colors">Interlinear Reader</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Read the Hebrew text aligned word-by-word with grammatical transliterations, Strong's concordance codes, and dictionary lookups.
            </p>
          </div>
          <span className="text-xs font-bold text-amber-400 mt-6 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Start Reading <span>→</span>
          </span>
        </Link>

        {/* Card 2: AI Search */}
        <Link 
          href="/search" 
          className="group flex flex-col justify-between p-6 bg-neutral-900/40 border border-neutral-900 rounded-2xl hover:border-amber-500/40 hover:bg-neutral-900/80 transition-all duration-300 hover:-translate-y-1 shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral-100 group-hover:text-amber-400 transition-colors">AI Pattern Search</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Identify linguistic structures and cross-reference theological themes. Ask research questions and stream grammatical analysis.
            </p>
          </div>
          <span className="text-xs font-bold text-amber-400 mt-6 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Query AI Assistant <span>→</span>
          </span>
        </Link>

        {/* Card 3: Notes Workspace */}
        <Link 
          href="/notes" 
          className="group flex flex-col justify-between p-6 bg-neutral-900/40 border border-neutral-900 rounded-2xl hover:border-amber-500/40 hover:bg-neutral-900/80 transition-all duration-300 hover:-translate-y-1 shadow-lg"
        >
          <div className="flex flex-col gap-3">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-450 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral-100 group-hover:text-amber-400 transition-colors">Study Workspace</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Capture your theological insights, tag exegetical levels, and organize notes on an interactive spatial mind map canvas.
            </p>
          </div>
          <span className="text-xs font-bold text-amber-400 mt-6 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            View Mind Map <span>→</span>
          </span>
        </Link>
      </section>

      {/* 3. Recent Notes & Pardes Framework */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Recent Notes Feed */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
            <h3 className="text-xl font-bold text-neutral-100">Recent Study Notes</h3>
            {token && notes.length > 0 && (
              <Link href="/notes" className="text-xs text-amber-400 hover:underline">
                View All Workspace Notes
              </Link>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-neutral-500">
              <span className="inline-block w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm">Fetching your study notes...</p>
            </div>
          ) : !token ? (
            /* Unauthenticated State */
            <div className="p-8 bg-neutral-900/20 border border-neutral-900 rounded-2xl text-center flex flex-col items-center gap-4 py-12">
              <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center text-neutral-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-neutral-250 font-bold text-base">Authentication Required</h4>
              <p className="text-neutral-500 text-sm max-w-md leading-relaxed">
                Sign in to save verse study notes, collaborate, categorise your findings with Pardes levels, and render them on a spatial mind map.
              </p>
              <button
                onClick={handleOpenAuth}
                className="mt-2 px-5 py-2.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 hover:border-amber-500/80 text-amber-300 hover:text-amber-200 font-bold rounded-xl transition-all text-sm cursor-pointer"
              >
                Sign In / Sign Up
              </button>
            </div>
          ) : notes.length === 0 ? (
            /* Empty State */
            <div className="p-8 bg-neutral-900/20 border border-neutral-900 rounded-2xl text-center flex flex-col items-center gap-4 py-12">
              <p className="text-neutral-450 text-sm italic">You haven't saved any theological study notes yet.</p>
              <Link
                href="/read"
                className="px-5 py-2.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-bold rounded-xl transition-all text-sm"
              >
                Start Reading Scripture
              </Link>
            </div>
          ) : (
            /* Notes List */
            <div className="flex flex-col gap-4">
              {notes.map((note) => {
                const pardes = parsePardesLevel(note.note_text);
                const displayNoteText = cleanNoteText(note.note_text);
                return (
                  <div 
                    key={note.id} 
                    className="p-5 bg-neutral-900/30 border border-neutral-900 rounded-2xl hover:border-neutral-800 transition-colors flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-4 border-b border-neutral-900/80 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <Link 
                          href={`/read/${note.verse?.osis_id || 'Gen.1.1'}`}
                          className="text-sm font-bold text-amber-400 hover:underline font-mono"
                        >
                          {note.verse?.osis_id || 'Verse'}
                        </Link>
                        {pardes && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${pardes.color}`}>
                            {pardes.name} ({pardes.label})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {new Date(note.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </span>
                    </div>

                    <p className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
                      {displayNoteText}
                    </p>

                    {note.verse?.english_text && (
                      <div className="bg-neutral-950/40 border border-neutral-900/50 rounded-lg p-2.5 text-xs text-neutral-450 italic mt-1">
                        "{note.verse.english_text}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Pardes Framework Guide */}
        <div className="flex flex-col gap-6">
          <div className="border-b border-neutral-900 pb-4">
            <h3 className="text-xl font-bold text-neutral-100">Pardes Exegesis</h3>
          </div>
          
          <div className="bg-neutral-900/20 border border-neutral-900 rounded-3xl p-6 flex flex-col gap-5">
            <p className="text-xs text-neutral-400 leading-relaxed">
              The <span className="text-amber-400 font-semibold">Pardes (פַּרְדֵּס)</span> framework is a traditional four-level system of scriptural interpretation. Tag your notes to structure your study:
            </p>

            <div className="flex flex-col gap-4">
              {/* Level 1 */}
              <div className="flex gap-3">
                <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-450 shrink-0">פ</span>
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-xs font-bold text-emerald-400">Peshat (פְּשָׁט — Plain)</h4>
                  <p className="text-[11px] text-neutral-500 leading-normal">
                    Literal, direct, and contextual meaning of the text. Tag with <code className="text-neutral-400 font-mono text-[10px] bg-neutral-950 px-1 py-0.5 rounded border border-neutral-900">#peshat</code>.
                  </p>
                </div>
              </div>

              {/* Level 2 */}
              <div className="flex gap-3">
                <span className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-450 shrink-0">ר</span>
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-xs font-bold text-blue-400">Remez (רֶמֶז — Hint)</h4>
                  <p className="text-[11px] text-neutral-500 leading-normal">
                    Allegorical meanings, symbolic representations, or structural hints. Tag with <code className="text-neutral-400 font-mono text-[10px] bg-neutral-950 px-1 py-0.5 rounded border border-neutral-900">#remez</code>.
                  </p>
                </div>
              </div>

              {/* Level 3 */}
              <div className="flex gap-3">
                <span className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-450 shrink-0">ד</span>
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-xs font-bold text-purple-400">Derash (דְּרַשׁ — Seek)</h4>
                  <p className="text-[11px] text-neutral-500 leading-normal">
                    Homiletic, midrashic comparative, or sermon applications. Tag with <code className="text-neutral-400 font-mono text-[10px] bg-neutral-950 px-1 py-0.5 rounded border border-neutral-900">#derash</code>.
                  </p>
                </div>
              </div>

              {/* Level 4 */}
              <div className="flex gap-3">
                <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-450 shrink-0">ס</span>
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-xs font-bold text-amber-400">Sod (סוֹד — Secret)</h4>
                  <p className="text-[11px] text-neutral-500 leading-normal">
                    Esoteric, spiritual, or mystical secrets (e.g. gematria, Kabbalistic). Tag with <code className="text-neutral-400 font-mono text-[10px] bg-neutral-950 px-1 py-0.5 rounded border border-neutral-900">#sod</code>.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-900 pt-3 text-[10px] text-neutral-550 italic leading-relaxed">
              Tip: When writing notes in the study workspace, append the hashtag (e.g., "#sod") anywhere in the text to assign a level.
            </div>
          </div>
        </div>

      </section>
    </div>
  );
}
