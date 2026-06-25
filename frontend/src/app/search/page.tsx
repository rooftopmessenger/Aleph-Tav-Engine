'use client';

import React, { useState } from 'react';
import AIPatternSearch from '@/components/AIPatternSearch';
import CryptographicSearch from '@/components/CryptographicSearch';

interface PageProps {
  searchParams: Promise<{ osis_id?: string }>;
}

export default function SearchPage({ searchParams }: PageProps) {
  const resolvedParams = React.use(searchParams);
  const osisId = resolvedParams.osis_id || 'Gen.1.1';
  
  const [activeTab, setActiveTab] = useState<'semantic' | 'cryptographic'>('semantic');

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-[calc(100vh-160px)] gap-6">
      {/* Tab Switcher */}
      <div className="flex bg-neutral-900/60 border border-neutral-850 p-1.5 rounded-xl w-fit self-center">
        <button
          onClick={() => setActiveTab('semantic')}
          className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'semantic'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-black'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          AI Semantic Search
        </button>
        <button
          onClick={() => setActiveTab('cryptographic')}
          className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'cryptographic'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-black'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Cryptographic Search
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 flex flex-col w-full">
        {activeTab === 'semantic' ? (
          <AIPatternSearch currentOsisId={osisId} />
        ) : (
          <CryptographicSearch />
        )}
      </div>
    </div>
  );
}
