'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  searchCryptography, 
  fetchBooks, 
  Book, 
  CryptographySearchResponseWord 
} from '@/lib/api';

export default function CryptographicSearch() {
  const router = useRouter();
  
  // Search parameters state
  const [gematriaAbsolute, setGematriaAbsolute] = useState<string>('');
  const [gematriaOrdinal, setGematriaOrdinal] = useState<string>('');
  const [gematriaReduced, setGematriaReduced] = useState<string>('');
  const [atbash, setAtbash] = useState<string>('');
  const [albam, setAlbam] = useState<string>('');
  const [atbah, setAtbah] = useState<string>('');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);

  // Books list for filtering
  const [books, setBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState<boolean>(true);

  // Search results state
  const [results, setResults] = useState<CryptographySearchResponseWord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Fetch books on mount
  useEffect(() => {
    async function loadBooks() {
      try {
        setLoadingBooks(true);
        const data = await fetchBooks();
        setBooks(data);
      } catch (err: any) {
        console.error('Failed to load books for filter:', err);
      } finally {
        setLoadingBooks(false);
      }
    }
    loadBooks();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check that at least one search field is populated
    if (
      !gematriaAbsolute && 
      !gematriaOrdinal && 
      !gematriaReduced && 
      !atbash.trim() && 
      !albam.trim() && 
      !atbah.trim()
    ) {
      setError('Please provide at least one search parameter (Gematria value or cipher match).');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasSearched(true);
      
      const params = {
        gematria_absolute: gematriaAbsolute ? parseInt(gematriaAbsolute, 10) : null,
        gematria_ordinal: gematriaOrdinal ? parseInt(gematriaOrdinal, 10) : null,
        gematria_reduced: gematriaReduced ? parseInt(gematriaReduced, 10) : null,
        atbash: atbash.trim() || null,
        albam: albam.trim() || null,
        atbah: atbah.trim() || null,
        limit
      };

      let searchResults = await searchCryptography(params);

      // Apply client-side Book Filter if selected
      if (selectedBook) {
        searchResults = searchResults.filter(word => {
          if (!word.verse_osis) return false;
          // OSIS structure: Book.Chapter.Verse (e.g. Gen.1.1)
          const bookCode = word.verse_osis.split('.')[0];
          return bookCode.toLowerCase() === selectedBook.toLowerCase();
        });
      }

      setResults(searchResults);
    } catch (err: any) {
      setError(err.message || 'An error occurred while executing the cryptographic search.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setGematriaAbsolute('');
    setGematriaOrdinal('');
    setGematriaReduced('');
    setAtbash('');
    setAlbam('');
    setAtbah('');
    setSelectedBook('');
    setResults([]);
    setHasSearched(false);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto p-4 md:p-6 text-neutral-200">
      {/* Header Info */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-amber-200">
          The Telescope: Cryptographic Database Explorer
        </h2>
        <p className="text-neutral-450 text-sm max-w-3xl leading-relaxed">
          Query the entire database of Hebrew words by absolute, ordinal, and reduced Gematria values, or search for Atbash, Albam, and Atbah cipher matches. Narrow your search by book.
        </p>
      </div>

      {/* Control Panel / Search Form */}
      <form onSubmit={handleSearch} className="p-6 bg-neutral-900/40 border border-neutral-850 rounded-2xl flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Gematria Filters */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-850 pb-2">
              Gematria Values
            </h3>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Absolute Gematria</label>
              <input 
                type="number" 
                value={gematriaAbsolute}
                onChange={(e) => setGematriaAbsolute(e.target.value)}
                placeholder="e.g. 26" 
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Ordinal Gematria</label>
              <input 
                type="number" 
                value={gematriaOrdinal}
                onChange={(e) => setGematriaOrdinal(e.target.value)}
                placeholder="e.g. 26" 
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Reduced Gematria</label>
              <input 
                type="number" 
                value={gematriaReduced}
                onChange={(e) => setGematriaReduced(e.target.value)}
                placeholder="e.g. 8" 
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-amber-500/80 transition-colors"
              />
            </div>
          </div>

          {/* Column 2: Cipher Filters */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-850 pb-2">
              Cipher Strings
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Atbash Cipher Match</label>
              <input 
                type="text" 
                value={atbash}
                onChange={(e) => setAtbash(e.target.value)}
                placeholder="Hebrew text (e.g. תשר)" 
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-amber-500/80 transition-colors text-right font-serif"
                dir="rtl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Albam Cipher Match</label>
              <input 
                type="text" 
                value={albam}
                onChange={(e) => setAlbam(e.target.value)}
                placeholder="Hebrew text (e.g. למנ)" 
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-amber-500/80 transition-colors text-right font-serif"
                dir="rtl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Atbah Cipher Match</label>
              <input 
                type="text" 
                value={atbah}
                onChange={(e) => setAtbah(e.target.value)}
                placeholder="Hebrew text (e.g. טחז)" 
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:border-amber-500/80 transition-colors text-right font-serif"
                dir="rtl"
              />
            </div>
          </div>

          {/* Column 3: Scope & Limit */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-850 pb-2">
              Scope & Limits
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Biblical Book Filter</label>
              <select 
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 focus:outline-none focus:border-amber-500/80 transition-colors"
                disabled={loadingBooks}
              >
                <option value="">All Books</option>
                {books.map((book) => (
                  <option key={book.id} value={book.osis_code}>
                    {book.name} ({book.osis_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400 font-medium">Max Results Limit ({limit})</label>
              <input 
                type="range"
                min="10"
                max="500"
                step="10"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                className="h-2 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-amber-500 my-2"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-neutral-850 pt-4 mt-2">
          <button 
            type="button"
            onClick={handleClear}
            className="px-4 py-2 bg-neutral-950 border border-neutral-800 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Clear Fields
          </button>
          
          <button 
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                Searching...
              </>
            ) : 'Execute Search'}
          </button>
        </div>
      </form>

      {/* Error Callout */}
      {error && (
        <div className="p-4 bg-red-950/10 border border-red-900/40 rounded-xl text-sm text-red-400 flex items-center gap-3">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Search Results */}
      {loading ? (
        <div className="flex flex-col gap-4 py-12">
          <div className="h-6 w-48 bg-neutral-900/40 border border-neutral-850 rounded animate-pulse" />
          <div className="w-full h-64 bg-neutral-900/20 border border-neutral-850 rounded-2xl animate-pulse" />
        </div>
      ) : results.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-wider text-neutral-400 uppercase">
              Matches Found ({results.length})
            </h3>
            <span className="text-xs text-neutral-500 font-mono">Click row to open in interlinear reader</span>
          </div>

          <div className="border border-neutral-850 rounded-2xl overflow-hidden bg-neutral-950/40 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-neutral-350">
                <thead className="bg-neutral-900/60 border-b border-neutral-850 text-xs font-bold uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="px-6 py-4">Verse ID</th>
                    <th className="px-6 py-4 text-right">Word</th>
                    <th className="px-6 py-4">Gloss</th>
                    <th className="px-4 py-4 text-center">Abs</th>
                    <th className="px-4 py-4 text-center">Ord</th>
                    <th className="px-4 py-4 text-center">Red</th>
                    <th className="px-6 py-4 text-right">Atbash</th>
                    <th className="px-6 py-4 text-right">Albam</th>
                    <th className="px-6 py-4 text-right">Atbah</th>
                    <th className="px-6 py-4">Verse Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900 font-medium">
                  {results.map((word) => (
                    <tr 
                      key={word.id}
                      onClick={() => {
                        if (word.verse_osis) {
                          router.push(`/read/${word.verse_osis}`);
                        }
                      }}
                      className="hover:bg-neutral-900/40 hover:text-amber-100 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3.5 font-mono text-amber-500/80 text-xs">{word.verse_osis || '—'}</td>
                      <td className="px-6 py-3.5 font-serif text-lg text-right font-semibold text-amber-100">{word.hebrew_segment}</td>
                      <td className="px-6 py-3.5 text-xs text-neutral-300 italic">{word.english_gloss || '—'}</td>
                      <td className="px-4 py-3.5 text-center font-bold text-amber-300/90">{word.gematria_absolute ?? '—'}</td>
                      <td className="px-4 py-3.5 text-center text-xs text-neutral-400">{word.gematria_ordinal ?? '—'}</td>
                      <td className="px-4 py-3.5 text-center text-xs text-neutral-400">{word.gematria_reduced ?? '—'}</td>
                      <td className="px-6 py-3.5 text-right font-serif text-teal-400/90 text-sm">{word.atbash || '—'}</td>
                      <td className="px-6 py-3.5 text-right font-serif text-neutral-450 text-sm">{word.albam || '—'}</td>
                      <td className="px-6 py-3.5 text-right font-serif text-neutral-450 text-sm">{word.atbah || '—'}</td>
                      <td className="px-6 py-3.5 text-xs text-neutral-450 max-w-xs truncate" title={word.verse_text || ''}>
                        {word.verse_text || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : hasSearched ? (
        <div className="p-12 text-center border border-dashed border-neutral-850 rounded-2xl flex flex-col items-center gap-4 bg-neutral-900/10">
          <svg className="w-12 h-12 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex flex-col gap-1">
            <h4 className="font-bold text-neutral-400">No matches found</h4>
            <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
              No Hebrew words in the database matched the selected numerical Gematria or cipher filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-16 text-center border border-dashed border-neutral-850/60 rounded-2xl flex flex-col items-center gap-4 bg-neutral-950/20">
          <svg className="w-16 h-16 text-neutral-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <div className="flex flex-col gap-1">
            <h4 className="font-bold text-neutral-500">Query Parameter Required</h4>
            <p className="text-xs text-neutral-600 max-w-sm leading-relaxed">
              Provide absolute, ordinal, or reduced Gematria values, or enter Atbash/Albam/Atbah cipher characters to query the SQL database.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
