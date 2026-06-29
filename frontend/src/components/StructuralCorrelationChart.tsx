'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';

export interface StructureComparison {
  id: number;
  osis_id: string;
  object_name: string;
  measurement_type: string;
  physical_value: number;
  gematria_value: number;
  ratio: number;
  english_text: string;
}

interface StructuralCorrelationChartProps {
  data: StructureComparison[];
  title?: string;
  subtitle?: string;
}

export default function StructuralCorrelationChart({
  data,
  title = 'Temple Structural Correlation',
  subtitle = 'Correlation analysis between physical dimensions (cubits) and verse gematria.',
}: StructuralCorrelationChartProps) {
  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<{
    id: number;
    osis_id: string;
    object_name: string;
    measurement_type: string;
    physical_value: number;
    gematria_value: number;
    ratio: number;
    english_text: string;
    cx: number;
    cy: number;
  } | null>(null);

  // SVG dimensions
  const width = 800;
  const height = 450;
  const paddingTop = 40;
  const paddingBottom = 50;
  const paddingLeft = 60;
  const paddingRight = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Filter lists
  const booksList = useMemo(() => {
    const books = new Set<string>();
    data.forEach((d) => {
      const bookName = d.osis_id.startsWith('1Kgs') ? '1 Kings' : '2 Chronicles';
      books.add(bookName);
    });
    return Array.from(books);
  }, [data]);

  const typesList = useMemo(() => {
    const types = new Set<string>();
    data.forEach((d) => types.add(d.measurement_type));
    return Array.from(types);
  }, [data]);

  // Filtered data
  const filteredData = useMemo(() => {
    return data.filter((d) => {
      const bookName = d.osis_id.startsWith('1Kgs') ? '1 Kings' : '2 Chronicles';
      const matchesBook = selectedBook === 'all' || bookName === selectedBook;
      const matchesType = selectedType === 'all' || d.measurement_type === selectedType;
      return matchesBook && matchesType;
    });
  }, [data, selectedBook, selectedType]);

  // Range and Scales
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (filteredData.length === 0) {
      return { xMin: 0, xMax: 100, yMin: 0, yMax: 10000 };
    }
    const xValues = filteredData.map((d) => d.physical_value);
    const yValues = filteredData.map((d) => d.gematria_value);

    // Padding ranges so dots aren't clipped on the edges
    const rawXMin = Math.min(...xValues);
    const rawXMax = Math.max(...xValues);
    const rawYMin = Math.min(...yValues);
    const rawYMax = Math.max(...yValues);

    const xRange = rawXMax - rawXMin;
    const yRange = rawYMax - rawYMin;

    return {
      xMin: Math.max(0, rawXMin - (xRange * 0.1 || 5)),
      xMax: rawXMax + (xRange * 0.1 || 10),
      yMin: Math.max(0, rawYMin - (yRange * 0.1 || 500)),
      yMax: rawYMax + (yRange * 0.1 || 1000),
    };
  }, [filteredData]);

  // Mapping functions
  const getX = (xVal: number) => {
    const span = xMax - xMin;
    const pct = span === 0 ? 0.5 : (xVal - xMin) / span;
    return paddingLeft + pct * chartWidth;
  };

  const getY = (yVal: number) => {
    const span = yMax - yMin;
    const pct = span === 0 ? 0.5 : (yVal - yMin) / span;
    // SVG y=0 is at the top, so invert the percentage
    return paddingTop + (1 - pct) * chartHeight;
  };

  // Math Statistics: Pearson's r & Linear Regression
  const stats = useMemo(() => {
    const N = filteredData.length;
    if (N < 2) {
      return { r: 0, slope: 0, intercept: 0, rLabel: 'Insufficient Data' };
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;

    filteredData.forEach((d) => {
      const x = d.physical_value;
      const y = d.gematria_value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    });

    const num = N * sumXY - sumX * sumY;
    const den = Math.sqrt((N * sumXX - sumX * sumX) * (N * sumYY - sumY * sumY));
    const r = den === 0 ? 0 : num / den;

    const slopeNum = N * sumXY - sumX * sumY;
    const slopeDen = N * sumXX - sumX * sumX;
    const slope = slopeDen === 0 ? 0 : slopeNum / slopeDen;
    const intercept = (sumY - slope * sumX) / N;

    // Describe correlation strength
    const absR = Math.abs(r);
    let rLabel = '';
    if (absR >= 0.7) {
      rLabel = r > 0 ? 'Strong Positive' : 'Strong Negative';
    } else if (absR >= 0.4) {
      rLabel = r > 0 ? 'Moderate Positive' : 'Moderate Negative';
    } else if (absR >= 0.1) {
      rLabel = r > 0 ? 'Weak Positive' : 'Weak Negative';
    } else {
      rLabel = 'No Correlation';
    }

    return { r, slope, intercept, rLabel };
  }, [filteredData]);

  // Generate trend line coordinates
  const trendLine = useMemo(() => {
    if (filteredData.length < 2 || stats.slope === 0) return null;

    // Calculate y-values at edges of chart x-range
    const xStart = xMin;
    const xEnd = xMax;
    const yStart = stats.slope * xStart + stats.intercept;
    const yEnd = stats.slope * xEnd + stats.intercept;

    return {
      x1: getX(xStart),
      y1: getY(yStart),
      x2: getX(xEnd),
      y2: getY(yEnd),
    };
  }, [filteredData, xMin, xMax, stats, getY, getX]);

  // Average Ratio
  const averageRatio = useMemo(() => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((acc, d) => acc + d.ratio, 0);
    return sum / filteredData.length;
  }, [filteredData]);

  return (
    <div className="flex flex-col gap-5 w-full bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-2xl">
      {/* Header section */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-wide text-neutral-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></span>
            {title}
          </h2>
          <p className="text-xs text-neutral-500 max-w-xl">{subtitle}</p>
        </div>

        {/* Math indicators */}
        <div className="flex gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 px-3 py-1.5 rounded-lg flex flex-col items-center justify-center min-w-[80px]">
            <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Pearson r</span>
            <span className={`text-sm font-black ${Math.abs(stats.r) >= 0.5 ? 'text-emerald-400' : 'text-neutral-300'}`}>
              {filteredData.length >= 2 ? stats.r.toFixed(3) : 'N/A'}
            </span>
            <span className="text-[8px] text-neutral-500 mt-0.5 font-medium">{stats.rLabel}</span>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 px-3 py-1.5 rounded-lg flex flex-col items-center justify-center min-w-[100px]">
            <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Avg Ratio</span>
            <span className="text-sm font-black text-amber-400">
              {averageRatio.toFixed(1)}
            </span>
            <span className="text-[8px] text-neutral-500 mt-0.5 font-medium">Gematria/Cubit</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Book:</span>
          <select
            value={selectedBook}
            onChange={(e) => {
              setSelectedBook(e.target.value);
              setHoveredPoint(null);
            }}
            className="bg-zinc-950 border border-zinc-800 rounded-md text-xs px-2 py-1 text-neutral-300 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Books</option>
            {booksList.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Dimension:</span>
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setHoveredPoint(null);
            }}
            className="bg-zinc-950 border border-zinc-800 rounded-md text-xs px-2 py-1 text-neutral-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Dimensions</option>
            {typesList.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="text-[10px] font-medium text-neutral-500 ml-auto">
          Displaying <span className="text-neutral-300 font-bold">{filteredData.length}</span> of {data.length} records
        </div>
      </div>

      {/* SVG Canvas Container */}
      <div className="relative w-full overflow-hidden bg-zinc-950/60 border border-zinc-900 rounded-xl p-4">
        {filteredData.length === 0 ? (
          <div className="flex items-center justify-center h-[350px] text-xs text-neutral-500 font-semibold italic">
            No matching data points found for selection.
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
            {/* Grid & Axis Ticks (Y-Axis Gematria) */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const yVal = yMin + (yMax - yMin) * ratio;
              const y = getY(yVal);
              return (
                <g key={`y-grid-${ratio}`} className="opacity-25">
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#444444"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-neutral-500 text-[10px] font-mono font-bold"
                  >
                    {Math.round(yVal)}
                  </text>
                </g>
              );
            })}

            {/* Grid & Axis Ticks (X-Axis Cubits) */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const xVal = xMin + (xMax - xMin) * ratio;
              const x = getX(xVal);
              return (
                <g key={`x-grid-${ratio}`} className="opacity-25">
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={height - paddingBottom}
                    stroke="#444444"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={x}
                    y={height - paddingBottom + 16}
                    textAnchor="middle"
                    className="fill-neutral-500 text-[10px] font-mono font-bold"
                  >
                    {Math.round(xVal)}
                  </text>
                </g>
              );
            })}

            {/* X and Y Axis Titles */}
            <text
              x={paddingLeft - 50}
              y={paddingTop + chartHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90, ${paddingLeft - 50}, ${paddingTop + chartHeight / 2})`}
              className="fill-neutral-500 text-[9px] uppercase tracking-wider font-extrabold"
            >
              Cumulative Verse Gematria
            </text>

            <text
              x={paddingLeft + chartWidth / 2}
              y={height - paddingBottom + 35}
              textAnchor="middle"
              className="fill-neutral-500 text-[9px] uppercase tracking-wider font-extrabold"
            >
              Physical Dimension Value (Cubits)
            </text>

            {/* Trend / Regression Line */}
            {trendLine && (
              <line
                x1={trendLine.x1}
                y1={trendLine.y1}
                x2={trendLine.x2}
                y2={trendLine.y2}
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="6 3"
                className="opacity-70"
              />
            )}

            {/* Scatter Dots */}
            {filteredData.map((d, index) => {
              const cx = getX(d.physical_value);
              const cy = getY(d.gematria_value);
              const is1Kgs = d.osis_id.startsWith('1Kgs');
              const isHovered = hoveredPoint?.id === d.id;

              return (
                <circle
                  key={`dot-${d.id}-${index}`}
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 8 : 5}
                  className={`transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? 'fill-amber-400 stroke-zinc-950 stroke-2 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                      : is1Kgs
                      ? 'fill-indigo-500 stroke-zinc-950 stroke-1 hover:fill-indigo-400'
                      : 'fill-emerald-500 stroke-zinc-950 stroke-1 hover:fill-emerald-400'
                  }`}
                  onMouseEnter={() =>
                    setHoveredPoint({
                      ...d,
                      cx,
                      cy,
                    })
                  }
                />
              );
            })}
          </svg>
        )}

        {/* Premium Float Tooltip Card */}
        {hoveredPoint && (
          <div
            className="absolute z-20 w-80 bg-zinc-950 border border-zinc-800 rounded-xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.8)] animate-fadeIn pointer-events-none"
            style={{
              left: `${Math.min(hoveredPoint.cx + 15, width - 330)}px`,
              top: `${Math.min(hoveredPoint.cy - 70, height - 180)}px`,
            }}
          >
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-2">
              <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">
                {hoveredPoint.osis_id}
              </span>
              <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                {hoveredPoint.osis_id.startsWith('1Kgs') ? '1 Kings' : '2 Chronicles'}
              </span>
            </div>

            <div className="text-xs font-bold text-neutral-200 mb-1">
              {hoveredPoint.object_name}{' '}
              <span className="text-[10px] font-bold text-neutral-500 normal-case italic">
                ({hoveredPoint.measurement_type})
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-zinc-900/60 p-2 rounded-lg border border-zinc-900 mb-2">
              <div className="flex flex-col">
                <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Physical</span>
                <span className="text-xs font-bold text-neutral-300">
                  {hoveredPoint.physical_value} cubits
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Gematria</span>
                <span className="text-xs font-bold text-neutral-300">
                  {hoveredPoint.gematria_value}
                </span>
              </div>
              <div className="flex flex-col col-span-2 border-t border-zinc-950 pt-1.5 mt-0.5">
                <span className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider">Gematria / Cubit Ratio</span>
                <span className="text-xs font-black text-amber-400">
                  {hoveredPoint.ratio.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-neutral-400 italic line-clamp-3 leading-relaxed border-t border-zinc-850 pt-2">
              &ldquo;{hoveredPoint.english_text}&rdquo;
            </div>
          </div>
        )}
      </div>

      {/* Legend and stats summary card */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-1 border-t border-zinc-900 pt-4">
        {/* Legend */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
            1 Kings Dataset
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
            2 Chronicles Dataset
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
            <span className="border-t-2 border-dashed border-amber-500 w-6 h-0.5"></span>
            Linear Regression Trend Line
          </div>
        </div>

        {/* Formula notation */}
        {filteredData.length >= 2 && (
          <div className="text-[10px] font-mono text-neutral-500">
            Trend equation: <span className="text-neutral-300 font-bold">y = {stats.slope.toFixed(2)}x + {stats.intercept.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
