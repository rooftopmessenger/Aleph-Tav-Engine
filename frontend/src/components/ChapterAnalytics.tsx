'use client';

import React, { useState, useMemo } from 'react';
import { Verse } from '@/lib/api';

interface ChapterAnalyticsProps {
  verses: Verse[];
  onVerseSelect?: (verseNum: number) => void;
}

export default function ChapterAnalytics({ verses, onVerseSelect }: ChapterAnalyticsProps) {
  const [mode, setMode] = useState<'cumulative' | 'average'>('cumulative');
  const [hoveredPoint, setHoveredPoint] = useState<{
    verseNum: number;
    osisId: string;
    value: number;
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // Compute Gematria values per verse based on the selected mode
  const dataPoints = useMemo(() => {
    return verses.map((verse) => {
      // Collect gematria absolute values for all Hebrew words in the verse
      const values = verse.words
        .map((w) => w.gematria_absolute)
        .filter((val): val is number => typeof val === 'number' && val > 0);

      let value = 0;
      if (values.length > 0) {
        if (mode === 'cumulative') {
          value = values.reduce((sum, current) => sum + current, 0);
        } else {
          // Average
          const sum = values.reduce((sum, current) => sum + current, 0);
          value = Math.round((sum / values.length) * 10) / 10;
        }
      }

      return {
        verseNum: verse.verse,
        osisId: verse.osis_id,
        value,
        text: verse.english_text,
      };
    });
  }, [verses, mode]);

  // Compute statistical metrics (Mean, Standard Deviation, Anomalies)
  const stats = useMemo(() => {
    if (dataPoints.length === 0) return { mean: 0, stdDev: 0, threshold: 0 };
    
    const values = dataPoints.map((d) => d.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / values.length;

    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // Spike threshold: 1.5 standard deviations above mean
    const threshold = mean + 1.5 * stdDev;

    return {
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      threshold,
    };
  }, [dataPoints]);

  // SVG Chart layout constants
  const width = 800;
  const height = 240;
  const paddingLeft = 50;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Max value for scaling Y-axis
  const maxValue = useMemo(() => {
    const maxVal = Math.max(...dataPoints.map((d) => d.value), 10);
    return Math.ceil(maxVal * 1.15); // Add 15% headroom
  }, [dataPoints]);

  // X Coordinate calculation
  const getX = (index: number) => {
    if (dataPoints.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (dataPoints.length - 1)) * chartWidth;
  };

  // Y Coordinate calculation (SVG Y starts at 0 at the top, so we invert)
  const getY = (value: number) => {
    if (maxValue === 0) return height - paddingBottom;
    return height - paddingBottom - (value / maxValue) * chartHeight;
  };

  // Generate SVG path for the line
  const linePath = useMemo(() => {
    if (dataPoints.length === 0) return '';
    return dataPoints
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`)
      .join(' ');
  }, [dataPoints, maxValue]);

  // Generate SVG path for the area under the line
  const areaPath = useMemo(() => {
    if (dataPoints.length === 0) return '';
    const startPoint = `M ${getX(0)} ${height - paddingBottom}`;
    const lineSegments = dataPoints.map((d, i) => `L ${getX(i)} ${getY(d.value)}`).join(' ');
    const endPoint = `L ${getX(dataPoints.length - 1)} ${height - paddingBottom} Z`;
    return `${startPoint} ${lineSegments} ${endPoint}`;
  }, [dataPoints, maxValue]);

  const handlePointClick = (verseNum: number) => {
    if (onVerseSelect) {
      onVerseSelect(verseNum);
    } else {
      const el = document.getElementById(`verse-${verseNum}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div className="w-full bg-neutral-900/60 border border-neutral-850 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-6 shadow-2xl">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Cryptographic Density Heatmap
          </h3>
          <p className="text-xs text-neutral-500">
            Verse-by-verse Absolute Gematria density curves. Spikes highlight mathematical anomalies.
          </p>
        </div>

        {/* Toggle Mode Swapper */}
        <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-850/80 w-fit">
          <button
            onClick={() => setMode('cumulative')}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              mode === 'cumulative'
                ? 'bg-amber-500 text-neutral-950 font-extrabold shadow-sm'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Cumulative
          </button>
          <button
            onClick={() => setMode('average')}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              mode === 'average'
                ? 'bg-amber-500 text-neutral-950 font-extrabold shadow-sm'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Average
          </button>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden bg-neutral-950/40 border border-neutral-900 rounded-xl p-4">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto overflow-visible"
        >
          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const val = maxValue * ratio;
            const y = getY(val);
            return (
              <g key={ratio} className="opacity-20">
                <line 
                  x1={paddingLeft} 
                  y1={y} 
                  x2={width - paddingRight} 
                  y2={y} 
                  stroke="#525252" 
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text 
                  x={paddingLeft - 8} 
                  y={y + 3} 
                  textAnchor="end" 
                  className="fill-neutral-500 text-[10px] font-mono"
                >
                  {Math.round(val)}
                </text>
              </g>
            );
          })}

          {/* Statistical Standard Deviation Line */}
          {stats.threshold < maxValue && (
            <g className="opacity-30">
              <line 
                x1={paddingLeft} 
                y1={getY(stats.threshold)} 
                x2={width - paddingRight} 
                y2={getY(stats.threshold)} 
                stroke="#f59e0b" 
                strokeWidth={1.5}
                strokeDasharray="6 3"
              />
              <text 
                x={width - paddingRight - 8} 
                y={getY(stats.threshold) - 6} 
                textAnchor="end" 
                className="fill-amber-400 text-[9px] font-bold tracking-wide uppercase font-mono"
              >
                Anomaly Threshold (+1.5 SD)
              </text>
            </g>
          )}

          {/* Area Fill */}
          <path 
            d={areaPath} 
            className="fill-amber-500/5 stroke-none"
          />

          {/* Line Path */}
          <path 
            d={linePath} 
            className="stroke-amber-500 fill-none" 
            strokeWidth={2}
          />

          {/* Interactive Data Points (Circles) */}
          {dataPoints.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.value);
            const isAnomaly = d.value > stats.threshold;
            
            return (
              <g key={d.verseNum}>
                {/* Glow ring for anomalies */}
                {isAnomaly && (
                  <circle 
                    cx={cx} 
                    cy={cy} 
                    r={8} 
                    className="fill-none stroke-amber-500/40 animate-ping"
                    strokeWidth={1.5}
                  />
                )}
                {/* Data point circle */}
                <circle 
                  cx={cx} 
                  cy={cy} 
                  r={isAnomaly ? 5.5 : 4} 
                  onClick={() => handlePointClick(d.verseNum)}
                  onMouseEnter={(e) => {
                    const svgRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                    if (svgRect) {
                      setHoveredPoint({
                        verseNum: d.verseNum,
                        osisId: d.osisId,
                        value: d.value,
                        text: d.text,
                        x: cx,
                        y: cy,
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className={`cursor-pointer transition-all duration-200 hover:r-7 hover:stroke-white hover:stroke-2
                    ${isAnomaly 
                      ? 'fill-amber-400 stroke-amber-500 stroke-1' 
                      : 'fill-neutral-900 stroke-amber-500 stroke-1.5'
                    }
                  `}
                />
              </g>
            );
          })}

          {/* Bottom X-Axis labels (every 5 verses to avoid crowding) */}
          {dataPoints.map((d, i) => {
            if (d.verseNum === 1 || d.verseNum === dataPoints.length || d.verseNum % 5 === 0) {
              return (
                <text 
                  key={d.verseNum}
                  x={getX(i)} 
                  y={height - paddingBottom + 18} 
                  textAnchor="middle" 
                  className="fill-neutral-600 text-[10px] font-mono"
                >
                  v{d.verseNum}
                </text>
              );
            }
            return null;
          })}
        </svg>

        {/* Floating HTML Chart Tooltip */}
        {hoveredPoint && (
          <div 
            style={{
              position: 'absolute',
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              transform: 'translate(-50%, -115%)',
            }}
            className="z-30 bg-neutral-950/95 border border-amber-500/40 rounded-xl p-3 shadow-2xl flex flex-col gap-1.5 w-64 pointer-events-none animate-fadeIn backdrop-blur-md"
          >
            <div className="flex justify-between items-center border-b border-neutral-900 pb-1.5">
              <span className="text-[10px] font-bold text-amber-500 font-mono tracking-wider">
                {hoveredPoint.osisId}
              </span>
              <span className="text-[10px] font-mono font-bold text-neutral-450 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-850">
                {mode === 'cumulative' ? 'Abs Sum' : 'Abs Avg'}: {hoveredPoint.value}
              </span>
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed italic line-clamp-2">
              "{hoveredPoint.text}"
            </p>
            <div className="text-[8px] text-neutral-550 font-bold uppercase tracking-wider text-right">
              Click node to navigate
            </div>
          </div>
        )}
      </div>

      {/* Analytics Statistics Readout Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Mean Density</span>
          <span className="text-lg font-bold text-neutral-200 font-mono">{stats.mean}</span>
        </div>
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Std Deviation</span>
          <span className="text-lg font-bold text-neutral-200 font-mono">{stats.stdDev}</span>
        </div>
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Anomaly Threshold</span>
          <span className="text-lg font-bold text-amber-400 font-mono">{Math.round(stats.threshold * 10) / 10}</span>
        </div>
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Spikes Detected</span>
          <span className="text-lg font-bold text-amber-500 font-mono">
            {dataPoints.filter((d) => d.value > stats.threshold).length}
          </span>
        </div>
      </div>
    </div>
  );
}
