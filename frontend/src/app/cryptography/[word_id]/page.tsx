'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchWordDetail, WordExtended } from '@/lib/api';

export default function WordCryptographyPage() {
  const params = useParams();
  const router = useRouter();
  const wordId = parseInt(params.word_id as string, 10);

  const [word, setWord] = useState<WordExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wordId || isNaN(wordId)) {
      setError('Invalid word ID.');
      setLoading(false);
      return;
    }

    fetchWordDetail(wordId)
      .then((data) => {
        setWord(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Failed to load word cryptographic details.');
        setLoading(false);
      });
  }, [wordId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px]">
        <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl px-5 py-3 text-neutral-400">
          <span className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-bold text-sm tracking-wider uppercase">Loading Cryptographic Footprint...</span>
        </div>
      </div>
    );
  }

  if (error || !word) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="p-8 bg-red-950/10 border border-red-900/40 rounded-2xl text-center max-w-md">
          <h3 className="text-red-400 font-bold text-lg mb-2">Error Loading Data</h3>
          <p className="text-neutral-400 text-sm leading-relaxed">{error || 'Word details could not be found.'}</p>
        </div>
        <button 
          onClick={() => router.back()}
          className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-neutral-350 hover:text-neutral-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-8 w-full py-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400">
            Word Cryptographic Analysis
          </h1>
          <p className="text-neutral-500 text-sm font-medium">
            Full-screen mathematical dashboard for word index #{word.id}
          </p>
        </div>
        <button
          onClick={() => {
            if (word.verse_osis) {
              router.push(`/read/${word.verse_osis}`);
            } else {
              router.back();
            }
          }}
          className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-750 text-amber-350 hover:text-amber-250 font-bold rounded-xl transition-all shadow-[0_4px_15px_rgba(0,0,0,0.4)] text-xs uppercase tracking-wider cursor-pointer"
        >
          &larr; Back to Scripture
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Hebrew Word Display & Lexicon Summary */}
        <div className="md:col-span-1 flex flex-col gap-6">
          {/* Hebrew Word Display Card */}
          <div className="p-8 bg-[#0a0a0a] border border-amber-500/30 rounded-2xl flex flex-col items-center justify-center text-center gap-4 shadow-[0_4px_30px_rgba(245,158,11,0.03)] min-h-[220px]">
            <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase">
              Selected Segment
            </span>
            <span className="text-6xl font-serif text-amber-300 drop-shadow-[0_2px_10px_rgba(245,158,11,0.1)]">
              {word.hebrew_segment}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-mono text-amber-500 font-bold bg-[#1a1200] border border-amber-500/20 px-2 py-0.5 rounded">
                {word.strongs_number || 'No Strongs'}
              </span>
              <span className="text-xs text-neutral-450 italic font-mono mt-1">
                "{word.english_gloss || '—'}"
              </span>
            </div>
          </div>

          {/* Lexicon Summary Card */}
          <div className="p-6 bg-[#0a0a0a] border border-zinc-850 rounded-2xl flex flex-col gap-4 shadow-xl flex-1">
            <h3 className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase border-b border-zinc-850 pb-2.5">
              Lexicon Definition
            </h3>
            <div className="flex flex-col gap-2.5 text-xs text-neutral-400">
              <div>
                <span className="font-semibold text-neutral-500 block mb-0.5">Transliteration:</span>
                <span className="italic font-mono text-neutral-300 text-sm">{word.transliteration || '—'}</span>
              </div>
              {word.lexicon?.part_of_speech && (
                <div>
                  <span className="font-semibold text-neutral-500 block mb-0.5">Part of Speech:</span>
                  <span className="text-amber-400/80 font-mono font-medium">{word.lexicon.part_of_speech}</span>
                </div>
              )}
              {word.lexicon?.lemma && (
                <div>
                  <span className="font-semibold text-neutral-500 block mb-0.5">Root Lemma:</span>
                  <span className="font-serif text-sm text-amber-200">{word.lexicon.lemma}</span>
                </div>
              )}
              {word.lexicon?.definition && (
                <div className="border-t border-zinc-850 pt-2.5 mt-1 flex flex-col gap-1.5">
                  <span className="font-semibold text-neutral-500 block">Extended definition:</span>
                  <div 
                    className="leading-relaxed max-h-[160px] overflow-y-auto pr-1 custom-scrollbar text-[11px] text-neutral-450"
                    dangerouslySetInnerHTML={{ __html: word.lexicon.definition }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center/Right Columns: Cryptographic Footprint Dashboard */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Gematria Metrics Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0a0a0a] border border-zinc-850 rounded-2xl p-6 flex flex-col gap-2 shadow-xl">
              <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Absolute Gematria</span>
              <span className="text-3xl font-black text-amber-400 font-mono">{word.gematria_absolute ?? '—'}</span>
              <p className="text-[9px] text-neutral-500 leading-normal">
                Sum of values of the Hebrew letters.
              </p>
            </div>
            <div className="bg-[#0a0a0a] border border-zinc-850 rounded-2xl p-6 flex flex-col gap-2 shadow-xl">
              <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Ordinal Gematria</span>
              <span className="text-3xl font-black text-amber-400 font-mono">{word.gematria_ordinal ?? '—'}</span>
              <p className="text-[9px] text-neutral-500 leading-normal">
                Sum of alphabetical position index values.
              </p>
            </div>
            <div className="bg-[#0a0a0a] border border-zinc-850 rounded-2xl p-6 flex flex-col gap-2 shadow-xl">
              <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Reduced Gematria</span>
              <span className="text-3xl font-black text-amber-400 font-mono">{word.gematria_reduced ?? '—'}</span>
              <p className="text-[9px] text-neutral-500 leading-normal">
                Digital root of the absolute sum (mod 9).
              </p>
            </div>
          </div>

          {/* Cipher Transformations Panel */}
          <div className="p-6 bg-[#0a0a0a] border border-zinc-850 rounded-2xl shadow-xl flex flex-col gap-4">
            <h3 className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase border-b border-zinc-850 pb-2.5">
              Cipher Transformations
            </h3>
            <div className="flex flex-col gap-3.5">
              <div className="flex justify-between items-center bg-[#070707] p-4 rounded-xl border border-zinc-850">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide">Atbash Cipher</span>
                  <span className="text-[9px] text-neutral-600">Reverses the Hebrew alphabet (aleph &rarr; tav).</span>
                </div>
                <span className="text-xl font-serif font-black text-teal-400">{word.atbash ?? '—'}</span>
              </div>

              <div className="flex justify-between items-center bg-[#070707] p-4 rounded-xl border border-zinc-850">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide">Albam Cipher</span>
                  <span className="text-[9px] text-neutral-600">Shifts alphabet by 11 letters (half rotation).</span>
                </div>
                <span className="text-xl font-serif font-black text-teal-400">{word.albam ?? '—'}</span>
              </div>

              <div className="flex justify-between items-center bg-[#070707] p-4 rounded-xl border border-zinc-850">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide">Atbah Cipher</span>
                  <span className="text-[9px] text-neutral-600">Alphabet replacement where sum equals 9, 19, etc.</span>
                </div>
                <span className="text-xl font-serif font-black text-teal-400">{word.atbah ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Verse Context Panel */}
          {word.verse_osis && (
            <div className="p-6 bg-[#0a0a0a] border border-zinc-850 rounded-2xl shadow-xl flex flex-col gap-4">
              <h3 className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 uppercase border-b border-zinc-850 pb-2.5">
                Biblical Context ({word.verse_osis})
              </h3>
              <div className="flex flex-col gap-3">
                <div className="bg-[#070707] border border-zinc-850 p-4 rounded-xl flex flex-col gap-2">
                  <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Original Hebrew Text</span>
                  <p className="text-2xl font-serif text-amber-100/90 text-right leading-relaxed" dir="rtl">
                    {word.verse_text}
                  </p>
                </div>
                {word.verse_english && (
                  <div className="bg-[#070707] border border-zinc-850 p-4 rounded-xl flex flex-col gap-1">
                    <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">English Translation (KJV)</span>
                    <p className="text-sm text-neutral-400 italic leading-relaxed">
                      "{word.verse_english}"
                    </p>
                  </div>
                )}
                <Link
                  href={`/read/${word.verse_osis}`}
                  className="mt-2 px-5 py-3 bg-amber-500 text-zinc-950 hover:bg-amber-400 font-black rounded-xl text-center text-xs uppercase tracking-widest transition-all shadow-[0_4px_20px_rgba(245,158,11,0.15)] cursor-pointer"
                >
                  Return to Interlinear Reading
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
