'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Verse, Word } from '@/lib/api';
import TheologicalNotes from '@/components/TheologicalNotes';
import ChapterAnalytics from '@/components/ChapterAnalytics';

interface InterlinearReaderProps {
  verses: Verse[];
  targetOsisId: string;
}

interface HebrewWordInfo {
  text: string;
  clean: string;
  segments: Word[];
  mainSegment: Word | null;
}

interface EnglishTokenInfo {
  token: string;
  clean: string;
  matchedWord: Word | null;
  isLinked: boolean;
}

// Helper to strip Hebrew diacritics (vowels, accents, and final punctuation)
function stripHebrew(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, '').replace(/[׃]/g, '').trim();
}

// Helper to clean English tokens for matching
function cleanEnglish(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Greedily match continuous Hebrew words with the constituent database word segments
function getHebrewWords(hebrewText: string, words: Word[]): HebrewWordInfo[] {
  const textWords = hebrewText.split(/\s+/).filter(Boolean);
  
  const cleanSegs = words.map(w => ({
    word: w,
    clean: stripHebrew(w.hebrew_segment)
  }));
  
  const result: HebrewWordInfo[] = [];
  let segIdx = 0;
  
  for (const textWord of textWords) {
    const cleanT = stripHebrew(textWord);
    const matchedSegs: Word[] = [];
    let currentConcat = "";
    
    while (segIdx < cleanSegs.length) {
      const seg = cleanSegs[segIdx];
      if (!seg.clean) {
        segIdx++;
        continue;
      }
      
      if (cleanT.startsWith(currentConcat + seg.clean)) {
        matchedSegs.push(seg.word);
        currentConcat += seg.clean;
        segIdx++;
        
        if (currentConcat === cleanT) {
          break;
        }
      } else {
        break;
      }
    }
    
    if (matchedSegs.length > 0) {
      // Find the main segment: prefer the one with strongs_number, then the longest
      let mainSeg = matchedSegs[0];
      for (const seg of matchedSegs) {
        if (seg.strongs_number && !mainSeg.strongs_number) {
          mainSeg = seg;
        } else if (seg.strongs_number && mainSeg.strongs_number) {
          if (seg.hebrew_segment.length > mainSeg.hebrew_segment.length) {
            mainSeg = seg;
          }
        } else if (!seg.strongs_number && !mainSeg.strongs_number) {
          if (seg.hebrew_segment.length > mainSeg.hebrew_segment.length) {
            mainSeg = seg;
          }
        }
      }
      
      result.push({
        text: textWord,
        clean: cleanT,
        segments: matchedSegs,
        mainSegment: mainSeg
      });
    } else {
      const fallbackSeg = words[segIdx] || words[words.length - 1] || null;
      if (fallbackSeg) {
        result.push({
          text: textWord,
          clean: cleanT,
          segments: [fallbackSeg],
          mainSegment: fallbackSeg
        });
        segIdx++;
      } else {
        result.push({
          text: textWord,
          clean: cleanT,
          segments: [],
          mainSegment: null
        });
      }
    }
  }
  
  return result;
}

// Match English tokens to the closest Hebrew counterpart segment based on stems and relative positions
function getEnglishTokens(englishText: string, words: Word[]): EnglishTokenInfo[] {
  const tokens = englishText.split(/(\s+)/);
  
  const nonWsIndices: number[] = [];
  tokens.forEach((t, idx) => {
    if (t.trim()) {
      nonWsIndices.push(idx);
    }
  });
  
  const totalTokens = nonWsIndices.length;
  let nonWsCount = 0;
  
  return tokens.map((token) => {
    if (/^\s+$/.test(token)) {
      return {
        token,
        clean: "",
        matchedWord: null,
        isLinked: false
      };
    }
    
    const cleanT = cleanEnglish(token);
    if (!cleanT) {
      return {
        token,
        clean: "",
        matchedWord: null,
        isLinked: false
      };
    }
    
    const tokenIndex = nonWsCount;
    nonWsCount++;
    
    let bestWord: Word | null = null;
    let bestScore = -1;
    let bestDist = Infinity;
    
    for (let j = 0; j < words.length; j++) {
      const w = words[j];
      if (!w.english_gloss) continue;
      
      const glossWords = w.english_gloss.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      let score = 0;
      for (const gw of glossWords) {
        if (gw === cleanT) {
          score = 10;
          break;
        } else if (cleanT.startsWith(gw) || gw.startsWith(cleanT)) {
          score = 5;
        }
      }
      
      if (score > 0) {
        const dist = Math.abs((tokenIndex / totalTokens) - (j / words.length));
        if (score > bestScore || (score === bestScore && dist < bestDist)) {
          bestScore = score;
          bestDist = dist;
          bestWord = w;
        }
      }
    }
    
    return {
      token,
      clean: cleanT,
      matchedWord: bestWord,
      isLinked: bestWord !== null
    };
  });
}

export default function InterlinearReader({ verses, targetOsisId }: InterlinearReaderProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [hoveredWord, setHoveredWord] = useState<Word | null>(null);
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const [isNotesExpanded, setIsNotesExpanded] = useState<boolean>(true);

  // Sync token from localStorage to check user login status
  useEffect(() => {
    const handleAuth = () => {
      setToken(localStorage.getItem('token'));
    };
    handleAuth();
    window.addEventListener('auth-change', handleAuth);
    return () => window.removeEventListener('auth-change', handleAuth);
  }, []);

  // Parse the target verse number (e.g., Gen.1.15 -> 15)
  const parts = targetOsisId.split('.');
  const targetVerseNum = parseInt(parts[2], 10) || 1;

  // Track the active verse (whose notes are currently loaded in the sidebar)
  const targetVerse = verses.find((v) => v.verse === targetVerseNum) || verses[0];
  const [activeVerse, setActiveVerse] = useState<Verse>(targetVerse);

  // Sync active verse and scroll target verse into view when route/verse changes
  useEffect(() => {
    const nextTarget = verses.find((v) => v.verse === targetVerseNum) || verses[0];
    setActiveVerse(nextTarget);

    setTimeout(() => {
      const el = document.getElementById(`verse-${targetVerseNum}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [targetVerseNum, verses]);

  const handleWordClick = (word: Word, verse: Verse) => {
    setSelectedWord(selectedWord?.id === word.id ? null : word);
    setActiveVerse(verse);
  };

  const bottomPaddingClass = token 
    ? (isNotesExpanded ? 'pb-[440px]' : 'pb-16') 
    : 'pb-6';

  return (
    <div className={`flex flex-col gap-6 w-full ${bottomPaddingClass}`}>
      {/* Toggle Analytics Button */}
      <div className="w-full flex justify-end">
        <button
          onClick={() => setShowAnalytics(!showAnalytics)}
          className={`px-4 py-2 border rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all duration-200
            ${showAnalytics 
              ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)] font-black' 
              : 'bg-zinc-900/60 border-zinc-800 text-neutral-500 hover:text-amber-400/80 hover:border-amber-500/30'
            }
          `}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {showAnalytics ? 'Hide Chapter Analytics' : 'Show Chapter Analytics'}
        </button>
      </div>

      {showAnalytics && (
        <div className="w-full animate-fadeIn" data-testid="density-heatmap">
          <ChapterAnalytics verses={verses} />
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 min-h-[500px] w-full">
        {/* Main Reading Workspace */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {verses.map((verse) => {
            const isTarget = verse.verse === targetVerseNum;
            const isActive = verse.id === activeVerse.id;

            // Generate mapped Hebrew and English word lists
            const hebrewWords = getHebrewWords(verse.hebrew_text || '', verse.words);
            const englishTokens = getEnglishTokens(verse.english_text || '', verse.words);

            return (
              <div
                key={verse.id}
                id={`verse-${verse.verse}`}
                onClick={() => setActiveVerse(verse)}
                className={`p-8 border rounded-2xl flex flex-col gap-5 transition-all duration-300 relative cursor-pointer
                  ${isTarget
                    ? 'bg-[#0f0e0c]/60 border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.08)] ring-1 ring-amber-500/20'
                    : isActive
                      ? 'bg-[#0e0e0e]/80 border-zinc-800'
                      : 'bg-[#070707] border-zinc-900/60 hover:border-zinc-850'
                  }
                `}
              >
                {/* Highlight Target Verse Badge */}
                {isTarget && (
                  <span className="absolute -top-3 left-6 bg-amber-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-md shadow-[0_2px_12px_rgba(245,158,11,0.3)] z-10">
                    Target Verse
                  </span>
                )}

                {/* Verse Header */}
                <div className="flex items-center justify-between border-b border-zinc-850/50 pb-3 text-xs text-neutral-600 font-semibold">
                  <span className="font-mono uppercase tracking-widest text-neutral-500">{verse.osis_id}</span>
                  <span className="tracking-wider">Verse {verse.verse}</span>
                </div>

                {/* Inline Hebrew Text (clickable words) */}
                <div
                  className={`text-3xl leading-loose font-serif text-center py-4 flex flex-row-reverse flex-wrap justify-center gap-x-3 gap-y-2`}
                  dir="rtl"
                >
                  {hebrewWords.map((hw, hwi) => {
                    const isSelected = selectedWord && hw.segments.some(s => selectedWord.id === s.id);
                    const isHovered = !selectedWord && hoveredWord && hw.segments.some(s => hoveredWord.id === s.id);
                    const isWordActive = isSelected || isHovered;
                    return (
                       <span
                        key={`hw-${hwi}`}
                        data-testid="hebrew-word"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hw.mainSegment) {
                            handleWordClick(hw.mainSegment, verse);
                          }
                        }}
                        onMouseEnter={() => {
                          if (hw.mainSegment) {
                            setHoveredWord(hw.mainSegment);
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredWord(null);
                        }}
                        className={`cursor-pointer transition-all duration-150 rounded-md border px-1.5 py-0.5 select-none ${
                          isWordActive
                            ? 'text-amber-400 bg-amber-500/15 border-amber-500/30 shadow-[0_1px_8px_rgba(245,158,11,0.15)] font-medium'
                            : selectedWord
                              ? 'text-amber-100/90 border-transparent'
                              : 'text-amber-100/90 hover:text-amber-300 hover:bg-amber-500/8 border-transparent hover:border-amber-500/10'
                        }`}
                      >
                        {hw.text}
                      </span>
                    );
                  })}
                </div>

                {/* Inline English Translation (clickable words) */}
                <div className="border-t border-zinc-850/50 pt-4 pb-2 text-base leading-relaxed text-left pl-4">
                  {englishTokens.map((et, ti) => {
                    if (!et.clean) {
                      return <span key={`ws-${ti}`} className="text-neutral-400">{et.token}</span>;
                    }

                    const isSelected = selectedWord && et.matchedWord && selectedWord.id === et.matchedWord.id;
                    const isHovered = !selectedWord && hoveredWord && et.matchedWord && hoveredWord.id === et.matchedWord.id;
                    const isWordActive = isSelected || isHovered;

                    if (et.isLinked && et.matchedWord) {
                      return (
                        <span
                          key={`en-${ti}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWordClick(et.matchedWord!, verse);
                          }}
                          onMouseEnter={() => {
                            setHoveredWord(et.matchedWord);
                          }}
                          onMouseLeave={() => {
                            setHoveredWord(null);
                          }}
                          className={`cursor-pointer transition-all duration-150 rounded border-b px-0.5 pb-0.5 ${
                            isWordActive
                              ? 'text-amber-300 bg-amber-500/15 border-amber-400/50 font-medium'
                              : selectedWord
                                ? 'text-neutral-400 italic border-transparent'
                                : 'text-neutral-400 italic hover:text-amber-200/80 hover:bg-amber-500/8 border-transparent hover:border-amber-500/20'
                          }`}
                        >
                          {et.token}
                        </span>
                      );
                    }

                    return (
                      <span key={`en-${ti}`} className="text-neutral-400 italic">
                        {et.token}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lexicon Details & Study Notes Sidebar */}
        <div className="w-full lg:w-96 shrink-0">
          <div className="sticky top-6 flex flex-col gap-5 max-h-[calc(100vh-3rem)] overflow-y-auto pr-1 custom-scrollbar">
            {/* Dictionary Panel */}
            <div className="p-5 pb-8 bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-5 h-fit min-h-[350px]">
              <h2 className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase border-b border-zinc-850/50 pb-3">
                Lexicon Dictionary
              </h2>

              {selectedWord ? (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-3xl font-serif text-amber-200">{selectedWord.hebrew_segment}</span>
                    {selectedWord.strongs_number && (
                      <span className="text-xs font-mono text-amber-500/90 font-bold bg-[#1a1200] border border-amber-500/20 px-1.5 py-0.5 rounded">
                        {selectedWord.strongs_number}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 text-sm border-b border-zinc-850/50 pb-3">
                    <p className="text-neutral-400">
                      <span className="font-semibold text-neutral-500">Translit:</span> <span className="italic font-mono text-neutral-300">{selectedWord.transliteration}</span>
                    </p>
                    {selectedWord.lexicon?.part_of_speech && (
                      <p className="text-neutral-400">
                        <span className="font-semibold text-neutral-500">Part of Speech:</span> <span className="text-amber-400/80 font-mono">{selectedWord.lexicon.part_of_speech}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <p className="text-neutral-250 text-lg font-semibold">
                      "{selectedWord.english_gloss}"
                    </p>
                    {selectedWord.lexicon?.lemma && (
                      <p className="text-sm text-neutral-400">
                        <span className="font-semibold text-neutral-500">Root Lemma:</span>{' '}
                        <span className="font-serif text-lg text-amber-200">{selectedWord.lexicon.lemma}</span>
                      </p>
                    )}
                  </div>

                  {selectedWord.lexicon?.definition ? (
                    <div className="flex flex-col gap-2 text-sm mt-1 border-t border-zinc-850/50 pt-3">
                      <h3 className="font-semibold text-neutral-500 text-xs tracking-wider uppercase">Strongs Definition:</h3>
                      <div 
                        className="text-neutral-400 leading-relaxed max-h-[160px] overflow-y-auto pr-1 custom-scrollbar text-xs"
                        dangerouslySetInnerHTML={{ __html: selectedWord.lexicon.definition }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500 italic mt-3">No extended dictionary entry available.</p>
                  )}

                  <Link 
                    href={`/cryptography/${selectedWord.id}`}
                    className="mt-4 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 border border-amber-500/30 hover:border-amber-500 rounded-xl text-center text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-[0_2px_10px_rgba(245,158,11,0.05)] cursor-pointer block"
                  >
                    View Cryptographic Analysis
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center my-auto py-8">
                  <svg className="w-12 h-12 text-neutral-800 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-neutral-500 text-xs leading-relaxed max-w-[180px]">
                    Select any word from the Hebrew or English text to view full lexical root definition.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Collapsible Bottom Drawer for Theological Notes (only when logged in) */}
      {token && (
        <div 
          className={`fixed bottom-0 left-0 md:left-64 right-0 z-30 bg-[#080808]/95 border-t border-zinc-800 backdrop-blur-md transition-all duration-300 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] flex flex-col
            ${isNotesExpanded ? 'h-[420px]' : 'h-12'}
          `}
        >
          {/* Header toggler */}
          <div 
            onClick={() => setIsNotesExpanded(!isNotesExpanded)}
            className="h-12 px-6 border-b border-zinc-850/60 flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Study Notes & Community Insights ({activeVerse.osis_id})
              </span>
            </div>
            <button className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-amber-400/80 transition-colors cursor-pointer">
              {isNotesExpanded ? '[ Collapse Notes ]' : '[ Expand Notes ]'}
            </button>
          </div>

          {/* Drawer Content */}
          {isNotesExpanded && (
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
              <TheologicalNotes 
                verseId={activeVerse.id} 
                verseOsisId={activeVerse.osis_id} 
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
