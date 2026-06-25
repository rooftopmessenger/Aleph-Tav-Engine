'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BookOpen, List, Hash, ChevronDown } from 'lucide-react';

// Static Old Testament Books Metadata
export const BOOKS = [
  { osis: 'Gen', name: 'Genesis', chapters: 50 },
  { osis: 'Exod', name: 'Exodus', chapters: 40 },
  { osis: 'Lev', name: 'Leviticus', chapters: 27 },
  { osis: 'Num', name: 'Numbers', chapters: 36 },
  { osis: 'Deut', name: 'Deuteronomy', chapters: 34 },
  { osis: 'Josh', name: 'Joshua', chapters: 24 },
  { osis: 'Judg', name: 'Judges', chapters: 21 },
  { osis: 'Ruth', name: 'Ruth', chapters: 4 },
  { osis: '1Sam', name: '1 Samuel', chapters: 31 },
  { osis: '2Sam', name: '2 Samuel', chapters: 24 },
  { osis: '1Kgs', name: '1 Kings', chapters: 22 },
  { osis: '2Kgs', name: '2 Kings', chapters: 25 },
  { osis: '1Chr', name: '1 Chronicles', chapters: 29 },
  { osis: '2Chr', name: '2 Chronicles', chapters: 36 },
  { osis: 'Ezra', name: 'Ezra', chapters: 10 },
  { osis: 'Neh', name: 'Nehemiah', chapters: 13 },
  { osis: 'Esth', name: 'Esther', chapters: 10 },
  { osis: 'Job', name: 'Job', chapters: 42 },
  { osis: 'Ps', name: 'Psalms', chapters: 150 },
  { osis: 'Prov', name: 'Proverbs', chapters: 31 },
  { osis: 'Eccl', name: 'Ecclesiastes', chapters: 12 },
  { osis: 'Song', name: 'Song of Solomon', chapters: 8 },
  { osis: 'Isa', name: 'Isaiah', chapters: 66 },
  { osis: 'Jer', name: 'Jeremiah', chapters: 52 },
  { osis: 'Lam', name: 'Lamentations', chapters: 5 },
  { osis: 'Ezek', name: 'Ezekiel', chapters: 48 },
  { osis: 'Dan', name: 'Daniel', chapters: 12 },
  { osis: 'Hos', name: 'Hosea', chapters: 14 },
  { osis: 'Joel', name: 'Joel', chapters: 3 },
  { osis: 'Amos', name: 'Amos', chapters: 9 },
  { osis: 'Obad', name: 'Obadiah', chapters: 1 },
  { osis: 'Jonah', name: 'Jonah', chapters: 4 },
  { osis: 'Mic', name: 'Micah', chapters: 7 },
  { osis: 'Nah', name: 'Nahum', chapters: 3 },
  { osis: 'Hab', name: 'Habakkuk', chapters: 3 },
  { osis: 'Zeph', name: 'Zechariah', chapters: 3 },
  { osis: 'Hag', name: 'Haggai', chapters: 2 },
  { osis: 'Zech', name: 'Zechariah', chapters: 14 },
  { osis: 'Mal', name: 'Malachi', chapters: 4 },
];

interface ChapterNavigatorProps {
  currentBook: string;      // e.g. "Gen"
  currentChapter: number;   // e.g. 1
  currentVerse: number;     // e.g. 1
  verseCount: number;       // e.g. 31
}

