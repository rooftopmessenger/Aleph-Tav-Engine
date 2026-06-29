'use client';

import React, { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

export interface TopologyNode {
  id: string;
  osis_id: string;
  text: string;
  similarity: number;
}

export interface TopologyLink {
  source: string;
  target: string;
  value: number;
}

interface TopologyGraphProps {
  data: {
    nodes: TopologyNode[];
    links: TopologyLink[];
  };
}

export default function TopologyGraph({ data }: TopologyGraphProps) {
  const fgRef = useRef<any>(null);

  useEffect(() => {
    if (fgRef.current) {
      // Set link distance driven by cosine similarity (closer distance for higher similarity)
      fgRef.current.d3Force('link').distance((link: any) => {
        return (1 - link.value) * 120;
      });
      // Adjust charge strength
      fgRef.current.d3Force('charge').strength(-150);
    }
  }, [data]);

  return (
    <div className="w-full bg-[#0a0a0a] border border-zinc-900 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 min-h-[500px]">
      <div className="flex flex-col gap-1 border-b border-zinc-900 pb-3">
        <h3 className="text-sm font-black uppercase text-indigo-400 tracking-wider">Semantic 3D Topology Network</h3>
        <p className="text-[10px] text-neutral-500 italic">
          Nodes represent matches. Edges represent cosine similarities. Drag to rotate, scroll to zoom, click nodes to view scripture.
        </p>
      </div>

      <div className="relative w-full h-[450px] bg-[#020202] rounded-2xl overflow-hidden border border-zinc-900/60">
        <ForceGraph3D
          ref={fgRef}
          graphData={data}
          nodeLabel={(node: any) => `
            <div style="background: rgba(10,10,10,0.9); border: 1px solid #4f46e5; border-radius: 8px; padding: 10px; max-width: 250px; font-family: monospace; font-size: 11px;">
              <span style="color: #fbbf24; font-weight: bold;">${node.id}</span>
              <span style="color: #818cf8; font-weight: bold; margin-left: 8px;">(${node.similarity.toFixed(3)})</span>
              <p style="color: #d4d4d8; margin-top: 5px; white-space: normal; line-height: 1.4;">${node.text}</p>
            </div>
          `}
          nodeColor={(node: any) => {
            const sim = node.similarity;
            if (sim > 0.7) return '#f59e0b'; // amber-500
            if (sim > 0.6) return '#818cf8'; // indigo-400
            return '#312e81'; // indigo-900
          }}
          nodeVal={(node: any) => node.similarity * 8}
          linkColor={() => '#3f3f46'} // zinc-700
          linkWidth={(link: any) => (link.value - 0.4) * 4} // Thicker edges for higher similarities
          backgroundColor="#020202"
          showNavInfo={false}
        />
      </div>
    </div>
  );
}
