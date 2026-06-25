import { Suspense } from 'react';
import { fetchChapter } from '@/lib/api';
import InterlinearReader from '@/components/InterlinearReader';
import ChapterNavigator from '@/components/ChapterNavigator';

interface PageProps {
  params: Promise<{ osis_id: string }>;
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const osisId = decodeURIComponent(resolvedParams.osis_id || 'Gen.1.1');

  // Parse the book and chapter to use as a suspense key.
  // This allows switching verses within the same chapter instantly 
  // without triggering a full page flash of the skeleton loading state.
  const parts = osisId.split('.');
  const book = parts[0] || 'Gen';
  const chapter = parts[1] || '1';
  const suspenseKey = `${book}.${chapter}`;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-8 w-full">
      {/* Suspense Wrapper for In-flight Data Fetching */}
      <Suspense key={suspenseKey} fallback={<InterlinearSkeleton />}>
        <ChapterContainer osisId={osisId} />
      </Suspense>
    </div>
  );
}

/**
 * Async Container fetching Scripture data on the server.
 */
async function ChapterContainer({ osisId }: { osisId: string }) {
  const parts = osisId.split('.');
  const book = parts[0] || 'Gen';
  const chapter = parseInt(parts[1], 10) || 1;
  const verseNum = parseInt(parts[2], 10) || 1;

  try {
    const verses = await fetchChapter(book, chapter);
    return (
      <div className="flex flex-col gap-8 w-full">
        <ChapterNavigator 
          currentBook={book}
          currentChapter={chapter}
          currentVerse={verseNum}
          verseCount={verses.length}
        />
        <InterlinearReader verses={verses} targetOsisId={osisId} />
      </div>
    );
  } catch (error: any) {
    return (
      <div className="flex flex-col gap-8 w-full">
        <ChapterNavigator 
          currentBook={book}
          currentChapter={chapter}
          currentVerse={verseNum}
          verseCount={50} // Fallback count
        />
        <div className="p-12 bg-red-950/10 border border-red-900/40 rounded-2xl text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-900/60 flex items-center justify-center text-red-500 mb-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-red-400 font-bold text-lg">Failed to Retrieve Scripture</h3>
          <p className="text-neutral-400 text-sm max-w-lg leading-relaxed">
            {error.message || 'An error occurred while fetching the chapter. Make sure the backend server (FastAPI) is running at http://localhost:8000.'}
          </p>
        </div>
      </div>
    );
  }
}

/**
 * Visual Skeleton Loader displayed while data is streaming.
 */
function InterlinearSkeleton() {
  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Navigator Skeleton */}
      <div className="h-14 bg-neutral-900/40 border border-neutral-850 rounded-2xl animate-pulse w-full max-w-4xl mx-auto" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 min-h-[500px] animate-pulse">
        {/* Main Breakdown Skeleton */}
        <div className="lg:col-span-3 flex flex-col gap-8">
          
          {/* Continuous Text Skeleton */}
          <div className="p-6 bg-neutral-900/40 border border-neutral-850 rounded-2xl flex flex-col gap-4">
            <div className="h-4 w-28 bg-neutral-800 rounded" />
            <div className="h-10 w-3/4 bg-neutral-800 rounded self-end mt-2" />
            <div className="border-t border-neutral-800 pt-4 mt-2">
              <div className="h-3 w-32 bg-neutral-800 rounded mb-3" />
              <div className="h-5 w-full bg-neutral-800 rounded" />
            </div>
          </div>

          {/* Word Grid Skeleton */}
          <div className="flex flex-col gap-4">
            <div className="h-4 w-36 bg-neutral-800 rounded" />
            <div className="flex flex-row-reverse flex-wrap justify-start gap-x-6 gap-y-10 p-8 bg-neutral-950/40 border border-neutral-900 rounded-2xl">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex flex-col items-center p-4 rounded-xl border border-neutral-850 bg-neutral-900/20 w-36 h-48 gap-3">
                  <div className="h-7 w-20 bg-neutral-800 rounded" />
                  <div className="h-3 w-16 bg-neutral-800 rounded" />
                  <div className="flex flex-col gap-1.5 w-full mt-2">
                    <div className="h-4 w-full bg-neutral-800 rounded" />
                    <div className="h-4 w-full bg-neutral-800 rounded" />
                  </div>
                  <div className="h-4 w-12 bg-neutral-800 rounded mt-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lexicon Panel Skeleton */}
        <div className="lg:col-span-1 h-[500px] bg-neutral-900/40 border border-neutral-850 rounded-2xl p-6" />
      </div>
    </div>
  );
}
