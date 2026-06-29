'use client';

import React, { useState, useEffect, useMemo } from 'react';

export interface ChartDataPoint {
  label: string;
  gematriaCumulative: number;
  gematriaAverage: number;
  entropy: number;
  tooltipText: string;
  id: string | number;
}

interface CryptographicChartProps {
  data: ChartDataPoint[];
  onPointClick?: (id: string | number) => void;
  title?: string;
  subtitle?: string;
  showSubModeToggle?: boolean;
}

export default function CryptographicChart({
  data,
  onPointClick,
  title = 'Cryptographic Analysis',
  subtitle = 'Cryptographic density and complexity analysis.',
  showSubModeToggle = false,
}: CryptographicChartProps) {
  const [activeTab, setActiveTab] = useState<'gematria' | 'entropy'>('gematria');
  const [mode, setMode] = useState<'cumulative' | 'average'>('cumulative');
  const [showAnomalyList, setShowAnomalyList] = useState<boolean>(false);
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    value: number;
    text: string;
    x: number;
    y: number;
    id: string | number;
  } | null>(null);

  const isGematria = activeTab === 'gematria';

  // Reset anomaly list visibility on tab switch
  useEffect(() => {
    setShowAnomalyList(false);
  }, [activeTab]);

  // Map input data points based on the active tab and sub-mode
  const dataPoints = useMemo(() => {
    return data.map((d) => {
      let value = 0;
      if (activeTab === 'entropy') {
        value = d.entropy;
      } else {
        value = mode === 'cumulative' ? d.gematriaCumulative : d.gematriaAverage;
      }
      return {
        label: d.label,
        value,
        text: d.tooltipText,
        id: d.id,
      };
    });
  }, [data, activeTab, mode]);

  // Compute statistical metrics (Mean, Standard Deviation, Anomalies)
  const stats = useMemo(() => {
    if (dataPoints.length === 0) return { mean: 0, stdDev: 0, threshold: 0, lowThreshold: 0 };

    const values = dataPoints.map((d) => d.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / values.length;

    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    // Spike thresholds (+/- 1.5 standard deviations)
    const threshold = mean + 1.5 * stdDev;
    const lowThreshold = mean - 1.5 * stdDev;

    return {
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      threshold,
      lowThreshold,
    };
  }, [dataPoints]);

  // Extract anomalous points
  const anomalousPoints = useMemo(() => {
    return dataPoints.filter((d) =>
      isGematria
        ? d.value > stats.threshold
        : (d.value > stats.threshold || d.value < stats.lowThreshold)
    );
  }, [dataPoints, isGematria, stats]);

  // Determine if the hovered point is an anomaly
  const isHoveredAnomaly = useMemo(() => {
    if (!hoveredPoint) return false;
    return isGematria
      ? hoveredPoint.value > stats.threshold
      : (hoveredPoint.value > stats.threshold || hoveredPoint.value < stats.lowThreshold);
  }, [hoveredPoint, isGematria, stats]);

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
    const maxVal = Math.max(...dataPoints.map((d) => d.value), 1.0);
    return isGematria ? Math.ceil(maxVal * 1.15) : Math.ceil(maxVal * 1.05 * 10) / 10;
  }, [dataPoints, isGematria]);

  // X Coordinate calculation
  const getX = (index: number) => {
    if (dataPoints.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (dataPoints.length - 1)) * chartWidth;
  };

  // Y Coordinate calculation
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

  const handlePointClick = (id: string | number) => {
    if (onPointClick) {
      onPointClick(id);
    }
  };

  if (data.length === 0) {
    return (
      <div className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 backdrop-blur-md flex items-center justify-center min-h-[300px] shadow-2xl text-center">
        <p className="text-sm text-neutral-500 italic">No cryptographic data loaded.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-neutral-900/60 border border-neutral-850 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-6 shadow-2xl">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className={`text-sm font-bold uppercase tracking-wider ${isGematria ? 'text-amber-400' : 'text-indigo-400'} flex items-center gap-2`}>
            <svg className={`w-4 h-4 ${isGematria ? 'text-amber-500' : 'text-indigo-500'} animate-pulse`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {title}
          </h3>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>

        {/* Dynamic Controls Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Main Gematria vs Entropy Tab Selector */}
          <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-855 w-fit">
            <button
              onClick={() => setActiveTab('gematria')}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                isGematria
                  ? 'bg-amber-500 text-neutral-950 font-extrabold shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Gematria Density
            </button>
            <button
              onClick={() => setActiveTab('entropy')}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'entropy'
                  ? 'bg-indigo-500 text-neutral-950 font-extrabold shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Entropy Anomalies
            </button>
          </div>

          {/* Sub-mode toggle for Gematria only */}
          {isGematria && showSubModeToggle && (
            <div className="flex bg-neutral-955 p-1 rounded-lg border border-neutral-850/80 w-fit">
              <button
                onClick={() => setMode('cumulative')}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  mode === 'cumulative'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-neutral-500 hover:text-neutral-300 border border-transparent'
                }`}
              >
                Cumulative
              </button>
              <button
                onClick={() => setMode('average')}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  mode === 'average'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-neutral-500 hover:text-neutral-300 border border-transparent'
                }`}
              >
                Average
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden bg-neutral-950/40 border border-neutral-900 rounded-xl p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const val = maxValue * ratio;
            const y = getY(val);
            return (
              <g key={ratio} className="opacity-20">
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#525252" strokeWidth={1} strokeDasharray="4 4" />
                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" className="fill-neutral-500 text-[10px] font-mono">
                  {isGematria ? Math.round(val) : val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Background Vertical Bands for Anomalies */}
          {dataPoints.map((d, i) => {
            const isAnomaly = isGematria
              ? d.value > stats.threshold
              : (d.value > stats.threshold || d.value < stats.lowThreshold);

            if (!isAnomaly) return null;

            const step = dataPoints.length > 1 ? chartWidth / (dataPoints.length - 1) : 40;
            const bandWidth = Math.max(16, step * 0.85);
            const x = getX(i) - bandWidth / 2;

            return (
              <rect
                key={`band-${d.id}-${i}`}
                x={x}
                y={paddingTop}
                width={bandWidth}
                height={chartHeight}
                className="fill-rose-500/10 pointer-events-none"
              />
            );
          })}

          {/* Anomaly Detection Threshold Lines */}
          {isGematria ? (
            stats.threshold < maxValue && (
              <g className="opacity-30">
                <line x1={paddingLeft} y1={getY(stats.threshold)} x2={width - paddingRight} y2={getY(stats.threshold)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" />
                <text x={width - paddingRight - 8} y={getY(stats.threshold) - 6} textAnchor="end" className="fill-amber-400 text-[9px] font-bold tracking-wide uppercase font-mono">
                  Anomaly Threshold (+1.5 SD)
                </text>
              </g>
            )
          ) : (
            <>
              {stats.threshold < maxValue && (
                <g className="opacity-35">
                  <line x1={paddingLeft} y1={getY(stats.threshold)} x2={width - paddingRight} y2={getY(stats.threshold)} stroke="#818cf8" strokeWidth={1.5} strokeDasharray="6 3" />
                  <text x={width - paddingRight - 8} y={getY(stats.threshold) - 6} textAnchor="end" className="fill-indigo-400 text-[9px] font-bold tracking-wide uppercase font-mono">
                    High Spikes (+1.5 SD)
                  </text>
                </g>
              )}
              {stats.lowThreshold > 0 && stats.lowThreshold < maxValue && (
                <g className="opacity-35">
                  <line x1={paddingLeft} y1={getY(stats.lowThreshold)} x2={width - paddingRight} y2={getY(stats.lowThreshold)} stroke="#818cf8" strokeWidth={1.5} strokeDasharray="6 3" />
                  <text x={width - paddingRight - 8} y={getY(stats.lowThreshold) + 12} textAnchor="end" className="fill-indigo-400 text-[9px] font-bold tracking-wide uppercase font-mono">
                    Low Spikes (-1.5 SD)
                  </text>
                </g>
              )}
            </>
          )}

          {/* Area Fill */}
          <path d={areaPath} className={`${isGematria ? 'fill-amber-500/5' : 'fill-indigo-500/5'} stroke-none`} />

          {/* Line Path */}
          <path d={linePath} className={`fill-none ${isGematria ? 'stroke-amber-500' : 'stroke-indigo-500'}`} strokeWidth={2} />

          {/* Interactive Data Points (Circles) */}
          {dataPoints.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.value);
            const isAnomaly = isGematria
              ? d.value > stats.threshold
              : (d.value > stats.threshold || d.value < stats.lowThreshold);

            return (
              <g key={`${d.id}-${i}`}>
                {isAnomaly && (
                  <circle cx={cx} cy={cy} r={8} className="fill-none stroke-rose-500/50 animate-ping" strokeWidth={1.5} />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isAnomaly ? 5.5 : 4}
                  onClick={() => handlePointClick(d.id)}
                  onMouseEnter={() => {
                    setHoveredPoint({
                      label: d.label,
                      value: d.value,
                      text: d.text,
                      x: cx,
                      y: cy,
                      id: d.id,
                    });
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className={`cursor-pointer transition-all duration-200 hover:r-7 hover:stroke-white hover:stroke-2
                    ${isAnomaly 
                      ? 'fill-rose-500 stroke-rose-400 stroke-[2px]' 
                      : (isGematria ? 'fill-neutral-900 stroke-amber-500 stroke-1.5' : 'fill-neutral-900 stroke-indigo-500 stroke-1.5')
                    }
                  `}
                />
              </g>
            );
          })}

          {/* Bottom X-Axis labels */}
          {dataPoints.map((d, i) => {
            // Render labels: first, last, or every 5 items to avoid crowded text
            if (i === 0 || i === dataPoints.length - 1 || i % 5 === 0) {
              return (
                <text key={i} x={getX(i)} y={height - paddingBottom + 18} textAnchor="middle" className="fill-neutral-600 text-[10px] font-mono">
                  {d.label}
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
            className={`z-30 bg-neutral-950/95 border ${isHoveredAnomaly ? 'border-rose-500/50' : (isGematria ? 'border-amber-500/40' : 'border-indigo-500/40')} rounded-xl p-3 shadow-2xl flex flex-col gap-1.5 w-64 pointer-events-none animate-fadeIn backdrop-blur-md`}
          >
            <div className="flex justify-between items-center border-b border-neutral-900 pb-1.5">
              <span className={`text-[10px] font-bold ${isHoveredAnomaly ? 'text-rose-500' : (isGematria ? 'text-amber-500' : 'text-indigo-400')} font-mono tracking-wider`}>
                {hoveredPoint.label}
              </span>
              <span className={`text-[10px] font-mono font-bold ${isHoveredAnomaly ? 'text-rose-400 border-rose-950/45 bg-rose-950/20' : 'text-neutral-400 border-neutral-850 bg-neutral-900'} px-1.5 py-0.5 rounded border`}>
                {isGematria ? `Gematria: ${hoveredPoint.value}` : `Entropy: ${hoveredPoint.value.toFixed(3)}`}
              </span>
            </div>
            {isHoveredAnomaly && (
              <div className="flex items-center gap-1.5 py-0.5">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-rose-500">
                  ⚠️ ANOMALY DETECTED
                </span>
              </div>
            )}
            {hoveredPoint.text && (
              <p className="text-[11px] text-neutral-300 leading-relaxed italic line-clamp-2">
                "{hoveredPoint.text}"
              </p>
            )}
            <div className="text-[8px] text-neutral-550 font-bold uppercase tracking-wider text-right">
              Click node to navigate/select
            </div>
          </div>
        )}
      </div>

      {/* Analytics Statistics Readout Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">
            {isGematria ? 'Mean Density' : 'Mean Entropy'}
          </span>
          <span className="text-lg font-bold text-neutral-200 font-mono">
            {isGematria ? stats.mean : stats.mean.toFixed(3)}
          </span>
        </div>
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">Std Deviation</span>
          <span className="text-lg font-bold text-neutral-200 font-mono">
            {isGematria ? stats.stdDev : stats.stdDev.toFixed(3)}
          </span>
        </div>
        <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1">
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">
            {isGematria ? 'Anomaly Threshold' : '±1.5 SD Range'}
          </span>
          <span className={`text-sm font-bold ${isGematria ? 'text-amber-400 text-lg' : 'text-indigo-400'} font-mono`}>
            {isGematria 
              ? (Math.round(stats.threshold * 10) / 10).toFixed(1)
              : `[${Math.max(0, stats.lowThreshold).toFixed(2)}, ${stats.threshold.toFixed(2)}]`
            }
          </span>
        </div>
        <div
          onClick={() => setShowAnomalyList(!showAnomalyList)}
          className={`bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1 cursor-pointer hover:bg-neutral-800/50 transition-all select-none duration-250 ${showAnomalyList ? 'ring-1 ring-rose-500/30 bg-neutral-900/60' : ''}`}
        >
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>{isGematria ? 'Spikes Detected' : 'Anomalies Detected'}</span>
            <span className="text-[8px] text-neutral-600 font-mono tracking-widest uppercase">
              {showAnomalyList ? 'Hide' : 'Show'}
            </span>
          </span>
          <span className={`text-lg font-bold ${isGematria ? 'text-amber-500' : 'text-indigo-500'} font-mono`}>
            {anomalousPoints.length}
          </span>
          {showAnomalyList && (
            <div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-y-auto pr-1">
              {anomalousPoints.length === 0 ? (
                <span className="text-[9px] text-neutral-600 italic">No anomalies.</span>
              ) : (
                anomalousPoints.map((d, index) => (
                  <button
                    key={`${d.id}-${index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePointClick(d.id);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer hover:scale-105 active:scale-95
                      ${isGematria
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                      }
                    `}
                  >
                    {d.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