export default function ChapterNavigator({
  currentBook,
  currentChapter,
  currentVerse,
  verseCount,
}: ChapterNavigatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [openDropdown, setOpenDropdown] = useState<'book' | 'chapter' | 'verse' | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find currently active book object
  const activeBook = BOOKS.find((b) => b.osis.toLowerCase() === currentBook.toLowerCase()) || BOOKS[0];

  // Cohesive navigation helper
  const navigateTo = (bookOsis: string, chapterNum: number, verseNum: number) => {
    const targetOsis = `${bookOsis}.${chapterNum}.${verseNum}`;
    if (pathname?.startsWith('/notes')) {
      router.push(`/notes?osis_id=${targetOsis}`);
    } else {
      router.push(`/read/${targetOsis}`);
    }
  };

  const handleBookSelect = (bookOsis: string) => {
    setOpenDropdown(null);
    setBookSearch('');
    navigateTo(bookOsis, 1, 1);
  };

  const handleChapterSelect = (chapterNum: number) => {
    setOpenDropdown(null);
    navigateTo(activeBook.osis, chapterNum, 1);
  };

  const handleVerseSelect = (verseNum: number) => {
    setOpenDropdown(null);
    navigateTo(activeBook.osis, currentChapter, verseNum);
  };

  // Filter books based on search query
  const filteredBooks = BOOKS.filter(
    (b) =>
      b.name.toLowerCase().includes(bookSearch.toLowerCase()) ||
      b.osis.toLowerCase().includes(bookSearch.toLowerCase())
  );

  return (
    <div 
      ref={containerRef}
      className="relative z-40 flex flex-col md:flex-row items-stretch md:items-center gap-3 p-4 bg-neutral-900/40 border border-neutral-850 rounded-2xl backdrop-blur-md shadow-lg w-full max-w-4xl mx-auto"
    >
      {/* 1. Book Selector */}
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setOpenDropdown(openDropdown === 'book' ? null : 'book')}
          className="flex items-center justify-between w-full px-4 py-3 bg-neutral-950/80 hover:bg-neutral-900/85 border border-neutral-800 focus:border-amber-500/50 rounded-xl text-sm font-medium text-neutral-300 transition-all duration-200"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <span className="text-neutral-250 font-semibold">{activeBook.name}</span>
            <span className="text-xs text-neutral-500 font-mono">({activeBook.osis})</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${openDropdown === 'book' ? 'rotate-180' : ''}`} />
        </button>

        {openDropdown === 'book' && (
          <div className="absolute left-0 right-0 mt-2 z-50 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2 animate-fadeIn max-h-72 flex flex-col">
            <input
              type="text"
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              placeholder="Search books..."
              className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500/50 rounded-lg px-3 py-2 text-xs text-neutral-200 mb-2 focus:outline-none"
              autoFocus
            />
            <div className="overflow-y-auto flex-1 custom-scrollbar pr-1">
              {filteredBooks.length > 0 ? (
                filteredBooks.map((book) => (
                  <button
                    key={book.osis}
                    type="button"
                    onClick={() => handleBookSelect(book.osis)}
                    className={`flex items-center justify-between w-full px-3 py-2 text-left rounded-lg text-xs font-medium transition-colors duration-150 mb-0.5
                      ${book.osis === activeBook.osis
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-white border border-transparent'
                      }
                    `}
                  >
                    <span>{book.name}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">{book.osis}</span>
                  </button>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-neutral-500 italic">No books match.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Chapter Selector */}
      <div className="relative w-full md:w-40">
        <button
          type="button"
          onClick={() => setOpenDropdown(openDropdown === 'chapter' ? null : 'chapter')}
          className="flex items-center justify-between w-full px-4 py-3 bg-neutral-950/80 hover:bg-neutral-900/85 border border-neutral-800 focus:border-amber-500/50 rounded-xl text-sm font-medium text-neutral-300 transition-all duration-200"
        >
          <span className="flex items-center gap-2">
            <List className="w-4 h-4 text-amber-500" />
            <span className="text-neutral-250 font-semibold">Ch. {currentChapter}</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${openDropdown === 'chapter' ? 'rotate-180' : ''}`} />
        </button>

        {openDropdown === 'chapter' && (
          <div className="absolute left-0 right-0 md:w-64 md:-left-14 mt-2 z-50 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-3 animate-fadeIn">
            <span className="block text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-2">Select Chapter</span>
            <div className="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {Array.from({ length: activeBook.chapters }, (_, i) => i + 1).map((chapterNum) => (
                <button
                  key={chapterNum}
                  type="button"
                  onClick={() => handleChapterSelect(chapterNum)}
                  className={`w-full h-8 flex items-center justify-center rounded-lg text-xs font-semibold font-mono transition-colors duration-150
                    ${chapterNum === currentChapter
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300'
                    }
                  `}
                >
                  {chapterNum}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Verse Selector */}
      <div className="relative w-full md:w-40">
        <button
          type="button"
          onClick={() => setOpenDropdown(openDropdown === 'verse' ? null : 'verse')}
          className="flex items-center justify-between w-full px-4 py-3 bg-neutral-950/80 hover:bg-neutral-900/85 border border-neutral-800 focus:border-amber-500/50 rounded-xl text-sm font-medium text-neutral-300 transition-all duration-200"
        >
          <span className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-amber-500" />
            <span className="text-neutral-250 font-semibold">Vs. {currentVerse}</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${openDropdown === 'verse' ? 'rotate-180' : ''}`} />
        </button>

        {openDropdown === 'verse' && (
          <div className="absolute left-0 right-0 md:w-64 md:-left-14 mt-2 z-50 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-3 animate-fadeIn">
            <span className="block text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-2">Select Verse</span>
            <div className="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {Array.from({ length: verseCount }, (_, i) => i + 1).map((verseNum) => (
                <button
                  key={verseNum}
                  type="button"
                  onClick={() => handleVerseSelect(verseNum)}
                  className={`w-full h-8 flex items-center justify-center rounded-lg text-xs font-semibold font-mono transition-colors duration-150
                    ${verseNum === currentVerse
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300'
                    }
                  `}
                >
                  {verseNum}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
