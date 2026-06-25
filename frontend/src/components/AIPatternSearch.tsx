'use client';

import React, { useState, useEffect, useRef } from 'react';
import { saveVerseNote } from '@/lib/api';

interface AIPatternSearchProps {
  currentOsisId: string;
}

const BOOK_NAMES: Record<string, string> = {
  Gen: "Genesis",
  Exod: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Josh: "Joshua",
  Judg: "Judges",
  Ruth: "Ruth",
  "1Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles",
  "2Chr": "2 Chronicles",
  Ezra: "Ezra",
  Neh: "Nehemiah",
  Esth: "Esther",
  Job: "Job",
  Ps: "Psalms",
  Prov: "Proverbs",
  Eccl: "Ecclesiastes",
  Song: "Song of Solomon",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezek: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obad: "Obadiah",
  Jonah: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zeph: "Zephaniah",
  Hag: "Haggai",
  Zech: "Zechariah",
  Mal: "Malachi"
};

const SUGGESTIONS = [
  { label: "Beginning (H7225)", query: "Find lexical patterns where beginning H7225 is used and analyze its semantic usage." },
  { label: "Create (H1254)", query: "Analyze the grammatical and theological pattern of creation using H1254." },
  { label: "Covenant Themes", query: "Look for covenants or pacts described in these scriptures and their Hebrew equivalents." },
  { label: "Word Repetition", query: "Analyze the repetition of key verbs or nouns in the context and point out structural highlights." }
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AIPatternSearch({ currentOsisId }: AIPatternSearchProps) {
  const [prompt, setPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useFilter, setUseFilter] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [searchMode, setSearchMode] = useState<'Standard Search' | 'Divine Speech & Lexical Analysis' | 'Prophetic Voice'>('Standard Search');

  const [isSavingNote, setIsSavingNote] = useState(false);
  const [saveNoteStatus, setSaveNoteStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [compiledResearch, setCompiledResearch] = useState<Array<{ prompt: string; response: string }>>([]);
  const [theoryTitle, setTheoryTitle] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [pinStatus, setPinStatus] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(aiResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePinToReport = () => {
    if (!aiResponse) return;
    
    const alreadyPinned = compiledResearch.some(r => r.prompt === prompt);
    if (alreadyPinned) {
      setPinStatus('Already pinned!');
      setTimeout(() => setPinStatus(null), 2500);
      return;
    }

    setCompiledResearch(prev => [...prev, { prompt, response: aiResponse }]);
    setPinStatus('Pinned to Report!');
    setTimeout(() => setPinStatus(null), 2500);
  };

  const handleGenerateReport = async () => {
    if (compiledResearch.length === 0 || !theoryTitle.trim()) return;

    setIsCompiling(true);

    try {
      const itemsContext = compiledResearch.map((item, idx) => {
        return `### Research Item #${idx + 1}\n**Query:** ${item.prompt}\n\n**Analysis:**\n${item.response}\n`;
      }).join('\n');

      const synthesisPrompt = `You are compiling a theological research report titled "${theoryTitle}".\n\n` +
        `Here is the compiled research raw data:\n\n${itemsContext}\n` +
        `Please synthesize a final conclusion summarizing these findings. You MUST strictly organize your synthesis using the 4-level Pardes framework:\n` +
        `- **Peshat (פְּשָׁט):** The literal, historical, and plain contextual meaning of the text and source words.\n` +
        `- **Remez (רֶמֶז):** The allegorical, symbolic, or linguistic hints and cross-references.\n` +
        `- **Derash (דְּרַשׁ):** The homiletic, moral, and comparative study of the patterns.\n` +
        `- **Sod (סוֹד):** The esoteric, structural, or mystical dimensions of these linguistic configurations.`;

      const response = await fetch(`${API_BASE_URL}/api/ai/pattern-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: synthesisPrompt,
          search_mode: 'Standard Search'
        }),
      });

      if (!response.ok) {
        throw new Error(`Synthesis failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is not readable');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let synthesizedConclusion = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        synthesizedConclusion += decoder.decode(value, { stream: true });
      }

      const currentDate = new Date().toISOString().split('T')[0];

      const reportText = `---
title: "${theoryTitle}"
date: ${currentDate}
tags: [research, theory, scripture-study]
framework: pardes
source: Aleph-Tav Engine
---

# ${theoryTitle}

## Synthesized Conclusion (Pardes Framework)

${synthesizedConclusion}

---

## Aggregated Raw Data

Below is the compilation of the pinned research items that formed the basis of this synthesis.

${itemsContext}
`;

      const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${theoryTitle.trim().replace(/[^a-z0-9]/gi, '_')}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during report generation.');
    } finally {
      setIsCompiling(false);
    }
  };

  const resolveVerseId = async () => {
    const res = await fetch(`${API_BASE_URL}/api/verses/${currentOsisId}`);
    if (!res.ok) throw new Error("Could not resolve verse ID");
    const data = await res.json();
    return data.id;
  };

  const handleSaveToNote = async () => {
    try {
      setIsSavingNote(true);
      setSaveNoteStatus(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("You must be logged in to save notes.");
      }
      
      const resolvedId = await resolveVerseId();
      await saveVerseNote(resolvedId, aiResponse, token, false, 150, 150); // private by default, drop onto spatial canvas
      setSaveNoteStatus({ text: "Saved to Notes!", type: "success" });
      
      // Dispatch custom event to notify TheologicalNotes component to reload
      window.dispatchEvent(new Event('note-saved'));
      setTimeout(() => setSaveNoteStatus(null), 2500);
    } catch (err: any) {
      setSaveNoteStatus({ text: err.message || "Failed to save note.", type: "error" });
      setTimeout(() => setSaveNoteStatus(null), 3000);
    } finally {
      setIsSavingNote(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Parse OSIS ID for filter labeling
  const parts = currentOsisId.split('.');
  const bookCode = parts[0] || 'Gen';
  const chapterNum = parts[1] ? parseInt(parts[1], 10) : 1;
  const bookFullName = BOOK_NAMES[bookCode] || bookCode;

  // Auto-scroll as tokens flow in
  useEffect(() => {
    if (isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiResponse, isLoading]);

  const handleSearch = async (queryText: string) => {
    if (!queryText.trim()) return;

    setIsLoading(true);
    setAiResponse('');
    setError(null);

    const body: any = {
      prompt: queryText.trim(),
      search_mode: searchMode
    };

    if (useFilter) {
      body.filters = [
        {
          book: bookCode,
          chapter: chapterNum
        }
      ];
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/pattern-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Server returned error: ${response.statusText} (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Streaming response body is unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setAiResponse((prev) => prev + chunk);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during search.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(prompt);
  };

  const handleSuggestionClick = (query: string) => {
    setPrompt(query);
    handleSearch(query);
  };

  // Custom inline markdown styling renderer
  const renderTextWithInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-amber-200">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} className="bg-neutral-950 border border-neutral-800 px-1 py-0.5 rounded text-amber-500 font-mono text-xs">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const parseMarkdown = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      // Heading 3
      if (line.startsWith('### ')) {
        return <h5 key={idx} className="text-sm font-bold text-amber-200 mt-3 mb-1 uppercase tracking-wider">{line.slice(4)}</h5>;
      }
      // Heading 2
      if (line.startsWith('## ')) {
        return <h4 key={idx} className="text-base font-bold text-amber-300 mt-4 mb-2 border-b border-neutral-850 pb-1">{line.slice(3)}</h4>;
      }
      // Heading 1
      if (line.startsWith('# ')) {
        return <h3 key={idx} className="text-lg font-extrabold text-amber-400 mt-5 mb-3">{line.slice(2)}</h3>;
      }
      // Bullet list item
      if (line.startsWith('* ') || line.startsWith('- ')) {
        return (
          <li key={idx} className="list-disc ml-5 text-neutral-300 text-sm my-1 leading-relaxed">
            {renderTextWithInlineStyles(line.slice(2))}
          </li>
        );
      }
      // Numbered list item
      const numMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        return (
          <li key={idx} className="list-decimal ml-5 text-neutral-300 text-sm my-1 leading-relaxed">
            {renderTextWithInlineStyles(numMatch[2])}
          </li>
        );
      }
      // Empty line
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }
      // Paragraph
      return (
        <p key={idx} className="text-neutral-300 text-sm leading-relaxed my-1.5">
          {renderTextWithInlineStyles(line)}
        </p>
      );
    });
  };

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl backdrop-blur-md shadow-2xl p-6 flex flex-col gap-6">
      
      {/* Title */}
      <div className="flex flex-col gap-1 border-b border-neutral-800 pb-4">
        <h2 className="text-lg font-bold text-amber-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI Linguistic Pattern Search
        </h2>
        <p className="text-neutral-500 text-xs font-medium">
          Powered by Ollama. Search Hebrew morphemes, Strong's mappings, and root lemmas.
        </p>
      </div>

      {/* Suggestion Chips */}
      <div className="flex flex-col gap-2">
        <span className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">Quick-Start Prompts</span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              disabled={isLoading}
              onClick={() => handleSuggestionClick(s.query)}
              className="text-xs bg-neutral-950 text-neutral-400 hover:text-amber-400 hover:border-amber-500/50 border border-neutral-800/80 px-3 py-1.5 rounded-full transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Search Mode Toggle Group */}
        <div className="flex flex-col gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider font-bold">Search Mode</span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[
              { id: 'Standard Search', label: 'Standard Search', icon: '🔍' },
              { id: 'Divine Speech & Lexical Analysis', label: 'Divine Speech & Lexical', icon: '👑' },
              { id: 'Prophetic Voice', label: 'Prophetic Voice', icon: '📣' }
            ].map((mode) => {
              const isActive = searchMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setSearchMode(mode.id as any)}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] font-bold rounded-xl border transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                    ${isActive 
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.05)]' 
                      : 'bg-neutral-950 border-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-800'
                    }
                  `}
                >
                  <span>{mode.icon}</span>
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="e.g., Explain grammatical patterns associated with H7225..."
            className="flex-1 bg-neutral-950 text-neutral-100 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm transition-all duration-300 outline-none placeholder:text-neutral-600 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={mounted ? (isLoading || !prompt.trim()) : false}
            className="bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold px-6 py-3 rounded-xl transition-all duration-300 shadow-[0_0_15px_rgba(217,119,6,0.15)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-neutral-950" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </div>

        {/* Filter Checkbox */}
        <div className="flex items-center gap-2 select-none">
          <input
            type="checkbox"
            id="useFilter"
            checked={useFilter}
            onChange={(e) => setUseFilter(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4 accent-amber-500 rounded bg-neutral-950 border border-neutral-800 focus:ring-0 outline-none transition-all duration-300 cursor-pointer disabled:opacity-60"
          />
          <label htmlFor="useFilter" className="text-neutral-400 text-xs cursor-pointer hover:text-neutral-300 transition-colors disabled:opacity-60">
            Limit search context to current chapter (<span className="text-amber-500/80 font-semibold">{bookFullName} {chapterNum}</span>)
          </label>
        </div>
      </form>

      {/* Output Stream Panel */}
      {(aiResponse || isLoading || error) && (
        <div className="relative flex flex-col gap-4 bg-neutral-950/40 border border-neutral-900 rounded-2xl p-6 min-h-[150px] shadow-inner max-h-[500px] overflow-y-auto custom-scrollbar">
          
          {/* Status Header */}
          <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider text-neutral-600 border-b border-neutral-900 pb-2">
            <span>Analysis stream</span>
            <span className={isLoading ? 'text-amber-500 animate-pulse' : 'text-teal-500'}>
              {isLoading ? 'Streaming tokens...' : 'Completed'}
            </span>
          </div>

          {/* Errors */}
          {error && (
            <div className="text-red-400 text-sm bg-red-950/10 border border-red-900/30 p-4 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Stream Text Area */}
          <div className="flex flex-col text-neutral-300 font-sans">
            {parseMarkdown(aiResponse)}
            {isLoading && !aiResponse && (
              <span className="text-xs text-neutral-500 italic animate-pulse">
                Querying database, assembling structural interlinear context and initializing model...
              </span>
            )}
          </div>

          {/* Action Toolbar */}
          {!isLoading && aiResponse && (
            <div className="flex items-center justify-between border-t border-neutral-900 pt-3 mt-4 gap-4 flex-wrap">
              <div className="text-xs flex gap-2 items-center">
                {saveNoteStatus && (
                  <span className={saveNoteStatus.type === 'success' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                    {saveNoteStatus.text}
                  </span>
                )}
                {pinStatus && (
                  <span className="text-teal-400 font-medium animate-pulse">
                    {pinStatus}
                  </span>
                )}
              </div>
              
              <div className="flex gap-2">
                {/* Copy to Clipboard */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>

                {/* Save to Note */}
                <button
                  type="button"
                  disabled={isSavingNote}
                  onClick={handleSaveToNote}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingNote ? (
                    <>
                      <span className="w-3 h-3 border border-amber-300 border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Save to Note
                    </>
                  )}
                </button>

                {/* Pin to Report */}
                <button
                  type="button"
                  onClick={handlePinToReport}
                  className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-350 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.0} d="M12 19l9-2-9-18-9 18 9 2zm0 0v-8" />
                  </svg>
                  Pin to Report
                </button>
              </div>
            </div>
          )}
          
          <div ref={bottomRef} />
        </div>
      )}

      {/* Theory Compiler Panel */}
      {compiledResearch.length > 0 && (
        <div className="border-t border-neutral-800 pt-6 mt-6 flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-neutral-850 pb-2">
            <h3 className="text-xs font-bold tracking-wider text-amber-300 uppercase flex items-center gap-1.5">
              🎓 Theory Compiler ({compiledResearch.length} {compiledResearch.length === 1 ? 'item' : 'items'} pinned)
            </h3>
            <button
              onClick={() => setCompiledResearch([])}
              className="text-[10px] font-bold text-red-400 hover:text-red-305 transition-colors uppercase tracking-wider cursor-pointer"
            >
              Clear Report
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Side: Pinned Items List */}
            <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {compiledResearch.map((item, idx) => (
                <div key={idx} className="p-3 bg-neutral-950/60 border border-neutral-850 rounded-xl flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between font-mono text-[9px] text-neutral-500">
                    <span>ITEM #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => setCompiledResearch(prev => prev.filter((_, i) => i !== idx))}
                      className="text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="font-semibold text-neutral-300 truncate">Q: {item.prompt}</p>
                  <p className="text-neutral-450 line-clamp-2 leading-relaxed">{item.response}</p>
                </div>
              ))}
            </div>

            {/* Right Side: Export controls */}
            <div className="p-4 bg-neutral-950/40 border border-neutral-850 rounded-xl flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Theory Title</label>
                <input
                  type="text"
                  value={theoryTitle}
                  onChange={(e) => setTheoryTitle(e.target.value)}
                  placeholder="e.g., The Semantic Development of YHWH in Genesis..."
                  className="w-full bg-neutral-950 text-neutral-100 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-lg px-3 py-2 text-xs outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isCompiling || !theoryTitle.trim()}
                onClick={handleGenerateReport}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-neutral-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isCompiling ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                    Synthesizing Pardes Conclusion...
                  </>
                ) : (
                  <>
                    <span>Generate & Export Final Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
