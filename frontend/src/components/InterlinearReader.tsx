'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Verse, Word, fetchTemurahAnalysis, TemurahMatch } from '@/lib/api';
import TheologicalNotes from '@/components/TheologicalNotes';
import { Loader2 } from 'lucide-react';
import PaleoDecoder from '@/components/PaleoDecoder';

interface InterlinearReaderProps {
  verses: Verse[];
  targetOsisId: string;
  children?: React.ReactNode;
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

export default function InterlinearReader({ verses, targetOsisId, children }: InterlinearReaderProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [hoveredWord, setHoveredWord] = useState<Word | null>(null);
  const [showInterlinear, setShowInterlinear] = useState<boolean>(true);
  const [token, setToken] = useState<string | null>(null);
  const [isNotesExpanded, setIsNotesExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'lexicon' | 'pardes' | 'temurah'>('lexicon');
  const [isOverlayOpen, setIsOverlayOpen] = useState<boolean>(false);
  const [modalTransition, setModalTransition] = useState<boolean>(false);

  // Close overlay modal with exit transition
  const closeOverlay = () => {
    setModalTransition(false);
    setTimeout(() => {
      setIsOverlayOpen(false);
    }, 300);
  };

  // Esc key listener to close overlay modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOverlayOpen) {
        closeOverlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlayOpen]);

  // Trigger modal transition mount status
  useEffect(() => {
    if (isOverlayOpen) {
      const timer = setTimeout(() => setModalTransition(true), 10);
      return () => clearTimeout(timer);
    } else {
      setModalTransition(false);
    }
  }, [isOverlayOpen]);

  // Temurah states
  const [temurahMatches, setTemurahMatches] = useState<TemurahMatch[]>([]);
  const [loadingTemurah, setLoadingTemurah] = useState<boolean>(false);
  const [temurahError, setTemurahError] = useState<string | null>(null);

  // Fetch permutations when the tab switches to Temurah or the selected word changes
  useEffect(() => {
    if (activeTab === 'temurah' && selectedWord) {
      const wordToQuery = selectedWord.lexicon?.lemma || selectedWord.hebrew_segment;
      if (!wordToQuery) return;

      setLoadingTemurah(true);
      setTemurahError(null);

      fetchTemurahAnalysis(wordToQuery)
        .then((data) => {
          setTemurahMatches(data.matches || []);
          setLoadingTemurah(false);
        })
        .catch((err: any) => {
          console.error('Error fetching permutations:', err);
          setTemurahError(err.message || 'Failed to load permutations');
          setLoadingTemurah(false);
        });
    }
  }, [activeTab, selectedWord]);

