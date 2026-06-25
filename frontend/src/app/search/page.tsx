import AIPatternSearch from '@/components/AIPatternSearch';

interface PageProps {
  searchParams: Promise<{ osis_id?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const osisId = params.osis_id || 'Gen.1.1';

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-[calc(100vh-160px)]">
      <AIPatternSearch currentOsisId={osisId} />
    </div>
  );
}
