'use client';

import React from 'react';
import paleoLexiconData from '@/lib/paleo_lexicon.json';

interface PaleoLetterInfo {
  letter: string;
  pictograph: string;
  meaning: string;
}

const paleoLexicon: Record<string, PaleoLetterInfo> = paleoLexiconData as Record<string, PaleoLetterInfo>;

function cleanConsonants(hebrew: string): string {
  if (!hebrew) return '';
  return hebrew.replace(/[\u0591-\u05C7]/g, '');
}

function generateSynthesis(consonants: string[]): string {
  if (consonants.length === 0) return '';
  
  const synthesisGlosses: Record<string, string> = {
    'א': 'Strength/Leader', 'ב': 'House/Family', 'ג': 'Walk/Gather', 'ד': 'Door/Pathway',
    'ה': 'Behold/Reveal', 'ו': 'Hook/Secure', 'ז': 'Cut/Nourish', 'ח': 'Wall/Separate',
    'ט': 'Basket/Contain', 'י': 'Hand/Work', 'כ': 'Palm/Open', 'ך': 'Palm/Open',
    'ל': 'Staff/Authority', 'מ': 'Water/Chaos', 'ם': 'Water/Chaos', 'נ': 'Seed/Life',
    'ן': 'Seed/Life', 'ס': 'Prop/Support', 'ע': 'Eye/See', 'פ': 'Mouth/Speak',
    'ף': 'Mouth/Speak', 'צ': 'Hook/Desire', 'ץ': 'Hook/Desire', 'ק': 'Horizon/Condense',
    'ר': 'Head/Chief', 'ש': 'Teeth/Consume', 'ת': 'Sign/Covenant'
  };

  const letterNames: Record<string, string> = {
    'א': 'Aleph', 'ב': 'Bet', 'ג': 'Gimel', 'ד': 'Dalet', 'ה': 'Hey',
    'ו': 'Vav', 'ז': 'Zayin', 'ח': 'Chet', 'ט': 'Tet', 'י': 'Yod',
    'כ': 'Kaf', 'ך': 'Kaf', 'ל': 'Lamed', 'מ': 'Mem', 'ם': 'Mem',
    'נ': 'Nun', 'ן': 'Nun', 'ס': 'Samekh', 'ע': 'Ayin', 'פ': 'Pey',
    'ף': 'Pey', 'צ': 'Tsade', 'ץ': 'Tsade', 'ק': 'Kof', 'ר': 'Resh',
    'ש': 'Shin', 'ת': 'Tav'
  };

  const leftSide = consonants
    .map(char => `${letterNames[char] || char} [${char}]`)
    .join(' + ');

  const rootStr = consonants.join('');
  let customSynthesis = '';

  if (rootStr === 'אב') {
    customSynthesis = 'The Strength [Aleph] of the House [Bet] (Father)';
  } else if (rootStr === 'אל') {
    customSynthesis = 'The Strong Leader [Aleph] wielding Authority [Lamed] (God)';
  } else if (rootStr === 'בן') {
    customSynthesis = 'The continuation of life [Nun] in the House [Bet] (Son)';
  } else if (rootStr === 'בת') {
    customSynthesis = 'The Covenant Mark [Tav] of the House [Bet] (Daughter)';
  } else if (rootStr === 'יד') {
    customSynthesis = 'The Hand [Yod] opening a Pathway/Door [Dalet] (Hand/Power)';
  } else if (rootStr === 'אור') {
    customSynthesis = 'The Leader/First [Aleph] connecting [Vav] to the Head/Beginning [Resh] (Light)';
  } else if (rootStr === 'אמת') {
    customSynthesis = 'The First/Strength [Aleph] in the Chaos [Mem] sealed by the Covenant Mark [Tav] (Truth)';
  } else if (rootStr === 'ברא') {
    customSynthesis = 'The House [Bet] of the Beginning [Resh] by the Strength [Aleph] of the Creator (To Create)';
  } else if (rootStr === 'דבר') {
    customSynthesis = 'Entering the Door [Dalet] to the House [Bet] of the Chief/Head [Resh] (Word/Speak)';
  } else if (rootStr === 'שמר') {
    customSynthesis = 'Pressing/Consuming [Shin] the Chaos [Mem] of the Head/Beginning [Resh] (To Guard/Keep)';
  } else if (rootStr === 'ארץ') {
    customSynthesis = 'The Strength [Aleph] of the Head [Resh] seeking a Journey/Hook [Tsade] (Land/Earth)';
  } else if (rootStr === 'עץ') {
    customSynthesis = 'Seeing/Knowing [Ayin] the Journey/Hook [Tsade] (Tree/Wood)';
  } else if (rootStr === 'שמע') {
    customSynthesis = 'Pressing [Shin] the Flow [Mem] into the Eye/See [Ayin] (To Hear/Understand)';
  } else if (rootStr === 'אהב') {
    customSynthesis = 'Beholding [Hey] the Leader [Aleph] of the House [Bet] (To Love)';
  } else if (rootStr === 'חי') {
    customSynthesis = 'Separating Wall [Chet] of the Hand/Work [Yod] (Life)';
  } else if (rootStr === 'ראש') {
    customSynthesis = 'The Chief [Resh] of the Strength [Aleph] pressing/consuming [Shin] (Head/First)';
  } else if (rootStr === 'עבד') {
    customSynthesis = 'Eye [Ayin] watching the House [Bet] of the Door [Dalet] (To Serve)';
  } else if (rootStr === 'שלם') {
    customSynthesis = 'Pressing [Shin] the Staff [Lamed] of Chaos/Water [Mem] into Order (Peace/Wholeness)';
  } else {
    const parts = consonants.map(char => {
      const gloss = synthesisGlosses[char] || char;
      const name = letterNames[char] || char;
      return `${gloss} [${name}]`;
    });
    customSynthesis = parts.join(' → ');
  }

  return `${leftSide} = "${customSynthesis}"`;
}