  // Sync showInterlinear from localStorage after mounting to prevent SSR hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem('show-interlinear');
    if (saved !== null) {
      setShowInterlinear(saved === 'true');
    }
  }, []);

  const toggleInterlinear = () => {
    const nextVal = !showInterlinear;
    setShowInterlinear(nextVal);
    localStorage.setItem('show-interlinear', String(nextVal));
  };

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
    const isAlreadySelected = selectedWord?.id === word.id;
    setSelectedWord(isAlreadySelected ? null : word);
    setActiveVerse(verse);
    setIsOverlayOpen(!isAlreadySelected);
  };

  const bottomPaddingClass = token 
    ? (isNotesExpanded ? 'pb-[440px]' : 'pb-16') 
    : 'pb-6';

  return (
    <div className={`w-full ${bottomPaddingClass}`}>
      {/* Restructured Main Container splitting into two side-by-side columns */}
      <div className="flex flex-col lg:flex-row gap-8 min-h-[500px] w-full">
        {/* Center Column: Chapter Navigation, Analytics, and Verses */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {/* Chapter Navigation */}
          {children && (
            <div className="w-full max-w-2xl mx-auto">
              {children}
            </div>
          )}
          {/* Action Buttons: Interlinear Toggle */}
          <div className="flex flex-wrap items-center justify-end gap-3 mb-6 bg-neutral-950/40 p-3 rounded-2xl border border-neutral-900 w-fit self-end">
            <button
              onClick={toggleInterlinear}
              className={`px-4 py-2 border rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all duration-200
                ${showInterlinear 
                  ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)] font-black' 
                  : 'bg-zinc-900/60 border-zinc-800 text-neutral-500 hover:text-amber-400/80 hover:border-amber-500/30'
                }
              `}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
              {showInterlinear ? 'Interlinear ON' : 'Interlinear OFF'}
            </button>
          </div>

          {/* Verses breakdown */}
          <div className="flex flex-col gap-6">
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
                  {showInterlinear && (
                    <div
                      className="text-3xl leading-loose font-serif text-center py-4 flex flex-row-reverse flex-wrap justify-center gap-x-3 gap-y-2"
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
                  )}

                  {/* Inline English Translation (clickable words) */}
                  <div className={`text-base leading-relaxed text-left pl-4 ${
                    showInterlinear 
                      ? 'border-t border-zinc-850/50 pt-4 pb-2' 
                      : 'pb-2'
                  }`}>
                    {englishTokens.map((et, ti) => {
                      if (!et.clean) {
                        return (
                          <span key={`ws-${ti}`} className={showInterlinear ? "text-neutral-400" : "text-neutral-350"}>
                            {et.token}
                          </span>
                        );
                      }

                      const isSelected = selectedWord && et.matchedWord && selectedWord.id === et.matchedWord.id;
                      const isHovered = !selectedWord && hoveredWord && et.matchedWord && hoveredWord.id === et.matchedWord.id;
                      const isWordActive = isSelected || isHovered;

                      if (et.isLinked && et.matchedWord) {
                        const wordClasses = showInterlinear
                          ? (isWordActive
                              ? 'text-amber-300 bg-amber-500/15 border-amber-400/50 font-medium cursor-pointer transition-all duration-150'
                              : selectedWord
                                ? 'text-neutral-400 italic border-transparent cursor-pointer transition-all duration-150'
                                : 'text-neutral-400 italic hover:text-amber-200/80 hover:bg-amber-500/8 border-transparent hover:border-amber-500/20 cursor-pointer transition-all duration-150')
                          : (isWordActive
                              ? 'text-amber-400 bg-amber-500/15 border-amber-500/30 font-medium cursor-pointer transition-colors duration-200'
                              : selectedWord
                                ? 'text-neutral-450 border-transparent cursor-pointer transition-colors duration-200'
                                : 'text-neutral-300 hover:text-amber-400 hover:bg-amber-500/8 border-transparent hover:border-amber-500/20 cursor-pointer transition-colors duration-200');

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
                            className={`rounded border-b px-0.5 pb-0.5 ${wordClasses}`}
                          >
                            {et.token}
                          </span>
                        );
                      }

                      return (
                        <span key={`en-${ti}`} className={showInterlinear ? "text-neutral-400 italic" : "text-neutral-300"}>
                          {et.token}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Dedicated strictly to Lexicon/PARDES panel */}
        <div className="w-full lg:w-96 shrink-0">
          <div className="sticky top-6 flex flex-col gap-5 max-h-[calc(100vh-3rem)] overflow-y-auto pr-1 custom-scrollbar">
            {/* Dictionary Panel */}
            <div className="p-5 pb-8 bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex flex-col gap-5 h-fit min-h-[350px]">
              {/* Tab Toggle System */}
              <div className="flex border-b border-zinc-850/60 pb-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('lexicon')}
                  className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 cursor-pointer
                    ${activeTab === 'lexicon'
                      ? 'text-amber-400 border-amber-500'
                      : 'text-neutral-500 border-transparent hover:text-neutral-300'
                    }
                  `}
                >
                  Lexicon
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pardes')}
                  className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 cursor-pointer
                    ${activeTab === 'pardes'
                      ? 'text-amber-400 border-amber-500'
                      : 'text-neutral-500 border-transparent hover:text-neutral-300'
                    }
                  `}
                >
                  PARDES
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('temurah')}
                  className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all duration-200 border-b-2 cursor-pointer
                    ${activeTab === 'temurah'
                      ? 'text-amber-400 border-amber-500'
                      : 'text-neutral-500 border-transparent hover:text-neutral-300'
                    }
                  `}
                >
                  Permutations
                </button>
              </div>

              {selectedWord ? (
                activeTab === 'lexicon' ? (
                  isOverlayOpen ? (
                    <div className="flex flex-col items-center justify-center text-center my-auto py-8 animate-fadeIn">
                      <p className="text-neutral-500 text-xs leading-relaxed max-w-[180px]">
                        Lexicon definition is active in the full-page overlay.
                      </p>
                    </div>
                  ) : (
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
                          <span className="font-semibold text-neutral-550">Root Lemma:</span>{' '}
                          <span className="font-serif text-lg text-amber-200">{selectedWord.lexicon.lemma}</span>
                        </p>
                      )}
                    </div>

                    {selectedWord.hebrew_segment && (
                      <PaleoDecoder hebrew={selectedWord.hebrew_segment} isSidebar={true} />
                    )}

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
                ) ) : activeTab === 'temurah' ? (
                  <div className="flex flex-col gap-4 animate-fadeIn">
                    <div className="flex items-baseline justify-between border-b border-zinc-850/30 pb-2">
                      <span className="text-2xl font-serif text-amber-200">{selectedWord.hebrew_segment}</span>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest font-mono">Temurah Permutations</span>
                    </div>

                    {loadingTemurah ? (
                      <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono animate-pulse">Finding anagrams...</span>
                      </div>
                    ) : temurahError ? (
                      <p className="text-xs text-red-400 italic font-mono">Error loading permutations: {temurahError}</p>
                    ) : temurahMatches.length === 0 ? (
                      <div className="bg-zinc-900/10 border border-zinc-900/40 p-4 rounded-xl text-center text-xs text-neutral-500 italic leading-relaxed">
                        No other Strong's lexicon entries share these exact consonants (no anagrams found).
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                        <p className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider font-mono">
                          Found {temurahMatches.length} matching anagram{temurahMatches.length > 1 ? 's' : ''}:
                        </p>
                        {temurahMatches.map((match, idx) => (
                          <div key={idx} className="bg-zinc-900/20 border border-zinc-850/60 p-3 rounded-xl flex flex-col gap-1.5 hover:border-zinc-800 transition-colors">
                            <div className="flex justify-between items-baseline">
                              <span className="text-lg font-serif text-amber-250">{match.lemma}</span>
                              <span className="text-[9px] font-mono text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-900">{match.strongs_number}</span>
                            </div>
                            <div className="text-xs text-neutral-350">
                              {match.transliteration && <span className="italic font-semibold text-neutral-450 mr-1.5 font-mono">{match.transliteration}</span>}
                              {match.gloss && <span className="font-semibold text-amber-500/80">"{match.gloss}"</span>}
                            </div>
                            {match.definition && (
                              <div 
                                className="text-[10px] text-neutral-450 leading-relaxed max-h-[60px] overflow-y-auto pr-1 custom-scrollbar border-t border-zinc-900/60 pt-1 mt-1"
                                dangerouslySetInnerHTML={{ __html: match.definition }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-5 animate-fadeIn">
                    <div className="flex items-baseline justify-between border-b border-zinc-850/30 pb-2">
                      <span className="text-2xl font-serif text-amber-200">{selectedWord.hebrew_segment}</span>
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">PARDES Analysis</span>
                    </div>

                    <div className="flex flex-col gap-4">
                      {/* Level 1: Peshat */}
                      <div className="flex gap-3 bg-emerald-500/[0.02] border border-emerald-500/10 p-3.5 rounded-xl">
                        <span className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">פ</span>
                        <div className="flex flex-col gap-1.5 w-full">
                          <h4 className="text-xs font-bold text-emerald-400">Peshat (פְּשָׁט — Plain)</h4>
                          <p className="text-xs text-neutral-250 font-semibold font-mono bg-neutral-950/60 border border-neutral-900 px-1.5 py-0.5 rounded w-fit">
                            "{selectedWord.english_gloss}"
                          </p>
                          {selectedWord.lexicon?.definition ? (
                            <div 
                              className="text-[11px] text-neutral-450 leading-relaxed max-h-[80px] overflow-y-auto custom-scrollbar pr-0.5"
                              dangerouslySetInnerHTML={{ __html: selectedWord.lexicon.definition }}
                            />
                          ) : (
                            <p className="text-[11px] text-neutral-500 italic">No plain definition available.</p>
                          )}
                        </div>
                      </div>

                      {/* Level 2: Remez */}
                      <div className="flex gap-3 bg-blue-500/[0.02] border border-blue-500/10 p-3.5 rounded-xl">
                        <span className="w-6 h-6 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-450 shrink-0">ר</span>
                        <div className="flex flex-col gap-1.5 w-full text-xs">
                          <h4 className="text-xs font-bold text-blue-400">Remez (רֶמֶז — Hint)</h4>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-450">
                            <div>
                              <span className="font-semibold text-neutral-550">Translit:</span>{' '}
                              <span className="italic font-mono text-neutral-350">{selectedWord.transliteration || '—'}</span>
                            </div>
                            {selectedWord.lexicon?.part_of_speech && (
                              <div>
                                <span className="font-semibold text-neutral-550">POS:</span>{' '}
                                <span className="text-teal-400 font-mono">{selectedWord.lexicon.part_of_speech}</span>
                              </div>
                            )}
                            {selectedWord.morph_code && (
                              <div className="col-span-2">
                                <span className="font-semibold text-neutral-550">Morph:</span>{' '}
                                <span className="text-blue-400 font-mono" title={selectedWord.morph_detail || ''}>{selectedWord.morph_code}</span>
                              </div>
                            )}
                            {selectedWord.lexicon?.lemma && (
                              <div className="col-span-2 border-t border-zinc-850/40 pt-1.5 mt-0.5">
                                <span className="font-semibold text-neutral-550">Root Lemma:</span>{' '}
                                <span className="font-serif text-[13px] text-amber-200/90">{selectedWord.lexicon.lemma}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Level 3: Derash */}
                      <div className="flex gap-3 bg-purple-500/[0.02] border border-purple-500/10 p-3.5 rounded-xl">
                        <span className="w-6 h-6 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-450 shrink-0">ד</span>
                        <div className="flex flex-col gap-1.5 w-full text-xs">
                          <h4 className="text-xs font-bold text-purple-400">Derash (דְּרַשׁ — Seek)</h4>
                          <p className="text-[11px] text-neutral-450 leading-relaxed">
                            Search scriptural occurrences and concordance connections for this root lemma.
                          </p>
                          {selectedWord.lexicon?.lemma && (
                            <Link
                              href={`/search?query=${encodeURIComponent(selectedWord.lexicon.lemma)}`}
                              className="text-[11px] font-bold text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 mt-0.5"
                            >
                              Search Concordance →
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Level 4: Sod */}
                      <div className="flex gap-3 bg-amber-500/[0.02] border border-amber-500/10 p-3.5 rounded-xl">
                        <span className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-450 shrink-0">ס</span>
                        <div className="flex flex-col gap-2 w-full text-xs">
                          <h4 className="text-xs font-bold text-amber-400">Sod (סוֹד — Secret)</h4>
                          
                          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-neutral-400 border-b border-zinc-850/40 pb-2">
                            <div className="bg-neutral-950/60 p-1.5 rounded border border-neutral-900">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider mb-0.5">Abs</div>
                              <span className="font-mono text-amber-300 font-bold">{selectedWord.gematria_absolute ?? '—'}</span>
                            </div>
                            <div className="bg-neutral-950/60 p-1.5 rounded border border-neutral-900">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider mb-0.5">Ord</div>
                              <span className="font-mono text-amber-300 font-bold">{selectedWord.gematria_ordinal ?? '—'}</span>
                            </div>
                            <div className="bg-neutral-950/60 p-1.5 rounded border border-neutral-900">
                              <div className="text-neutral-500 text-[9px] uppercase tracking-wider mb-0.5">Red</div>
                              <span className="font-mono text-amber-300 font-bold">{selectedWord.gematria_reduced ?? '—'}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1 text-[11px] text-neutral-450">
                            <div>
                              <span className="font-semibold text-neutral-550 font-mono">Atbash:</span>{' '}
                              <span className="font-serif text-neutral-300">{selectedWord.atbash || '—'}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-550 font-mono">Albam:</span>{' '}
                              <span className="font-serif text-neutral-300">{selectedWord.albam || '—'}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-550 font-mono">Atbah:</span>{' '}
                              <span className="font-serif text-neutral-300">{selectedWord.atbah || '—'}</span>
                            </div>
                          </div>
                          
                          <Link 
                            href={`/cryptography/${selectedWord.id}`}
                            className="mt-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 border border-amber-500/30 hover:border-amber-500 rounded-lg text-center text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer block"
                          >
                            Open Cryptographic Dashboard
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center text-center my-auto py-8">
                  <svg className="w-12 h-12 text-neutral-800 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-neutral-500 text-xs leading-relaxed max-w-[180px]">
                    Select any word from the Hebrew or English text to view full {activeTab === 'lexicon' ? 'lexical root definition' : 'PARDES exegesis'}.
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

      {/* Full-Page Overlay Modal for Lexicon & Paleo-Hebrew Decoder */}
      {isOverlayOpen && selectedWord && (
        <div 
          className={`fixed inset-0 z-50 w-screen h-screen bg-black/90 backdrop-blur-md px-12 py-8 flex flex-col justify-between overflow-hidden transition-opacity duration-300 ease-out ${modalTransition ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={closeOverlay}
        >
          {/* Close Button */}
          <button
            onClick={closeOverlay}
            className="absolute top-6 right-6 text-neutral-455 hover:text-neutral-100 cursor-pointer p-2.5 rounded-full hover:bg-zinc-900 border border-zinc-800 transition-all z-10"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Transition wrapping content container */}
          <div 
            className={`w-full max-w-7xl mx-auto flex-1 flex flex-col justify-between h-full min-h-0 overflow-hidden transition-all duration-300 ease-out transform ${modalTransition ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Section */}
            <div className="flex flex-col gap-2 mb-4 shrink-0">
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.25em]">Advanced Cryptographic Overlay</span>
              <h2 className="text-sm text-neutral-500 font-bold uppercase tracking-wider">Scripture Lexicon & Paleo-Hebrew Analyzer</h2>
            </div>

            {/* Widescreen Flex Layout */}
            <div className="w-full flex flex-col md:flex-row items-stretch gap-8 px-8 py-6 min-h-0 overflow-hidden flex-1">
              
              {/* 1. LEFT COLUMN: LEMMA PROFILE */}
              <div className="flex-[2] bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.25em] mb-4">
                    Advanced Cryptographic Overlay
                  </div>
                  <h2 className="text-6xl font-bold text-amber-400 font-serif mb-2 tracking-wide">
                    {selectedWord.hebrew_segment}
                  </h2>
                  {selectedWord.strongs_number && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 inline-block text-[11px] font-mono text-amber-400 mb-6">
                      Strongs {selectedWord.strongs_number}
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-neutral-500 block">English Gloss</span>
                      <span className="text-2xl font-semibold text-white">"{selectedWord.english_gloss}"</span>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wider text-neutral-500 block">Transliteration</span>
                      <span className="text-sm font-mono italic text-neutral-300">{selectedWord.transliteration}</span>
                    </div>
                    {selectedWord.lexicon?.part_of_speech && (
                      <div>
                        <span className="text-xs uppercase tracking-wider text-neutral-500 block">Part of Speech</span>
                        <span className="text-sm font-semibold text-amber-500">{selectedWord.lexicon.part_of_speech}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {selectedWord.lexicon?.lemma && (
                  <div className="mt-8 pt-4 border-t border-neutral-800">
                    <span className="text-xs uppercase tracking-wider text-neutral-500 block mb-1">Root Lemma</span>
                    <span className="text-2xl font-bold text-neutral-200">{selectedWord.lexicon.lemma}</span>
                  </div>
                )}
              </div>

              {/* 2. CENTER COLUMN: PALEO-HEBREW DECODER TRACK */}
              <div className="flex-[5] flex flex-col min-h-0">
                {selectedWord.hebrew_segment && (
                  <PaleoDecoder hebrew={selectedWord.hebrew_segment} isSidebar={false} />
                )}
              </div>

              {/* 3. RIGHT COLUMN: STRONGS LEXICON COMPARTMENT */}
              <div className="flex-[3] bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 flex flex-col min-h-0">
                <h3 className="text-xs uppercase tracking-widest text-neutral-400 font-semibold border-b border-neutral-800 pb-4 mb-4">
                  Strongs Definition
                </h3>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar text-sm text-neutral-300 space-y-3 leading-relaxed font-sans min-h-0">
                  {selectedWord.lexicon?.definition ? (
                    <div 
                      className="text-sm text-neutral-300 space-y-3 leading-relaxed font-sans"
                      dangerouslySetInnerHTML={{ __html: selectedWord.lexicon.definition }}
                    />
                  ) : (
                    <p className="text-neutral-500 italic">No Strong's definition available.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="flex justify-between items-center w-full border-t border-zinc-900 pt-4 mt-4 shrink-0">
              <button
                onClick={closeOverlay}
                className="px-6 py-3 bg-zinc-900 hover:bg-zinc-850 text-neutral-355 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Back to Scripture Reader (Esc)
              </button>
              <Link 
                href={`/cryptography/${selectedWord.id}`}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-[0_4px_25px_rgba(245,158,11,0.25)] cursor-pointer"
              >
                View Cryptographic Analysis
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
