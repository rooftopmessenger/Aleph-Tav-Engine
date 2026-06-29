'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Grid, HelpCircle, Binary, RefreshCw, Sliders, Info } from 'lucide-react';

export interface ElsLexiconEntry {
  strongs_number: string;
  lemma: string;
  transliteration?: string | null;
  gloss?: string | null;
  definition?: string | null;
}

export interface ElsMatch {
  word: string;
  start_index: number;
  skip: number;
  indices: number[];
  lexicon_entries: ElsLexiconEntry[];
}

interface ElsMatrixProps {
  consonants: string;
  matches: ElsMatch[];
  osisId: string;
  onVerseChange?: (osisId: string) => void;
  availableVerses?: string[];
}

export default function ElsMatrix({ 
  consonants, 
  matches, 
  osisId, 
  onVerseChange, 
  availableVerses = [] 
}: ElsMatrixProps) {
  const [selectedMatch, setSelectedMatch] = useState<ElsMatch | null>(null);
  const [gridCols, setGridCols] = useState<number>(12);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tempOsisId, setTempOsisId] = useState<string>(osisId);
  const [sortBy, setSortBy] = useState<'skip' | 'length' | 'alphabetical'>('length');
  const [showDirectOnly, setShowDirectOnly] = useState<boolean>(false); // Only skips > 0 or all

  // Sync tempOsisId when osisId changes from parent
  useEffect(() => {
    setTempOsisId(osisId);
  }, [osisId]);

  const handleLoadVerse = () => {
    if (tempOsisId.trim() && onVerseChange) {
      onVerseChange(tempOsisId.trim());
    }
  };

  // Auto-set the selected match to the first one when matches load
  useEffect(() => {
    if (matches && matches.length > 0 && !selectedMatch) {
      // Find a highly interesting match (e.g., length >= 4 or skip != 1/-1)
      const interesting = matches.find(m => Math.abs(m.skip) > 1 && m.word.length >= 4) || matches[0];
      setSelectedMatch(interesting);
      // Auto-align grid width to the skip value if it's positive and > 1
      const absSkip = Math.abs(interesting.skip);
      if (absSkip > 1 && absSkip < 25) {
        setGridCols(absSkip);
      }
    }
  }, [matches]);

  // Handle auto-aligning grid columns to the skip value of the selected match
  const handleAutoAlign = () => {
    if (selectedMatch) {
      const absSkip = Math.abs(selectedMatch.skip);
      if (absSkip > 1 && absSkip <= 40) {
        setGridCols(absSkip);
      }
    }
  };

  // Filter and sort matches
  const filteredMatches = useMemo(() => {
    let result = [...matches];

    // Filter by search query (word, Strong's number, or gloss)
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(m => {
        const matchesWord = m.word.includes(query);
        const matchesLexicon = m.lexicon_entries.some(entry => 
          entry.strongs_number.toLowerCase().includes(query) ||
          (entry.gloss && entry.gloss.toLowerCase().includes(query)) ||
          (entry.definition && entry.definition.toLowerCase().includes(query))
        );
        return matchesWord || matchesLexicon;
      });
    }

    // Filter by forward/backward
    if (showDirectOnly) {
      result = result.filter(m => m.skip > 0);
    }

    // Sort matches
    result.sort((a, b) => {
      if (sortBy === 'length') {
        // Primary: longer words first, Secondary: smaller absolute skips
        if (b.word.length !== a.word.length) {
          return b.word.length - a.word.length;
        }
        return Math.abs(a.skip) - Math.abs(b.skip);
      } else if (sortBy === 'skip') {
        // Primary: smaller absolute skips first
        return Math.abs(a.skip) - Math.abs(b.skip);
      } else {
        // Alphabetical
        return a.word.localeCompare(b.word);
      }
    });

    return result;
  }, [matches, searchQuery, sortBy, showDirectOnly]);

  // Convert the flat consonant string to tiles list
  const tiles = useMemo(() => {
    return consonants.split('');
  }, [consonants]);

  // Find if a tile index is part of the currently selected ELS word
  const getHighlightInfo = (index: number) => {
    if (!selectedMatch) return { isHighlighted: false, order: 0 };
    const order = selectedMatch.indices.indexOf(index);
    return {
      isHighlighted: order !== -1,
      order: order + 1 // 1-based order in sequence
    };
  };

  const currentVerseLabel = osisId.replace('.', ' ').replace('.', ':');

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn font-sans text-neutral-200">
      {/* Unified ELS Control Toolbar */}
      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 shadow-xl flex flex-wrap md:flex-nowrap items-end gap-4 w-full">
        {/* 1. Target Verse Selection */}
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <Binary className="w-3.5 h-3.5 text-amber-500" />
            Target Verse (OSIS ID)
          </label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                list="els-verses-list"
                value={tempOsisId}
                onChange={(e) => setTempOsisId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLoadVerse();
                }}
                placeholder="e.g. 1Kgs.7.16"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500/65 focus:ring-1 focus:ring-amber-500/25 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-neutral-200 placeholder-neutral-600 focus:outline-none transition-all"
              />
              <datalist id="els-verses-list">
                {availableVerses.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <button
              onClick={handleLoadVerse}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[10px] font-black uppercase text-amber-500 cursor-pointer transition-all active:scale-95 flex items-center gap-1 hover:border-amber-500/30 font-mono"
            >
              Load
            </button>
          </div>
        </div>

        {/* 2. ELS Word Filter */}
        <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
          <label className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <Search className="w-3.5 h-3.5 text-amber-500" />
            Search Found ELS Words
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-neutral-600" />
            <input
              type="text"
              placeholder="Search word, Strong's, gloss..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 focus:border-amber-500/65 focus:ring-1 focus:ring-amber-500/25 rounded-lg text-[11px] text-neutral-200 placeholder-neutral-600 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* 3. Grid Columns Control */}
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <label className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1.5 font-mono">
            <Grid className="w-3.5 h-3.5 text-amber-500" />
            Grid Width (Columns): {gridCols}
          </label>
          <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1 border border-zinc-800 rounded-lg h-[29.5px]">
            <input
              type="range"
              min="2"
              max="30"
              value={gridCols}
              onChange={(e) => setGridCols(parseInt(e.target.value))}
              className="w-20 accent-amber-500 h-1 rounded bg-zinc-800 outline-none cursor-pointer"
            />
            <div className="flex gap-0.5 ml-1">
              <button 
                onClick={() => setGridCols(prev => Math.max(2, prev - 1))}
                className="px-1.5 bg-zinc-950 hover:bg-zinc-800 text-[8px] font-bold rounded cursor-pointer border border-zinc-900 active:scale-90"
              >
                -
              </button>
              <button 
                onClick={() => setGridCols(prev => Math.min(30, prev + 1))}
                className="px-1.5 bg-zinc-950 hover:bg-zinc-800 text-[8px] font-bold rounded cursor-pointer border border-zinc-900 active:scale-90"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* 4. Auto-Align Button */}
        {selectedMatch && (
          <div className="flex flex-col justify-end">
            <button
              onClick={handleAutoAlign}
              disabled={Math.abs(selectedMatch.skip) <= 1 || Math.abs(selectedMatch.skip) > 30}
              className="flex items-center justify-center gap-1 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 disabled:opacity-40 border border-neutral-800 rounded-lg text-[10px] font-black uppercase text-neutral-300 cursor-pointer disabled:cursor-not-allowed transition-all active:scale-95 h-[29.5px] font-mono"
              title="Align grid width to current word skip size"
            >
              <RefreshCw className="w-3 h-3 text-amber-500 animate-spin-slow" />
              Auto-Align ({Math.abs(selectedMatch.skip)})
            </button>
          </div>
        )}
      </div>

      {/* Info Stats Ribbon */}
      <div className="flex items-center justify-between bg-zinc-900/15 px-4 py-2.5 rounded-xl border border-zinc-900/60 text-[10px] font-bold text-neutral-450">
        <span>Current Verse consonants: <span className="text-amber-500 font-mono">{tiles.length}</span> | Matched ELS Vocabulary count: <span className="text-amber-500 font-mono">{matches.length}</span></span>
        <span className="text-neutral-500 italic">Vowels, spaces, and diacritics stripped for scan.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-stretch w-full">
        {/* Left Side: Decoded Words List (col-span-3) */}
        <div className="lg:col-span-3 bg-zinc-950 p-4 rounded-2xl border border-zinc-900 shadow-xl flex flex-col max-h-[620px] min-h-[500px]">
          <div className="border-b border-zinc-900 pb-3 mb-3">
            <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block mb-2 font-mono">Decoded ELS Corpus</span>

            {/* Sorts & Toggles */}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] text-neutral-500 font-bold uppercase">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-800 text-[8px] font-bold rounded px-1.5 py-0.5 text-neutral-450 focus:outline-none focus:border-amber-500/40"
                >
                  <option value="length">Length</option>
                  <option value="skip">Skip Interval</option>
                  <option value="alphabetical">Alphabetical</option>
                </select>
              </div>

              <label className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDirectOnly}
                  onChange={(e) => setShowDirectOnly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-5 h-3 bg-zinc-900 border border-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:bg-neutral-600 peer-checked:after:bg-amber-500 after:rounded-full after:h-2 after:w-2 after:transition-all peer-checked:bg-amber-500/10 peer-checked:border-amber-500/30 flex items-center p-[1px]"></div>
                <span className="text-[8px] text-neutral-500 font-bold uppercase">Forward Only</span>
              </label>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin">
            {filteredMatches.length === 0 ? (
              <div className="text-center py-10 text-neutral-600 text-[10px] italic">
                No ELS matches found
              </div>
            ) : (
              filteredMatches.map((match, idx) => {
                const isSelected = selectedMatch?.word === match.word && selectedMatch?.start_index === match.start_index && selectedMatch?.skip === match.skip;
                const mainGloss = match.lexicon_entries[0]?.gloss || '—';
                const mainStrongs = match.lexicon_entries[0]?.strongs_number || '';
                
                return (
                  <button
                    key={`match-item-${idx}`}
                    onClick={() => {
                      setSelectedMatch(match);
                      // Auto-align grid columns to the skip value if it's positive and reasonably small
                      const absSkip = Math.abs(match.skip);
                      if (absSkip > 1 && absSkip <= 24) {
                        setGridCols(absSkip);
                      }
                    }}
                    className={`text-left p-2.5 rounded-lg border text-[10px] transition-all cursor-pointer flex justify-between items-center ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-sm shadow-amber-500/5'
                        : 'bg-zinc-900/20 border-zinc-900/60 hover:bg-zinc-900/40 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-xs font-serif text-neutral-100" dir="rtl">{match.word}</span>
                        <span className="text-[8px] font-mono text-neutral-500">({mainStrongs})</span>
                      </div>
                      <span className="text-[9px] text-neutral-450 italic capitalize">{mainGloss}</span>
                    </div>
                    
                    <div className="text-right flex flex-col items-end gap-0.5">
                      <span className={`font-mono text-[8.5px] font-black px-1.5 py-0.2 rounded border ${
                        match.skip > 0 
                          ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' 
                          : 'text-rose-400 bg-rose-950/20 border-rose-900/30'
                      }`}>
                        skip: {match.skip > 0 ? `+${match.skip}` : match.skip}
                      </span>
                      <span className="text-[7.5px] text-neutral-550 font-bold uppercase">len: {match.word.length}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center/Right: Consonantal Matrix (col-span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Matrix Box */}
          <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-900 shadow-xl flex flex-col gap-4 flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900 pb-3 gap-3">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono">Letter Grid</span>
              </div>
              <span className="text-[10px] text-neutral-500 font-bold font-mono">
                Consonants: {tiles.length} | Columns: {gridCols}
              </span>
            </div>

            {/* Matrix Consonant Board */}
            <div className="flex-1 min-h-[250px] max-h-[360px] overflow-y-auto bg-zinc-900/10 p-4 rounded-xl border border-zinc-900/60 flex items-center justify-center scrollbar-thin">
              <div 
                className="grid gap-1.5 select-none w-fit p-1 bg-zinc-950/40 rounded-lg border border-zinc-900/30"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`
                }}
              >
                {tiles.map((letter, idx) => {
                  const { isHighlighted, order } = getHighlightInfo(idx);
                  
                  return (
                    <div
                      key={`matrix-tile-${idx}`}
                      className={`relative w-8 h-8 rounded flex items-center justify-center font-serif text-sm font-bold border transition-all ${
                        isHighlighted
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)] scale-105 z-10'
                          : 'bg-zinc-900/30 border-zinc-900 text-neutral-500 hover:text-neutral-350 hover:bg-zinc-900/60'
                      }`}
                      title={`Consonant: ${letter} | Index: ${idx}`}
                    >
                      {/* Character */}
                      <span>{letter}</span>
                      
                      {/* Character order in ELS word */}
                      {isHighlighted && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-zinc-950 text-[7px] font-mono font-black flex items-center justify-center shadow-sm">
                          {order}
                        </span>
                      )}

                      {/* Subtle index on tile corner */}
                      <span className="absolute bottom-0.5 right-0.5 text-[5.5px] font-mono text-neutral-600/40 leading-none">
                        {idx}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Word Data Card */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-xl min-h-[140px] flex flex-col justify-center">
            {!selectedMatch ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-center">
                <HelpCircle className="w-6 h-6 text-neutral-650" />
                <span className="text-[10px] text-neutral-550 italic">Select an ELS word to decode its details</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Header info */}
                <div className="flex justify-between items-start gap-4 border-b border-zinc-900 pb-2">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-neutral-500 font-extrabold uppercase tracking-wider">Active ELS Sequence</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-xl font-black text-amber-500 font-serif" dir="rtl">{selectedMatch.word}</span>
                      <span className="text-[10px] text-neutral-450 italic font-mono">
                        (Start: {selectedMatch.start_index} | Skip: {selectedMatch.skip})
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] text-neutral-500 font-extrabold uppercase tracking-wider">Sequence Indices</span>
                    <span className="text-[8.5px] font-mono font-bold text-neutral-450 mt-1 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title={selectedMatch.indices.join(', ')}>
                      [{selectedMatch.indices.join(', ')}]
                    </span>
                  </div>
                </div>

                {/* Lexicon Details */}
                <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto scrollbar-thin">
                  {selectedMatch.lexicon_entries.map((entry, idx) => (
                    <div key={`entry-details-${idx}`} className="bg-zinc-900/10 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-1">
                      <div className="flex justify-between items-baseline border-b border-zinc-900 pb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-black text-amber-500/90">{entry.strongs_number}</span>
                          <span className="text-xs font-bold text-neutral-200 font-serif" dir="rtl">{entry.lemma}</span>
                          {entry.transliteration && (
                            <span className="text-[9px] text-neutral-500 italic">/{entry.transliteration}/</span>
                          )}
                        </div>
                        <span className="text-[9.5px] font-black text-amber-500/90 capitalize">
                          {entry.gloss || '—'}
                        </span>
                      </div>
                      {entry.definition ? (
                        <p className="text-[9px] text-neutral-450 leading-relaxed italic">
                          {entry.definition.replace(/<[^>]+>/g, '')}
                        </p>
                      ) : (
                        <span className="text-[9px] text-neutral-550 italic">No definition details available</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