interface PaleoDecoderProps {
  hebrew: string;
  isSidebar?: boolean;
}

export default function PaleoDecoder({ hebrew, isSidebar = false }: PaleoDecoderProps) {
  const consonants = cleanConsonants(hebrew || '').split('');
  
  if (consonants.length === 0) return null;

  return (
    <div className={`flex flex-col gap-6 ${isSidebar ? 'p-0.5 mt-2 border-t border-zinc-850/50 pt-4' : 'flex-[5] bg-neutral-900/40 border border-neutral-800 rounded-xl p-6 flex flex-col justify-between overflow-y-auto h-full'}`}>
      {!isSidebar && (
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
          <h3 className="text-xs uppercase tracking-widest text-neutral-400 font-semibold">
            Paleo-Hebrew Pictographic Breakdown
          </h3>
          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono uppercase tracking-wider">
            RTL Track
          </span>
        </div>
      )}

      {isSidebar && (
        <div className="flex justify-between items-center border-b border-zinc-850 pb-1.5 animate-fadeIn">
          <h3 className="text-[9px] font-bold tracking-[0.15em] text-neutral-500 uppercase">
            Paleo-Hebrew Decoder
          </h3>
          <span className="px-1 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[7px] font-bold rounded uppercase tracking-wider">
            RTL Track
          </span>
        </div>
      )}
      
      {/* Letter cards container */}
      <div className={`flex flex-row-reverse items-stretch justify-start gap-4 py-2 overflow-x-auto w-full custom-scrollbar animate-fadeIn ${isSidebar ? 'flex-wrap' : ''}`}>
        {consonants.map((char, idx) => {
          const info = paleoLexicon[char];
          if (!info) return null;
          return (
            <div 
              key={idx} 
              className={isSidebar 
                ? 'flex-1 flex flex-col items-center justify-between text-center group transition-all duration-200 ease-in-out shadow-md border rounded-xl min-w-[68px] max-w-[82px] p-2 gap-1 bg-[#050505] border-zinc-900/60 min-h-fit hover:border-amber-400' 
                : 'flex-1 min-w-[150px] bg-black/40 border border-neutral-800 hover:border-amber-500/60 hover:scale-[1.02] rounded-xl p-5 flex flex-col items-center text-center justify-start transition-all duration-200 ease-in-out group'
              }
            >
              {/* Paleo-Hebrew Glyph */}
              <span 
                className={isSidebar 
                  ? 'font-paleo group-hover:text-amber-250 transition-colors duration-300 flex items-center justify-center select-none text-xl h-6 text-amber-300' 
                  : 'text-5xl text-amber-400 font-normal mb-3 block h-14 flex items-center justify-center filter drop-shadow-[0_2px_8px_rgba(251,191,36,0.2)] font-paleo group-hover:text-amber-250 transition-colors duration-300 select-none'
                }
                style={{ fontFamily: 'PaleoHebrew' }}
                data-testid="paleo-glyph"
              >
                {char}
              </span>
              {/* Modern Hebrew Character */}
              <span className={isSidebar ? 'font-serif text-neutral-500 group-hover:text-neutral-300 transition-colors duration-300 text-xs' : 'text-xs font-mono text-neutral-500 mb-4 block group-hover:text-neutral-300 transition-colors duration-300'}>
                {char}
              </span>
              {/* Pictograph Title */}
              <span 
                className={isSidebar 
                  ? 'uppercase tracking-wider font-bold text-amber-500 text-[7px]' 
                  : 'text-[11px] font-bold tracking-wider text-orange-400 uppercase mb-2 block h-8 flex items-center justify-center leading-tight'
                }
              >
                {info.pictograph}
              </span>
              {/* Meanings */}
              {isSidebar ? (
                <span className="text-neutral-450 text-[7px] leading-snug">
                  {info.meaning}
                </span>
              ) : (
                <p className="text-sm font-medium text-neutral-300 leading-relaxed mt-auto pt-2 border-t border-neutral-900 w-full">
                  {info.meaning}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Word-Level Synthesis Section */}
      {consonants.length > 0 && (
        isSidebar ? (
          <div className="bg-[#070707] border border-zinc-850/80 rounded-xl flex flex-col gap-1 shadow-inner animate-fadeIn p-2.5">
            <span className="text-neutral-500 font-bold uppercase tracking-wider text-[7px]">
              Word-Level Ideographic Synthesis
            </span>
            <p className="font-mono text-amber-200/90 leading-relaxed font-semibold text-[9px]">
              {generateSynthesis(consonants)}
            </p>
          </div>
        ) : (
          <div className="mt-8 bg-black/60 border border-neutral-800/80 rounded-xl p-5">
            <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider mb-2 block">
              Word-Level Ideographic Synthesis
            </span>
            <p className="text-sm font-mono text-amber-300/90 leading-relaxed">
              {generateSynthesis(consonants)}
            </p>
          </div>
        )
      )}
    </div>
  );
}
