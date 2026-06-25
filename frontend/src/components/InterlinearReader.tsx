'use client';

import { useState, useEffect } from 'react';
import { Verse, Word } from '@/lib/api';
import TheologicalNotes from '@/components/TheologicalNotes';

interface InterlinearReaderProps {
  verses: Verse[];
  targetOsisId: string;
}

export default function InterlinearReader({ verses, targetOsisId }: InterlinearReaderProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

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

    // Bounded check for element rendering
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 min-h-[500px] w-full">
      {/* Main Reading Workspace (3 columns on large screens) */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        {verses.map((verse) => {
          const isTarget = verse.verse === targetVerseNum;
          const isActive = verse.id === activeVerse.id;

          return (
            <div
              key={verse.id}
              id={`verse-${verse.verse}`}
              onClick={() => setActiveVerse(verse)}
              className={`p-6 border rounded-2xl flex flex-col gap-5 transition-all duration-300 relative cursor-pointer
                ${isTarget
                  ? 'bg-amber-950/10 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.06)] ring-1 ring-amber-500/20'
                  : isActive
                    ? 'bg-neutral-900/40 border-neutral-750'
                    : 'bg-neutral-900/20 border-neutral-850 hover:border-neutral-800'
                }
              `}
            >
              {/* Highlight Target Verse Badge */}
              {isTarget && (
                <span className="absolute -top-2.5 left-6 bg-amber-500 text-neutral-950 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-md z-10">
                  Target Verse
                </span>
              )}

              {/* Verse Header */}
              <div className="flex items-center justify-between border-b border-neutral-850 pb-2.5 text-xs text-neutral-500 font-semibold">
                <span className="font-mono uppercase tracking-wider">{verse.osis_id}</span>
                <span>Verse {verse.verse}</span>
              </div>

              {/* Hebrew Text Block (RTL) */}
              <div 
                className={`text-3xl leading-relaxed text-amber-100 font-serif ${
                  verse.direction === 'rtl' ? 'text-right' : 'text-left'
                }`} 
                dir={verse.direction}
              >
                {verse.hebrew_text}
              </div>

              {/* English Translation */}
              <div className="border-t border-neutral-850/30 pt-3 text-neutral-350 text-base leading-relaxed italic">
                {verse.english_text}
              </div>

              {/* Interlinear Grid of Word Cards */}
              <div className="flex flex-col gap-2.5 mt-2">
                <span className="text-[10px] font-bold tracking-wider text-neutral-500 uppercase">Interlinear Breakdown</span>
                <div 
                  className={`flex flex-wrap justify-start gap-x-4 gap-y-6 p-5 bg-neutral-950/40 border border-neutral-900 rounded-xl ${
                    verse.direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                  dir={verse.direction}
                >
                  {verse.words.map((word) => {
                    const isWordSelected = selectedWord?.id === word.id;
                    return (
                      <div 
                        key={word.id}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent container selection
                          handleWordClick(word, verse);
                        }}
                        className={`flex flex-col items-center p-3 rounded-lg border cursor-pointer transition-all duration-200 w-28 select-none ${
                          verse.direction === 'rtl' ? 'text-right' : 'text-left'
                        }
                          ${isWordSelected 
                            ? 'bg-amber-950/20 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.12)] scale-105' 
                            : 'bg-neutral-900/40 border-neutral-850 hover:border-neutral-750 hover:bg-neutral-900/70'
                          }
                        `}
                      >
                        {/* 1. Hebrew Segment */}
                        <span className="text-lg font-serif text-amber-100 font-semibold mb-1">
                          {word.hebrew_segment}
                        </span>

                        {/* 2. Transliteration */}
                        <span className="text-[9px] text-neutral-450 font-mono italic mb-2 select-all truncate max-w-full" dir="ltr">
                          {word.transliteration || '—'}
                        </span>

                        {/* 3. Badges */}
                        <div className="flex flex-col gap-0.5 w-full mb-2" dir="ltr">
                          {word.strongs_number && (
                            <span className="text-[8px] font-mono font-bold text-center bg-neutral-950 text-amber-500 border border-neutral-850 rounded py-0.5 uppercase tracking-wide">
                              {word.strongs_number}
                            </span>
                          )}
                          {word.morph_code && (
                            <span className="text-[8px] font-mono text-center bg-neutral-950 text-teal-400 border border-neutral-850 rounded py-0.5 truncate" title={word.morph_detail || ''}>
                              {word.morph_code}
                            </span>
                          )}
                        </div>

                        {/* 4. English Gloss */}
                        <span className="text-xs text-neutral-300 font-medium text-center mt-auto truncate max-w-full" dir="ltr">
                          {word.english_gloss || '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lexicon Details & Study Notes Sidebar (1 column on large screens) */}
      <div className="lg:col-span-1">
        <div className="sticky top-6 flex flex-col gap-6">
          
          {/* Dictionary Panel */}
          <div className="p-6 bg-neutral-900/80 border border-neutral-800 rounded-2xl backdrop-blur-md shadow-2xl flex flex-col gap-5 h-fit min-h-[350px]">
            <h2 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase border-b border-neutral-800 pb-3">
              Lexicon Dictionary
            </h2>

            {selectedWord ? (
              <div className="flex flex-col gap-4 animate-fadeIn">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-3xl font-serif text-amber-100">{selectedWord.hebrew_segment}</span>
                  <span className="text-sm font-mono text-amber-500 font-bold">{selectedWord.strongs_number}</span>
                </div>

                <div className="flex flex-col gap-1 text-sm border-b border-neutral-800 pb-3">
                  <p className="text-neutral-450">
                    <span className="font-semibold">Translit:</span> <span className="italic font-mono">{selectedWord.transliteration}</span>
                  </p>
                  {selectedWord.lexicon?.part_of_speech && (
                    <p className="text-neutral-450">
                      <span className="font-semibold">Part of Speech:</span> <span className="text-teal-400 font-mono">{selectedWord.lexicon.part_of_speech}</span>
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-neutral-200 text-lg font-semibold">
                    "{selectedWord.english_gloss}"
                  </p>
                  {selectedWord.lexicon?.lemma && (
                    <p className="text-sm text-neutral-350">
                      <span className="font-semibold text-neutral-500">Root Lemma:</span>{' '}
                      <span className="font-serif text-lg text-amber-250">{selectedWord.lexicon.lemma}</span>
                    </p>
                  )}
                </div>

                {selectedWord.lexicon?.definition ? (
                  <div className="flex flex-col gap-2 text-sm mt-1 border-t border-neutral-800 pt-3">
                    <h3 className="font-semibold text-neutral-450">Strongs Definition:</h3>
                    <div 
                      className="text-neutral-350 leading-relaxed max-h-[220px] overflow-y-auto pr-1 custom-scrollbar text-xs"
                      dangerouslySetInnerHTML={{ __html: selectedWord.lexicon.definition }}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 italic mt-3">No extended dictionary entry available.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center my-auto py-8">
                <svg className="w-12 h-12 text-neutral-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <p className="text-neutral-550 text-xs leading-relaxed max-w-[180px]">
                  Select any word card from the reading panel to view full lexical root definition.
                </p>
              </div>
            )}
          </div>

          {/* Theological Notes Panel */}
          <TheologicalNotes 
            verseId={activeVerse.id} 
            verseOsisId={activeVerse.osis_id} 
          />
        </div>
      </div>
    </div>
  );
}
