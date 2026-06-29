import { Suspense } from 'react';
import { fetchChapter } from '@/lib/api';
import ChapterNavigator from '@/components/ChapterNavigator';
import TheologicalNotes from '@/components/TheologicalNotes';
import ExportButtonPanel from '@/components/ExportButtonPanel';

interface PageProps {
  searchParams: Promise<{ osis_id?: string }>;
}

export default async function NotesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const osisId = params.osis_id || 'Gen.1.1';

  // Suspense key based on book + chapter.
  // Changing target verses within the same chapter updates the notes workspace instantly.
  const parts = osisId.split('.');
  const book = parts[0] || 'Gen';
  const chapter = parts[1] || '1';
  const suspenseKey = `${book}.${chapter}`;

  return (
    <div className="flex-1 flex flex-col gap-6 w-full h-full min-h-[calc(100vh-160px)]">
      <Suspense key={suspenseKey} fallback={<NotesSkeleton />}>
        <NotesContainer osisId={osisId} />
      </Suspense>
    </div>
  );
}

async function NotesContainer({ osisId }: { osisId: string }) {
  const parts = osisId.split('.');
  const book = parts[0] || 'Gen';
  const chapter = parseInt(parts[1], 10) || 1;
  const verseNum = parseInt(parts[2], 10) || 1;

  try {
    const verses = await fetchChapter(book, chapter);
    const verse = verses.find((v) => v.verse === verseNum) || verses[0];

    return (
      <div className="flex-grow flex flex-col gap-6 w-full">
        {/* Dropdown Navigator */}
        <ChapterNavigator 
          currentBook={book}
          currentChapter={chapter}
          currentVerse={verseNum}
          verseCount={verses.length}
        />
        
        {/* Workspace Display */}
        <div className="flex-grow flex flex-col h-full bg-neutral-900/20 border border-neutral-900 rounded-2xl p-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-amber-200">Study Notes Workspace</h2>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-sm font-semibold text-neutral-400">Current Context:</span>
                <span className="text-sm font-bold text-amber-400 font-mono">{verse.osis_id}</span>
                <span className="text-neutral-600 text-sm">|</span>
                <span className="text-neutral-300 text-sm italic truncate max-w-xl">"{verse.english_text}"</span>
              </div>
            </div>
            <ExportButtonPanel />
          </div>
          <div className="flex-1 flex flex-col min-h-[500px]">
            <TheologicalNotes 
              verseId={verse.id} 
              verseOsisId={verse.osis_id} 
              canvasHeight="h-[calc(100vh-340px)] min-h-[450px]" 
            />
          </div>
        </div>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <ChapterNavigator 
          currentBook={book}
          currentChapter={chapter}
          currentVerse={verseNum}
          verseCount={50} // Fallback count
        />
        <div className="p-12 bg-red-950/10 border border-red-900/40 rounded-2xl text-center flex flex-col items-center gap-4">
          <h3 className="text-red-400 font-bold text-lg">Failed to Retrieve Verse Context</h3>
          <p className="text-neutral-400 text-sm max-w-lg leading-relaxed">
            {error.message || 'An error occurred while fetching the chapter data. Make sure the backend server (FastAPI) is running at http://localhost:8000.'}
          </p>
        </div>
      </div>
    );
  }
}

function NotesSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-6 w-full">
      {/* Navigator Skeleton */}
      <div className="h-14 bg-neutral-900/40 border border-neutral-850 rounded-2xl animate-pulse w-full max-w-4xl mx-auto" />
      {/* Workspace Canvas Skeleton */}
      <div className="flex-grow bg-neutral-900/40 border border-neutral-850 rounded-2xl p-6 h-[600px] animate-pulse" />
    </div>
  );
}
