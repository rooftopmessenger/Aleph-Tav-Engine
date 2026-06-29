'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface VerseMatch {
  id: number;
  osis_id: string;
  english_text: string;
  hebrew_text: string | null;
  score: number;
}

interface LexiconMatch {
  strongs_number: string;
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  part_of_speech: string | null;
  gloss: string | null;
  definition: string | null;
  score: number;
}

interface SearchResults {
  verses: VerseMatch[];
  lexicon: LexiconMatch[];
}

export default function LocalSemanticSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch(`/api/search/semantic?q=${encodeURIComponent(query.trim())}`);
      
      if (!response.ok) {
        let errorMessage = `Server returned error: ${response.statusText} (${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.detail) {
            errorMessage = errorData.detail;
          }
        } catch (_) {
          // If response.json() fails, stick to default statusText message
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResults(data);
    } catch (err: any) {
      console.error('Semantic search error:', err);
      setError(err.message || 'An error occurred during search.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatScore = (score: number) => {
    // FAISS Inner Product on normalized vectors returns cosine similarity [-1, 1]
    // Bound it to [0, 1] for display purposes
    const boundedScore = Math.max(0, Math.min(1, score));
    return `${(boundedScore * 100).toFixed(1)}%`;
  };

  const getBookName = (osisId: string) => {
    const parts = osisId.split('.');
    return parts[0] || osisId;
  };

  const formatReference = (osisId: string) => {
    const parts = osisId.split('.');
    if (parts.length >= 3) {
      return `${parts[0]} ${parts[1]}:${parts[2]}`;
    }
    return osisId;
  };

  return (
    <div className="flex-1 flex flex-col w-full gap-6 px-4 md:px-8 max-w-7xl mx-auto">
      {/* Description Header */}
      <div className="text-center max-w-2xl mx-auto mt-2">
        <h2 className="text-xl font-bold text-neutral-100 tracking-wide">Local Semantic Search</h2>
        <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
          Vector-search both the English Scripture and the Strong's Hebrew/Greek Lexicon in parallel.
          Find matching verses and lexicon terms conceptually, even if they don't share exact keywords.
        </p>
      </div>

      {/* Search Input Card */}
      <div className="w-full max-w-3xl mx-auto bg-neutral-900/40 border border-neutral-850 p-4 md:p-6 rounded-2xl shadow-xl backdrop-blur-sm">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a query (e.g. 'covenant of peace', 'breath of life', 'divine order')..."
            className="flex-1 px-4 py-3 bg-neutral-950/80 border border-neutral-800 hover:border-neutral-700 focus:border-amber-500/80 rounded-xl text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!isMounted || isLoading || !query.trim()}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-bold rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-neutral-950" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Searching</span>
              </>
            ) : (
              <span>Search</span>
            )}
          </button>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs flex flex-col gap-1.5">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Search Error</span>
            <p>{error}</p>
            {error.includes("index has not been generated") && (
              <div className="mt-1 p-2 bg-neutral-950/60 border border-neutral-800/80 rounded-lg text-neutral-400 font-mono text-[10px]">
                To fix: Run the embedding pipeline on the backend:
                <br />
                <code className="text-amber-400 select-all block mt-1">uv run python generate_embeddings.py</code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dual Pane Results View */}
      {results && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mt-2">
          {/* Left Pane: Scripture Verses */}
          <div className="flex flex-col gap-4 bg-neutral-900/20 border border-neutral-850 p-4 md:p-6 rounded-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-neutral-850">
              <h3 className="font-bold text-amber-500 uppercase tracking-wider text-xs">Scripture Matches</h3>
              <span className="text-[10px] text-neutral-500 font-mono">{results.verses.length} verses found</span>
            </div>

            {results.verses.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-xs">No conceptual verse matches found.</div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1">
                {results.verses.map((verse) => (
                  <div
                    key={verse.id}
                    className="p-4 bg-neutral-900/40 border border-neutral-850/60 hover:border-neutral-700/80 hover:bg-neutral-900/60 rounded-xl transition-all group flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => router.push(`/read/${verse.osis_id}`)}
                        className="text-xs font-bold text-amber-400 hover:text-amber-300 font-mono transition-all cursor-pointer text-left hover:underline"
                      >
                        {formatReference(verse.osis_id)}
                      </button>
                      <span className="text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                        {formatScore(verse.score)} match
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed font-sans mt-0.5">
                      {verse.english_text}
                    </p>
                    {verse.hebrew_text && (
                      <p className="text-sm text-neutral-400 font-serif leading-relaxed mt-1 text-right" dir="rtl">
                        {verse.hebrew_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Pane: Lexicon Entries */}
          <div className="flex flex-col gap-4 bg-neutral-900/20 border border-neutral-850 p-4 md:p-6 rounded-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-neutral-850">
              <h3 className="font-bold text-amber-500 uppercase tracking-wider text-xs">Strong's Lexicon Matches</h3>
              <span className="text-[10px] text-neutral-500 font-mono">{results.lexicon.length} terms found</span>
            </div>

            {results.lexicon.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-xs">No conceptual lexicon matches found.</div>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1">
                {results.lexicon.map((entry) => (
                  <div
                    key={entry.strongs_number}
                    className="p-4 bg-neutral-900/40 border border-neutral-850/60 hover:border-neutral-700/80 hover:bg-neutral-900/60 rounded-xl transition-all flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-400">
                          {entry.strongs_number}
                        </span>
                        <span className="text-sm font-bold text-neutral-200 font-serif" dir={entry.strongs_number.startsWith('H') ? 'rtl' : 'ltr'}>
                          {entry.lemma}
                        </span>
                        {entry.transliteration && (
                          <span className="text-[10px] italic text-neutral-400 font-sans">
                            ({entry.transliteration})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {formatScore(entry.score)} match
                      </span>
                    </div>

                    {/* Part of Speech & Gloss */}
                    <div className="flex flex-wrap gap-2 items-center text-[10px]">
                      {entry.part_of_speech && (
                        <span className="px-1.5 py-0.5 bg-neutral-950 rounded text-neutral-500 font-mono">
                          {entry.part_of_speech}
                        </span>
                      )}
                      {entry.gloss && (
                        <span className="font-bold text-amber-400/80 font-sans text-xs">
                          {entry.gloss}
                        </span>
                      )}
                    </div>

                    {/* Extended Definition */}
                    {entry.definition && (
                      <p className="text-xs text-neutral-400 leading-relaxed font-sans border-t border-neutral-850/40 pt-1.5 mt-0.5">
                        {entry.definition.length > 250 ? (
                          <>
                            {entry.definition.slice(0, 250)}...
                          </>
                        ) : (
                          entry.definition
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
