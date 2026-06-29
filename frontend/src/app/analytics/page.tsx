'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  fetchBooks, 
  fetchBookAnalytics, 
  fetchChapter, 
  fetchVerseAnalytics, 
  fetchStructureComparison,
  fetchDeltaAnalysis,
  fetchElsAnalysis,
  fetchTopologyGraph,
  Book, 
  Verse, 
  ChapterAggregation, 
  VerseAnalytics,
  StructureComparison,
  DeltaResponse,
  ElsResponse,
  TopologyResponse
} from '@/lib/api';
import CryptographicChart, { ChartDataPoint } from '@/components/CryptographicChart';
import StructuralCorrelationChart from '@/components/StructuralCorrelationChart';
import ElsMatrix from '@/components/ElsMatrix';
import TopologyGraph from '@/components/TopologyGraph';
import { BOOKS } from '@/components/ChapterNavigator';
import { BookOpen, List, Hash, BarChart3, HelpCircle, Loader2, RefreshCw, ChevronDown, Download } from 'lucide-react';

// On-the-fly entropy calculation fallback for safety
const calculateFallbackEntropy = (text: string): number => {
  if (!text) return 0.0;
  
  // 1. Map Greek final sigma (ς) to standard sigma (σ)
  let normalized = text.replace(/\u03c2/g, '\u03c3');
  
  // 2. Normalize to Unicode NFD (Decomposed form)
  normalized = normalized.normalize('NFD');
  
  // 3. Strip all combining diacritical marks in the \u0300-\u036f range
  normalized = normalized.replace(/[\u0300-\u036f]/g, '');
  
  // 4. Unicode Extraction: Hebrew letters (\u05D0-\u05EA) and Greek letters (\u0370-\u03FF, \u1F00-\u1FFF)
  const letters: string[] = [];
  const regex = /[\u05d0-\u05ea\u0370-\u03ff\u1f00-\u1fff]/;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (regex.test(char)) {
      letters.push(char);
    }
  }
  
  // 5. Safe Fallback
  if (letters.length === 0) return 0.0;
  
  const frequencies: Record<string, number> = {};
  for (const char of letters) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  
  let entropy = 0.0;
  const totalLen = letters.length;
  for (const count of Object.values(frequencies)) {
    const p = count / totalLen;
    entropy -= p * Math.log2(p);
  }
  
  return entropy;
};

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [scope, setScope] = useState<'book' | 'chapter' | 'verse' | 'structure' | 'delta' | 'els' | 'topology'>('book');
  const [booksList, setBooksList] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [selectedVerseNum, setSelectedVerseNum] = useState<number>(1);

  // Loaded analytics data states
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [structureData, setStructureData] = useState<StructureComparison[]>([]);

  // Delta Analysis states
  const [structureVerses, setStructureVerses] = useState<string[]>([]);
  const [deltaVerseA, setDeltaVerseA] = useState<string>('1Kgs.7.15');
  const [deltaVerseB, setDeltaVerseB] = useState<string>('2Chr.3.15');
  const [deltaData, setDeltaData] = useState<DeltaResponse | null>(null);
  
  // ELS Decoder states
  const [elsOsisId, setElsOsisId] = useState<string>('1Kgs.7.16');
  const [elsData, setElsData] = useState<ElsResponse | null>(null);

  // Semantic Topology states
  const [topologyQuery, setTopologyQuery] = useState<string>('Resurrection');
  const [topologyData, setTopologyData] = useState<TopologyResponse | null>(null);
  const [topologyK, setTopologyK] = useState<number>(15);

  const [currentChapterVerses, setCurrentChapterVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleExportAnomalies = (groupBy: 'book' | 'type', format: 'csv' | 'json' | 'markdown') => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const url = `${apiBase}/api/export/anomalies?format=${format}&group_by=${groupBy}`;
    window.open(url, '_blank');
    setShowExportMenu(false);
  };

  // 1. Fetch initial books list and structural verses on mount
  useEffect(() => {
    let isMounted = true;
    fetchBooks()
      .then(books => {
        if (isMounted) {
          setBooksList(books);
          // Default selection: Genesis (usually Book ID 1, OSIS "Gen")
          const genBook = books.find(b => b.osis_code === 'Gen') || books[0] || null;
          setSelectedBook(genBook);
        }
      })
      .catch(err => {
        console.error('Failed to load books list:', err);
        if (isMounted) {
          setError('Failed to contact backend API. Make sure the FastAPI service is running.');
          setLoading(false);
        }
      });

    fetchStructureComparison()
      .then(data => {
        if (isMounted) {
          const uniqueVerses = Array.from(new Set(data.map(d => d.osis_id)));
          setStructureVerses(uniqueVerses);
        }
      })
      .catch(err => {
        console.error('Failed to load structural verses list:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute number of chapters in the currently selected book using static metadata
  const chapterCount = useMemo(() => {
    if (!selectedBook) return 1;
    const staticBook = BOOKS.find(b => b.osis.toLowerCase() === selectedBook.osis_code.toLowerCase());
    return staticBook ? staticBook.chapters : 50;
  }, [selectedBook]);

  // 2. Fetch chapter verses when selectedBook or selectedChapter changes
  // This is used for populating verses dropdown and rendering chapter level analytics
  useEffect(() => {
    if (!selectedBook) return;

    let isMounted = true;
    fetchChapter(selectedBook.osis_code, selectedChapter)
      .then(verses => {
        if (isMounted) {
          setCurrentChapterVerses(verses);
        }
      })
      .catch(err => {
        console.error(`Failed to load verses for ${selectedBook.osis_code} ${selectedChapter}:`, err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBook, selectedChapter]);

  // Compute OSIS ID for selected verse
  const selectedVerseOsisId = useMemo(() => {
    if (!selectedBook) return 'Gen.1.1';
    return `${selectedBook.osis_code}.${selectedChapter}.${selectedVerseNum}`;
  }, [selectedBook, selectedChapter, selectedVerseNum]);

  // Export Delta analysis report to Markdown
  const handleExportDeltaToMarkdown = useCallback(() => {
    if (!deltaData) return;

    const targetA = deltaData.target_a;
    const targetB = deltaData.target_b;
    const deltas = deltaData.deltas;

    let markdown = `# Parallel Delta Analysis: ${targetA.osis_id} vs ${targetB.osis_id}\n\n`;
    markdown += `Generated by the Aleph-Tav Difference Engine on ${new Date().toLocaleDateString()}\n\n`;
    
    markdown += `## 1. Scriptural Contexts\n\n`;
    
    markdown += `### Target A: ${targetA.osis_id}\n`;
    if (targetA.hebrew_text) {
      markdown += `* **Hebrew Text**: \`${targetA.hebrew_text}\`\n`;
    }
    markdown += `* **English Translation**: "${targetA.english_text}"\n`;
    markdown += `* **Cumulative Gematria**: \`${targetA.gematria_sum}\`\n`;
    markdown += `* **Shannon Entropy**: \`${targetA.entropy_score.toFixed(4)}\`\n`;
    if (targetA.dimensions.length > 0) {
      markdown += `* **Physical Dimensions**:\n`;
      targetA.dimensions.forEach(d => {
        markdown += `  - ${d.object_name} (${d.measurement_type}): \`${d.value}\` cubits\n`;
      });
    }
    markdown += `\n`;

    markdown += `### Target B: ${targetB.osis_id}\n`;
    if (targetB.hebrew_text) {
      markdown += `* **Hebrew Text**: \`${targetB.hebrew_text}\`\n`;
    }
    markdown += `* **English Translation**: "${targetB.english_text}"\n`;
    markdown += `* **Cumulative Gematria**: \`${targetB.gematria_sum}\`\n`;
    markdown += `* **Shannon Entropy**: \`${targetB.entropy_score.toFixed(4)}\`\n`;
    if (targetB.dimensions.length > 0) {
      markdown += `* **Physical Dimensions**:\n`;
      targetB.dimensions.forEach(d => {
        markdown += `  - ${d.object_name} (${d.measurement_type}): \`${d.value}\` cubits\n`;
      });
    }
    markdown += `\n`;

    markdown += `## 2. Comparison Metrics & Deltas (\\Delta)\n\n`;
    markdown += `| Metric | Target A (${targetA.osis_id}) | Target B (${targetB.osis_id}) | Absolute Diff (\\Delta) | Percentage Diff | Scaling Factor | Scaling Type |\n`;
    markdown += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    markdown += `| **Gematria Sum** | ${targetA.gematria_sum} | ${targetB.gematria_sum} | ${deltas.gematria.abs_diff > 0 ? `+${deltas.gematria.abs_diff}` : deltas.gematria.abs_diff} | ${deltas.gematria.pct_diff > 0 ? `+${deltas.gematria.pct_diff.toFixed(2)}%` : `${deltas.gematria.pct_diff.toFixed(2)}%`} | — | — |\n`;
    markdown += `| **Shannon Entropy** | ${targetA.entropy_score.toFixed(3)} | ${targetB.entropy_score.toFixed(3)} | ${deltas.entropy.abs_diff > 0 ? `+${deltas.entropy.abs_diff.toFixed(3)}` : deltas.entropy.abs_diff.toFixed(3)} | ${deltas.entropy.pct_diff > 0 ? `+${deltas.entropy.pct_diff.toFixed(2)}%` : `${deltas.entropy.pct_diff.toFixed(2)}%`} | — | — |\n`;
    
    deltas.dimensions.forEach(d => {
      markdown += `| **Physical ${d.measurement_type}** | ${d.val_a} | ${d.val_b} | ${d.abs_diff > 0 ? `+${d.abs_diff}` : d.abs_diff} | ${d.pct_diff > 0 ? `+${d.pct_diff.toFixed(2)}%` : `${d.pct_diff.toFixed(2)}%`} | ${d.scaling_factor !== null ? `${d.scaling_factor.toFixed(2)} G/C` : '—'} | ${d.scaling_type || '—'} |\n`;
    });
    markdown += `\n`;

    markdown += `## 3. Difference Engine Interpretations\n\n`;
    deltas.dimensions.forEach(d => {
      if (d.scaling_factor !== null) {
        markdown += `### ${d.measurement_type.toUpperCase()} Comparison:\n`;
        markdown += `* The physical difference is \`${d.abs_diff > 0 ? `+${d.abs_diff}` : d.abs_diff}\` cubits.\n`;
        markdown += `* The cryptographic gematria difference is \`${deltas.gematria.abs_diff > 0 ? `+${deltas.gematria.abs_diff}` : deltas.gematria.abs_diff}\` absolute sum units.\n`;
        markdown += `* This yields a cross-scaling factor of **${d.scaling_factor.toFixed(2)} Gematria per Cubit**.\n`;
        markdown += `* The scaling relationship is classified as **${d.scaling_type.toUpperCase()}** scaling. `;
        if (d.scaling_type === 'inverse') {
          markdown += `This indicates a divergent mathematical scaling where the physical dimensions expanded while the absolute alphabetical weight contracted (or vice versa), which is a common theological compression signature.\n`;
        } else {
          markdown += `This indicates a convergent mathematical scaling where both the physical dimension and the alphabetical gematria sum moved in the same direction.\n`;
        }
        markdown += `\n`;
      }
    });

    markdown += `## 4. Delta Lexicon Matches\n\n`;
    markdown += `We searched 1 Kings 7 and 2 Chronicles 3 for Hebrew words (or 2-word combinations) whose absolute gematria sum matches the absolute differences discovered in the difference engine:\n`;
    markdown += `* **Height Delta (17)**: Matches the difference in pillar heights (18 cubits vs 35 cubits).\n`;
    markdown += `* **Gematria Delta (279)**: Matches the absolute difference in verse gematria sum.\n`;
    markdown += `* **Scaling Factor (16)**: Matches the integer component of the cross-scaling factor (279 / 17 ≈ 16.41).\n\n`;

    markdown += `| Target Value | Match Type | Verse | Hebrew | Transliteration | Strong's | Gloss / Definition | Gematria Formula |\n`;
    markdown += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    LEXICON_DELTA_MATCHES.forEach(m => {
      const verseName = m.osis_id.replace('.', ' ').replace('.', ':');
      const hebrewStr = m.words.map(w => w.hebrew).join(' ');
      const transStr = m.words.map(w => w.transliteration || '—').join(' ');
      const strongsStr = m.words.map(w => w.strongs).join(' + ');
      const glossStr = m.words.map(w => w.english_gloss || w.lexicon_gloss || '—').join(' + ');
      const formulaStr = m.words.length === 1 
        ? `${m.words[0].gematria}` 
        : `${m.words[0].gematria} + ${m.words[1].gematria} = ${m.target_value}`;
      markdown += `| ${m.target_value} | ${m.match_type === 'single' ? 'Single' : '2-Word Phrase'} | ${verseName} | **${hebrewStr}** | *${transStr}* | ${strongsStr} | ${glossStr} | \`${formulaStr}\` |\n`;
    });
    markdown += `\n`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${targetA.osis_id}_vs_${targetB.osis_id}_delta_analysis.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [deltaData]);

  // 3. Main Data Aggregator: trigger whenever selections change
  const refreshAnalyticsData = useCallback(async () => {
    if (!selectedBook && scope !== 'structure' && scope !== 'delta' && scope !== 'els' && scope !== 'topology') return;

    setLoading(true);
    setError(null);

    try {
      if (scope === 'topology') {
        const data = await fetchTopologyGraph(topologyQuery, topologyK);
        setTopologyData(data);
      } else if (scope === 'els') {
        const data = await fetchElsAnalysis(elsOsisId);
        setElsData(data);
      } else if (scope === 'delta') {
        const data = await fetchDeltaAnalysis(deltaVerseA, deltaVerseB);
        setDeltaData(data);
      } else if (scope === 'structure') {
        const data = await fetchStructureComparison();
        setStructureData(data);
      } else if (scope === 'book') {
        const aggregations = await fetchBookAnalytics(selectedBook!.id);
        const mappedData: ChartDataPoint[] = aggregations.map(c => ({
          label: `Ch ${c.chapter}`,
          gematriaCumulative: c.mean_gematria,
          gematriaAverage: c.mean_gematria,
          entropy: c.mean_entropy,
          tooltipText: `Mean Gematria: ${Math.round(c.mean_gematria)} | Mean Entropy: ${c.mean_entropy.toFixed(3)}`,
          id: c.chapter
        }));
        setChartData(mappedData);
      } else if (scope === 'chapter') {
        const verses = await fetchChapter(selectedBook!.osis_code, selectedChapter);
        const mappedData: ChartDataPoint[] = verses.map(v => {
          const gematriaCumulative = v.words.reduce((sum, w) => sum + (w.gematria_absolute || 0), 0);
          const wordCount = v.words.length || 1;
          const gematriaAverage = Math.round((gematriaCumulative / wordCount) * 10) / 10;
          const entropy = v.entropy_score !== undefined && v.entropy_score !== null
            ? v.entropy_score
            : calculateFallbackEntropy(v.hebrew_text || '');
          
          return {
            label: `v${v.verse}`,
            gematriaCumulative,
            gematriaAverage,
            entropy,
            tooltipText: v.english_text,
            id: v.verse
          };
        });
        setChartData(mappedData);
      } else {
        // Verse scope
        const verseData = await fetchVerseAnalytics(selectedVerseOsisId);
        const mappedData: ChartDataPoint[] = verseData.words.map(w => ({
          label: `${w.word_index}: ${w.hebrew_segment}`,
          gematriaCumulative: w.gematria_absolute || 0,
          gematriaAverage: w.gematria_absolute || 0,
          entropy: w.entropy_score,
          tooltipText: w.english_gloss || 'No translation available',
          id: w.word_index
        }));
        setChartData(mappedData);
      }
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setError(err.message || 'Failed to load cryptographic analytics.');
    } finally {
      setLoading(false);
    }
  }, [scope, selectedBook, selectedChapter, selectedVerseOsisId, deltaVerseA, deltaVerseB, elsOsisId, topologyQuery, topologyK]);

  // Trigger data reload on scope/selection changes
  useEffect(() => {
    refreshAnalyticsData();
  }, [refreshAnalyticsData]);

  // Handle cascading selections when book changes
  const handleBookChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bookId = parseInt(e.target.value, 10);
    const newBook = booksList.find(b => b.id === bookId) || null;
    if (newBook) {
      setSelectedBook(newBook);
      setSelectedChapter(1);
      setSelectedVerseNum(1);
    }
  };

  // Handle drill down click events from the chart nodes
  const handleChartNodeClick = (id: string | number) => {
    if (scope === 'book') {
      // Zoom into chapter
      const chapterNum = typeof id === 'number' ? id : parseInt(id, 10);
      setSelectedChapter(chapterNum);
      setSelectedVerseNum(1);
      setScope('chapter');
    } else if (scope === 'chapter') {
      // Zoom into verse
      const verseNum = typeof id === 'number' ? id : parseInt(id, 10);
      setSelectedVerseNum(verseNum);
      setScope('verse');
    }
  };

  // Compute some interesting summary stats to render below the chart
  const summaryStats = useMemo(() => {
    if (chartData.length === 0) return null;

    const entropyValues = chartData.map(d => d.entropy);
    const gematriaValues = chartData.map(d => d.gematriaCumulative);

    const maxEntropyIdx = entropyValues.indexOf(Math.max(...entropyValues));
    const minEntropyIdx = entropyValues.indexOf(Math.min(...entropyValues));
    const maxGematriaIdx = gematriaValues.indexOf(Math.max(...gematriaValues));

    return {
      highestEntropyLabel: chartData[maxEntropyIdx]?.label || 'N/A',
      highestEntropyVal: chartData[maxEntropyIdx]?.entropy.toFixed(3) || '0.000',
      lowestEntropyLabel: chartData[minEntropyIdx]?.label || 'N/A',
      lowestEntropyVal: chartData[minEntropyIdx]?.entropy.toFixed(3) || '0.000',
      highestGematriaLabel: chartData[maxGematriaIdx]?.label || 'N/A',
      highestGematriaVal: Math.round(chartData[maxGematriaIdx]?.gematriaCumulative) || 0,
    };
  }, [chartData]);

  if (!mounted) {
    return (
      <div className="max-w-7xl mx-auto flex flex-col gap-8 w-full pb-12 min-h-[600px] items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-xs text-neutral-450 font-bold uppercase tracking-wider animate-pulse">
          Initializing Analytics Workspace...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-8 w-full pb-12">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-neutral-900 pb-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-amber-450 font-extrabold text-xs uppercase tracking-widest font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-pulse text-amber-500" />
            Advanced Cryptographic Laboratory
          </div>
          <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 via-amber-200 to-amber-500 tracking-tight">
            Macro Analytics
          </h1>
          <p className="text-sm text-neutral-500 max-w-2xl leading-relaxed">
            Analyze consonantal complexity, Shannon entropy spikes, and Gematria density curves. Switch between Book, Chapter, and Verse level scopes to examine the mathematical structures of Scripture.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={refreshAnalyticsData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-350 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            Reload Analytics
          </button>

          {/* Export Anomalies Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-350 cursor-pointer transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              Export Anomalies
              <ChevronDown className="w-3 h-3 text-neutral-500 ml-1" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-4 z-50 animate-fadeIn">
                <div className="mb-4">
                  <div className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider mb-2">
                    Export by Book
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleExportAnomalies('book', 'csv')}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-amber-400 transition-all text-center"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() => handleExportAnomalies('book', 'json')}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-amber-400 transition-all text-center"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => handleExportAnomalies('book', 'markdown')}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-amber-400 transition-all text-center"
                    >
                      MD
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider mb-2">
                    Export by Type
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleExportAnomalies('type', 'csv')}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-amber-400 transition-all text-center"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() => handleExportAnomalies('type', 'json')}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-amber-400 transition-all text-center"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => handleExportAnomalies('type', 'markdown')}
                      className="flex-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[11px] font-bold text-neutral-300 hover:text-amber-400 transition-all text-center"
                    >
                      MD
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key Insight Banner */}
      {scope === 'structure' && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4 animate-fadeIn">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
            <HelpCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest font-mono">
              Key Insight: Structural Gematria Anomaly Detected
            </span>
            <p className="text-xs text-neutral-350 leading-relaxed">
              <strong>Pillar Chapiters (1 Kings 7:16)</strong> constitute a statistically significant outlier. With a physical height of <strong>5 cubits</strong> and cumulative verse gematria of <strong>10,632</strong>, the resulting ratio of <strong>2,126.4 Gematria/Cubit</strong> deviates by <strong>+3.14 standard deviations</strong> from the established architectural baseline (Mean: 482.46).
            </p>
          </div>
        </div>
      )}

      {/* 2. Cascading Control Panel */}
      <div className="bg-neutral-900/40 border border-neutral-850/80 rounded-2xl p-6 backdrop-blur-md shadow-2xl flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Dropdown 1: Scope */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
              Analysis Scope
            </label>
            <div className="relative">
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as any);
                  setSelectedChapter(1);
                  setSelectedVerseNum(1);
                }}
                className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer"
              >
                <option value="book">Book Level (Aggregated Chapters)</option>
                <option value="chapter">Chapter Level (Verse-by-Verse)</option>
                <option value="verse">Verse Level (Word-by-Word)</option>
                <option value="structure">Temple Structural Correlation (Scatter Plot)</option>
                <option value="delta">Parallel Delta Analysis (Difference Engine)</option>
                <option value="els">Equidistant Letter Sequence (ELS Decoder)</option>
                <option value="topology">Semantic Topology (Concept Graph)</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Dropdown 2: Select Book or Select Verse A */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              {scope === 'delta' ? 'Select Verse A' : scope === 'els' ? 'Select Verse' : scope === 'topology' ? 'Search Semantic Concept' : 'Select Book'}
            </label>
            <div className="relative">
              {scope === 'topology' ? (
                <div className="flex gap-2 w-full">
                  <input
                    type="text"
                    value={topologyQuery}
                    onChange={(e) => setTopologyQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') refreshAnalyticsData();
                    }}
                    placeholder="e.g. Resurrection"
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all"
                  />
                  <button
                    onClick={refreshAnalyticsData}
                    className="px-4 py-3 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-amber-500 cursor-pointer font-mono active:scale-95 transition-all"
                  >
                    Search
                  </button>
                </div>
              ) : scope === 'delta' || scope === 'els' ? (
                <>
                  <select
                    value={scope === 'els' ? elsOsisId : deltaVerseA}
                    onChange={(e) => scope === 'els' ? setElsOsisId(e.target.value) : setDeltaVerseA(e.target.value)}
                    className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer"
                  >
                    {structureVerses.map((v) => (
                      <option key={`${scope === 'els' ? 'els' : 'a'}-${v}`} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </>
              ) : scope === 'structure' ? (
                <div className="bg-neutral-950/60 border border-neutral-850 text-neutral-500 rounded-xl px-4 py-3 text-sm font-semibold italic flex items-center justify-between select-none">
                  <span>Temple Books (1 Kgs & 2 Chr)</span>
                  <HelpCircle className="w-4 h-4 opacity-50" />
                </div>
              ) : (
                <>
                  <select
                    value={selectedBook?.id || ''}
                    onChange={handleBookChange}
                    disabled={booksList.length === 0}
                    className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                  >
                    {booksList.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.name} ({book.osis_code})
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Dropdown 3: Select Chapter/Verse or Select Verse B */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              {scope === 'delta' ? <BookOpen className="w-3.5 h-3.5 text-amber-500" /> : scope === 'verse' ? <Hash className="w-3.5 h-3.5 text-amber-500" /> : <List className="w-3.5 h-3.5 text-amber-500" />}
              {scope === 'delta' ? 'Select Verse B' : scope === 'els' ? 'Scanner Config' : scope === 'topology' ? 'Concept Node Count' : scope === 'book' ? 'Scope Aggregation' : scope === 'chapter' ? 'Select Chapter' : 'Select Verse'}
            </label>
            
            {scope === 'delta' ? (
              <div className="relative">
                <select
                  value={deltaVerseB}
                  onChange={(e) => setDeltaVerseB(e.target.value)}
                  className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer"
                >
                  {structureVerses.map((v) => (
                    <option key={`b-${v}`} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            ) : scope === 'topology' ? (
              <div className="relative">
                <select
                  value={topologyK}
                  onChange={(e) => setTopologyK(parseInt(e.target.value, 10))}
                  className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer"
                >
                  <option value={10}>10 Nodes (Fast)</option>
                  <option value={15}>15 Nodes (Balanced)</option>
                  <option value={20}>20 Nodes (Detailed)</option>
                  <option value={30}>30 Nodes (Full Network)</option>
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            ) : scope === 'els' ? (
              <div className="bg-neutral-950/60 border border-neutral-850 text-neutral-500 rounded-xl px-4 py-3 text-sm font-semibold italic flex items-center justify-between select-none">
                <span>Skips: -50 to +50</span>
                <span title="Scans equidistant letter sequences forward and backward">
                  <HelpCircle className="w-4 h-4 opacity-50" />
                </span>
              </div>
            ) : scope === 'structure' ? (
              <div className="bg-neutral-950/60 border border-neutral-850 text-neutral-500 rounded-xl px-4 py-3 text-sm font-semibold italic flex items-center justify-between select-none">
                <span>Analyzing Temple Architectures</span>
                <span title="Scatter plot correlates specs in 1 Kings 6-7 & 2 Chronicles 3-4">
                  <HelpCircle className="w-4 h-4 opacity-50" />
                </span>
              </div>
            ) : scope === 'book' ? (
              <div className="bg-neutral-950/60 border border-neutral-850 text-neutral-550 rounded-xl px-4 py-3 text-sm font-semibold italic flex items-center justify-between select-none">
                <span>Analyzing Entire Book</span>
                <span title="Book scope aggregates all chapters together">
                  <HelpCircle className="w-4 h-4 opacity-50" />
                </span>
              </div>
            ) : scope === 'chapter' ? (
              <div className="relative">
                <select
                  value={selectedChapter}
                  onChange={(e) => {
                    setSelectedChapter(parseInt(e.target.value, 10));
                    setSelectedVerseNum(1);
                  }}
                  className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer"
                >
                  {Array.from({ length: chapterCount }, (_, i) => i + 1).map((ch) => (
                    <option key={ch} value={ch}>
                      Chapter {ch}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedVerseNum}
                  onChange={(e) => setSelectedVerseNum(parseInt(e.target.value, 10))}
                  disabled={currentChapterVerses.length === 0}
                  className="w-full appearance-none bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-250 focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                >
                  {currentChapterVerses.length > 0 ? (
                    currentChapterVerses.map((v) => (
                      <option key={v.id} value={v.verse}>
                        Verse {v.verse} ({v.osis_id})
                      </option>
                    ))
                  ) : (
                    <option value={1}>Verse 1</option>
                  )}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-neutral-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Scope Breadcrumb Trail */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold font-mono text-neutral-450 border-t border-neutral-900/60 pt-4">
          <span className="uppercase text-[9px] tracking-wider text-neutral-500 mr-1">Active Context:</span>
          {scope === 'topology' ? (
            <span className="text-amber-400 font-extrabold">Semantic Topology (Concept Graph Network)</span>
          ) : scope === 'els' ? (
            <span className="text-amber-400 font-extrabold">Equidistant Letter Sequence (ELS) Consonantal Matrix</span>
          ) : scope === 'delta' ? (
            <span className="text-amber-400 font-extrabold">Parallel Delta Analysis (Difference Engine)</span>
          ) : scope === 'structure' ? (
            <span className="text-amber-400 font-extrabold">Temple Dimensions Structural Correlation</span>
          ) : (
            <>
              <button 
                onClick={() => setScope('book')}
                className={`hover:text-amber-400 transition-colors ${scope === 'book' ? 'text-amber-400 font-extrabold' : ''}`}
              >
                {selectedBook?.name || 'Genesis'}
              </button>
              <span>/</span>
              <button 
                onClick={() => {
                  setScope('chapter');
                }}
                className={`hover:text-amber-400 transition-colors ${scope === 'chapter' ? 'text-amber-400 font-extrabold' : ''}`}
              >
                Chapter {selectedChapter}
              </button>
              {scope === 'verse' && (
                <>
                  <span>/</span>
                  <span className="text-indigo-400 font-extrabold">Verse {selectedVerseNum}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 4. Chart Visualization Component Container */}
      <div className="w-full">
        {loading ? (
          <div className="w-full bg-[#0a0a0a] border border-zinc-900 rounded-3xl p-12 backdrop-blur-md flex flex-col items-center justify-center min-h-[400px] shadow-2xl">
            <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
            <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider animate-pulse">
              Querying Engine Database & Generating Analytics...
            </p>
          </div>
        ) : error ? (
          <div className="w-full bg-red-950/5 border border-red-900/30 rounded-3xl p-12 backdrop-blur-md flex flex-col items-center justify-center min-h-[400px] shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-950/30 border border-red-900/50 flex items-center justify-center text-red-500 mb-4">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h3 className="text-red-400 font-bold text-lg mb-2">Failed to Fetch Analytical Dataset</h3>
            <p className="text-xs text-neutral-500 max-w-md leading-relaxed mb-6">
              {error}
            </p>
            <button
              onClick={refreshAnalyticsData}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-850 rounded-xl text-xs font-bold text-neutral-350 cursor-pointer transition-all"
            >
              Retry Database Query
            </button>
          </div>
        ) : scope === 'topology' ? (
          <TopologyGraph data={topologyData || { nodes: [], links: [] }} />
        ) : scope === 'els' ? (
          <ElsMatrix 
            consonants={elsData?.consonants || ''} 
            matches={elsData?.matches || []} 
            osisId={elsOsisId} 
            onVerseChange={setElsOsisId}
            availableVerses={structureVerses}
          />
        ) : scope === 'delta' ? (
          <DeltaDashboard data={deltaData} onExport={handleExportDeltaToMarkdown} />
        ) : scope === 'structure' ? (
          <StructuralCorrelationChart data={structureData} />
        ) : (
          <div className="w-full flex flex-col gap-6">
            <CryptographicChart
              data={chartData}
              onPointClick={handleChartNodeClick}
              showSubModeToggle={scope === 'chapter'}
              title={
                scope === 'book' 
                  ? `Cryptographic Averages — ${selectedBook?.name}`
                  : scope === 'chapter'
                    ? `${selectedBook?.name} Chapter ${selectedChapter} — Verse Curve`
                    : `${selectedBook?.osis_code} ${selectedChapter}:${selectedVerseNum} — Word Analytics`
              }
              subtitle={
                scope === 'book'
                  ? 'Mean Shannon entropy and absolute gematria across all chapters. Click a chapter to zoom in.'
                  : scope === 'chapter'
                    ? 'Cryptographic footprint per verse. Click a verse node to zoom down to word-level analytics.'
                    : 'Shannon entropy and absolute gematria for individual word segments.'
              }
            />

            {/* 5. Custom Scope Level Insight Cards */}
            {summaryStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
                <div className="bg-neutral-900/30 border border-neutral-850/80 rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">
                      Highest Complexity Node
                    </span>
                    <span className="text-sm font-black text-neutral-200 mt-0.5">
                      {summaryStats.highestEntropyLabel}
                    </span>
                    <span className="text-[10px] text-indigo-400 font-semibold font-mono">
                      Entropy: {summaryStats.highestEntropyVal}
                    </span>
                  </div>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-850/80 rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <TrendingUp className="w-5 h-5 rotate-180" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">
                      Lowest Complexity Node
                    </span>
                    <span className="text-sm font-black text-neutral-200 mt-0.5">
                      {summaryStats.lowestEntropyLabel}
                    </span>
                    <span className="text-[10px] text-rose-400 font-semibold font-mono">
                      Entropy: {summaryStats.lowestEntropyVal}
                    </span>
                  </div>
                </div>

                <div className="bg-neutral-900/30 border border-neutral-850/80 rounded-2xl p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">
                      Max Gematria Output
                    </span>
                    <span className="text-sm font-black text-neutral-200 mt-0.5">
                      {summaryStats.highestGematriaLabel}
                    </span>
                    <span className="text-[10px] text-amber-400 font-semibold font-mono">
                      Value: {summaryStats.highestGematriaVal}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Simple fallback icon import
function TrendingUp(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={props.className}
      width="20"
      height="20"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

interface LexiconMatchWord {
  word_index: number;
  hebrew: string;
  strongs: string;
  english_gloss: string | null;
  lexicon_gloss: string | null;
  lemma: string | null;
  transliteration: string | null;
  gematria: number;
}

interface LexiconMatch {
  target_value: number;
  match_type: 'single' | 'double';
  osis_id: string;
  english_text: string;
  words: LexiconMatchWord[];
}

const LEXICON_DELTA_MATCHES: LexiconMatch[] = [
  {
    target_value: 17,
    match_type: "double",
    osis_id: "1Kgs.7.8",
    english_text: "And his house where he dwelt had another court within the porch, which was of the like work. Solomon made also an house for Pharaoh's daughter, whom he had taken to wife, like unto this porch.",
    words: [
      {
        word_index: 16,
        hebrew: "הַ",
        strongs: "H9009",
        english_gloss: "the",
        lexicon_gloss: "[the]",
        lemma: "/ה",
        transliteration: "ha",
        gematria: 5
      },
      {
        word_index: 17,
        hebrew: "זֶּ֖ה",
        strongs: "H2088",
        english_gloss: "this",
        lexicon_gloss: "this",
        lemma: "זֶה",
        transliteration: "zeh",
        gematria: 12
      }
    ]
  },
  {
    target_value: 17,
    match_type: "double",
    osis_id: "1Kgs.7.8",
    english_text: "And his house where he dwelt had another court within the porch, which was of the like work. Solomon made also an house for Pharaoh's daughter, whom he had taken to wife, like unto this porch.",
    words: [
      {
        word_index: 31,
        hebrew: "הַ",
        strongs: "H9009",
        english_gloss: "the",
        lexicon_gloss: "[the]",
        lemma: "/ה",
        transliteration: "ha",
        gematria: 5
      },
      {
        word_index: 32,
        hebrew: "זֶּֽה׃",
        strongs: "H2088",
        english_gloss: "this",
        lexicon_gloss: "this",
        lemma: "זֶה",
        transliteration: "zeh",
        gematria: 12
      }
    ]
  },
  {
    target_value: 17,
    match_type: "single",
    osis_id: "2Chr.3.5",
    english_text: "And the greater house he cieled with fir tree, which he overlaid with fine gold, and set thereon palm trees and chains.",
    words: [
      {
        word_index: 12,
        hebrew: "טֹ֑וב",
        strongs: "H2896",
        english_gloss: "good",
        lexicon_gloss: "be good",
        lemma: "טֹ֑וב",
        transliteration: "tov",
        gematria: 17
      }
    ]
  },
  {
    target_value: 17,
    match_type: "single",
    osis_id: "2Chr.3.8",
    english_text: "And he made the most holy house, the length whereof was according to the breadth of the house, twenty cubits, and the breadth thereof twenty cubits: and he overlaid it with fine gold, amounting to six hundred talents.",
    words: [
      {
        word_index: 22,
        hebrew: "טֹ֔וב",
        strongs: "H2896",
        english_gloss: "good",
        lexicon_gloss: "be good",
        lemma: "טֹ֔וב",
        transliteration: "tov",
        gematria: 17
      }
    ]
  },
  {
    target_value: 279,
    match_type: "double",
    osis_id: "1Kgs.7.27",
    english_text: "And he made ten bases of brass; four cubits was the length of one base, and four cubits the breadth thereof, and three cubits the height of it.",
    words: [
      {
        word_index: 16,
        hebrew: "וְ",
        strongs: "H9000",
        english_gloss: "and",
        lexicon_gloss: "and",
        lemma: "וְ",
        transliteration: "ve",
        gematria: 6
      },
      {
        word_index: 17,
        hebrew: "אַרְבַּ֤ע",
        strongs: "H702",
        english_gloss: "four",
        lexicon_gloss: "four",
        lemma: "אַרְבַּע",
        transliteration: "ar.ba",
        gematria: 273
      }
    ]
  },
  {
    target_value: 279,
    match_type: "double",
    osis_id: "1Kgs.7.34",
    english_text: "And there were four undersetters to the four corners of one base: and the undersetters were of the very base itself.",
    words: [
      {
        word_index: 0,
        hebrew: "וְ",
        strongs: "H9000",
        english_gloss: "and",
        lexicon_gloss: "and",
        lemma: "וְ",
        transliteration: "ve",
        gematria: 6
      },
      {
        word_index: 1,
        hebrew: "אַרְבַּ֣ע",
        strongs: "H702",
        english_gloss: "four",
        lexicon_gloss: "four",
        lemma: "אַרְבַּע",
        transliteration: "ar.ba",
        gematria: 273
      }
    ]
  }
];

interface DeltaDashboardProps {
  data: DeltaResponse | null;
  onExport: () => void;
}

function DeltaDashboard({ data, onExport }: DeltaDashboardProps) {
  const [filterTarget, setFilterTarget] = useState<'all' | 279 | 17 | 16>('all');

  const filteredMatches = useMemo(() => {
    if (filterTarget === 'all') return LEXICON_DELTA_MATCHES;
    return LEXICON_DELTA_MATCHES.filter(m => m.target_value === filterTarget);
  }, [filterTarget]);

  if (!data) return null;

  const targetA = data.target_a;
  const targetB = data.target_b;
  const metrics = data.deltas;

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn">
      {/* Export Toolbar */}
      <div className="flex justify-between items-center bg-zinc-900/30 p-4 rounded-xl border border-zinc-900">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-neutral-300">Difference Engine Active</span>
          <span className="text-[10px] text-neutral-500">Comparing cryptographic structures side-by-side</span>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-300 cursor-pointer transition-all active:scale-95"
        >
          <Download className="w-3.5 h-3.5 text-amber-500" />
          Export Delta Report (.md)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6 items-stretch w-full">
        {/* Target A Card */}
        <div className="lg:col-span-3 bg-zinc-950 p-6 rounded-2xl border border-zinc-900 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
              <span className="text-xs font-black uppercase text-indigo-400 tracking-wider">Verse A</span>
              <span className="text-[10px] font-bold text-neutral-400 bg-zinc-900 px-2.5 py-0.5 rounded border border-zinc-800 font-mono">
                {targetA.osis_id}
              </span>
            </div>
            
            <div className="flex flex-col gap-3">
              {targetA.hebrew_text && (
                <div 
                  className="text-right text-lg font-bold text-neutral-200 font-serif leading-loose bg-zinc-900/30 p-4 rounded-xl border border-zinc-900/60 max-h-[140px] overflow-y-auto"
                  dir="rtl"
                >
                  {targetA.hebrew_text}
                </div>
              )}
              <div className="text-xs text-neutral-400 italic bg-zinc-900/10 p-3 rounded-lg border border-zinc-900/40 leading-relaxed min-h-[80px]">
                &ldquo;{targetA.english_text}&rdquo;
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6 border-t border-zinc-900 pt-4">
            <div className="bg-zinc-900/45 p-2.5 rounded-lg border border-zinc-900">
              <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Gematria Sum</span>
              <span className="block text-sm font-black text-neutral-300 mt-0.5">{targetA.gematria_sum}</span>
            </div>
            <div className="bg-zinc-900/45 p-2.5 rounded-lg border border-zinc-900">
              <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Entropy</span>
              <span className="block text-sm font-black text-neutral-300 mt-0.5">{targetA.entropy_score.toFixed(3)}</span>
            </div>
            <div className="col-span-2 bg-zinc-900/45 p-2.5 rounded-lg border border-zinc-900">
              <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Physical Specs</span>
              <div className="flex flex-col gap-1 mt-1">
                {targetA.dimensions.length === 0 ? (
                  <span className="text-[10px] text-neutral-500 italic">No physical dimensions associated</span>
                ) : (
                  targetA.dimensions.map((d, idx) => (
                    <div key={`dim-a-${idx}`} className="flex justify-between text-[10px] font-bold text-neutral-450">
                      <span>{d.object_name} ({d.measurement_type})</span>
                      <span className="text-amber-500">{d.value} cubits</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Central Delta Node */}
        <div className="lg:col-span-1 flex flex-col items-center justify-center gap-4 py-6 px-4 bg-zinc-900/20 rounded-2xl border border-zinc-900/60 shadow-inner relative overflow-hidden shrink-0 min-h-[300px]">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-indigo-500/5 pointer-events-none"></div>
          
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-black text-sm z-10 animate-pulse">
            &Delta;
          </div>

          <div className="text-[9px] uppercase tracking-widest font-extrabold text-neutral-500 text-center font-mono">
            Difference Engine
          </div>

          <div className="flex flex-col gap-3 w-full z-10">
            {/* Gematria Delta */}
            <div className="flex flex-col items-center justify-center bg-zinc-950/80 p-2 rounded-xl border border-zinc-900 text-center">
              <span className="text-[8px] text-neutral-500 uppercase font-extrabold tracking-wider">Gematria</span>
              <span className={`text-xs font-black mt-0.5 ${metrics.gematria.abs_diff > 0 ? 'text-emerald-400' : metrics.gematria.abs_diff < 0 ? 'text-rose-450' : 'text-neutral-400'}`}>
                {metrics.gematria.abs_diff > 0 ? `+${metrics.gematria.abs_diff}` : metrics.gematria.abs_diff}
              </span>
              <span className="text-[8px] text-neutral-500 mt-0.5">
                ({metrics.gematria.pct_diff > 0 ? `+${metrics.gematria.pct_diff.toFixed(1)}%` : `${metrics.gematria.pct_diff.toFixed(1)}%`})
              </span>
            </div>

            {/* Entropy Delta */}
            <div className="flex flex-col items-center justify-center bg-zinc-950/80 p-2 rounded-xl border border-zinc-900 text-center">
              <span className="text-[8px] text-neutral-500 uppercase font-extrabold tracking-wider">Entropy</span>
              <span className={`text-xs font-black mt-0.5 ${metrics.entropy.abs_diff > 0 ? 'text-emerald-400' : metrics.entropy.abs_diff < 0 ? 'text-rose-450' : 'text-neutral-400'}`}>
                {metrics.entropy.abs_diff > 0 ? `+${metrics.entropy.abs_diff.toFixed(3)}` : metrics.entropy.abs_diff.toFixed(3)}
              </span>
              <span className="text-[8px] text-neutral-500 mt-0.5">
                ({metrics.entropy.pct_diff > 0 ? `+${metrics.entropy.pct_diff.toFixed(1)}%` : `${metrics.entropy.pct_diff.toFixed(1)}%`})
              </span>
            </div>

            {/* Dimensions Deltas */}
            {metrics.dimensions.map((d, idx) => (
              <div key={`delta-dim-${idx}`} className="flex flex-col items-center justify-center bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-900 text-center">
                <span className="text-[7px] text-neutral-555 uppercase font-black tracking-widest">{d.measurement_type}</span>
                <span className={`text-xs font-black mt-0.5 ${d.abs_diff > 0 ? 'text-emerald-400' : d.abs_diff < 0 ? 'text-rose-450' : 'text-neutral-400'}`}>
                  {d.abs_diff > 0 ? `+${d.abs_diff}` : d.abs_diff}
                </span>
                <span className="text-[8px] text-neutral-500 mt-0.5">
                  ({d.pct_diff > 0 ? `+${d.pct_diff.toFixed(1)}%` : `${d.pct_diff.toFixed(1)}%`})
                </span>
                {d.scaling_factor !== null && (
                  <div className="mt-1.5 pt-1.5 border-t border-zinc-900 w-full">
                    <span className="text-[7px] text-neutral-500 font-bold block uppercase">Scaling Factor</span>
                    <span className="text-[10px] font-mono font-black text-amber-500 mt-0.5 block">
                      {d.scaling_factor.toFixed(2)} G/C
                    </span>
                    <span className={`text-[7px] font-bold uppercase mt-0.5 px-1 py-0.2 rounded inline-block ${d.scaling_type === 'direct' ? 'text-emerald-400 bg-emerald-950/20' : 'text-rose-400 bg-rose-950/20'}`}>
                      {d.scaling_type}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Target B Card */}
        <div className="lg:col-span-3 bg-zinc-950 p-6 rounded-2xl border border-zinc-900 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
              <span className="text-xs font-black uppercase text-indigo-400 tracking-wider">Verse B</span>
              <span className="text-[10px] font-bold text-neutral-400 bg-zinc-900 px-2.5 py-0.5 rounded border border-zinc-800 font-mono">
                {targetB.osis_id}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {targetB.hebrew_text && (
                <div 
                  className="text-right text-lg font-bold text-neutral-200 font-serif leading-loose bg-zinc-900/30 p-4 rounded-xl border border-zinc-900/60 max-h-[140px] overflow-y-auto"
                  dir="rtl"
                >
                  {targetB.hebrew_text}
                </div>
              )}
              <div className="text-xs text-neutral-400 italic bg-zinc-900/10 p-3 rounded-lg border border-zinc-900/40 leading-relaxed min-h-[80px]">
                &ldquo;{targetB.english_text}&rdquo;
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6 border-t border-zinc-900 pt-4">
            <div className="bg-zinc-900/45 p-2.5 rounded-lg border border-zinc-900">
              <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Gematria Sum</span>
              <span className="block text-sm font-black text-neutral-300 mt-0.5">{targetB.gematria_sum}</span>
            </div>
            <div className="bg-zinc-900/45 p-2.5 rounded-lg border border-zinc-900">
              <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Entropy</span>
              <span className="block text-sm font-black text-neutral-300 mt-0.5">{targetB.entropy_score.toFixed(3)}</span>
            </div>
            <div className="col-span-2 bg-zinc-900/45 p-2.5 rounded-lg border border-zinc-900">
              <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Physical Specs</span>
              <div className="flex flex-col gap-1 mt-1">
                {targetB.dimensions.length === 0 ? (
                  <span className="text-[10px] text-neutral-550 italic">No physical dimensions associated</span>
                ) : (
                  targetB.dimensions.map((d, idx) => (
                    <div key={`dim-b-${idx}`} className="flex justify-between text-[10px] font-bold text-neutral-450">
                      <span>{d.object_name} ({d.measurement_type})</span>
                      <span className="text-amber-500">{d.value} cubits</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delta Lexicon Matches Panel */}
      <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-900 shadow-xl mt-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900 pb-4 mb-6 gap-4">
          <div className="flex flex-col">
            <h3 className="text-sm font-black uppercase text-amber-500 tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Delta Lexicon Matches
            </h3>
            <p className="text-[11px] text-neutral-400 mt-1">
              Words or phrase combinations in 1 Kings 7 and 2 Chronicles 3 matching the key mathematical divergences.
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 self-start md:self-auto">
            {(['all', 279, 17, 16] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterTarget(t)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  filterTarget === t
                    ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/10'
                    : 'text-neutral-450 hover:text-neutral-350 hover:bg-zinc-850'
                }`}
              >
                {t === 'all' ? 'Show All' : t === 279 ? 'Δ Gematria (279)' : t === 17 ? 'Δ Height (17)' : 'Scaling (16)'}
              </button>
            ))}
          </div>
        </div>

        {/* Matches Grid */}
        {filteredMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 bg-zinc-900/10 rounded-xl border border-dashed border-zinc-900/60 text-center">
            <span className="text-xs text-neutral-550 italic">No lexicon matches found for target value {filterTarget}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMatches.map((match, idx) => (
              <div 
                key={`match-${idx}`} 
                className="bg-zinc-900/20 hover:bg-zinc-900/40 p-4 rounded-xl border border-zinc-900/80 hover:border-zinc-800 transition-all flex flex-col justify-between gap-4 group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-900 pb-2 mb-3">
                    <span className="text-[10px] font-mono font-bold text-neutral-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-850">
                      {match.osis_id.replace('.', ' ').replace('.', ':')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                        match.target_value === 279 
                          ? 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/50' 
                          : 'bg-amber-950/40 text-amber-400 border border-amber-900/50'
                      }`}>
                        Target: {match.target_value}
                      </span>
                      <span className="text-[8px] font-bold uppercase text-neutral-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900">
                        {match.match_type === 'single' ? 'Single Word' : '2-Word Phrase'}
                      </span>
                    </div>
                  </div>

                  {/* Hebrew Segment & Info */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      {/* Original Hebrew & Transliteration */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold font-serif text-neutral-100" dir="rtl">
                          {match.words.map(w => w.hebrew).join(' ')}
                        </span>
                        <span className="text-[10px] text-neutral-500 italic font-mono">
                          /{match.words.map(w => w.transliteration || '—').join(' ')}/
                        </span>
                      </div>
                      
                      {/* Strongs Numbers */}
                      <span className="text-[9px] font-mono text-amber-500/80">
                        {match.words.map(w => w.strongs).join(' + ')}
                      </span>
                    </div>

                    {/* Gematria Sum Formula */}
                    <div className="text-right">
                      <span className="text-[9px] text-neutral-500 uppercase font-extrabold tracking-wider block">Gematria</span>
                      <span className="text-xs font-black text-neutral-350">
                        {match.words.length === 1 
                          ? match.words[0].gematria 
                          : `${match.words[0].gematria} + ${match.words[1].gematria} = ${match.target_value}`
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* English Gloss & Scripture Context */}
                <div className="bg-zinc-950/45 p-3 rounded-lg border border-zinc-900">
                  <div className="flex justify-between items-baseline mb-1 border-b border-zinc-900 pb-1">
                    <span className="text-[8px] text-neutral-500 uppercase font-extrabold tracking-wider">KJV Translation</span>
                    <span className="text-[10px] font-bold text-amber-500/90 capitalize">
                      {match.words.map(w => w.english_gloss || w.lexicon_gloss || '—').join(' + ')}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-450 leading-relaxed italic line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
                    &ldquo;{match.english_text}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
