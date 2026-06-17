import React, { useEffect, useRef } from 'react';
import { SlotRenderer } from '../../../../slot-engine/src/engine/SlotRenderer';
import { DragonRealmConfig } from '../../../../slot-engine/src/themes/dragon-realm';

export const SlotMachine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SlotRenderer | null>(null);

  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
      rendererRef.current = new SlotRenderer(containerRef.current.id, DragonRealmConfig);
    }

    return () => {
      // Cleanup PixiJS application if necessary
    };
  }, []);

  return (
    <div className="w-full h-full min-h-[600px] relative bg-black rounded-xl overflow-hidden shadow-2xl border border-purple-500/30">
      <div id="slot-container" ref={containerRef} className="w-full h-full" />
      
      {/* Overlay UI for Jackpots - Cinematic Desktop Style */}
      <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
        <div className="flex gap-2">
          <JackpotBadge label="MINI" value={10.45} color="bg-blue-500" />
          <JackpotBadge label="MINOR" value={54.20} color="bg-green-500" />
        </div>
        <div className="flex gap-2">
          <JackpotBadge label="MAJOR" value={258.90} color="bg-purple-500" />
          <JackpotBadge label="GRAND" value={1240.00} color="bg-red-500" />
        </div>
      </div>
    </div>
  );
};

const JackpotBadge: React.FC<{ label: string, value: number, color: string }> = ({ label, value, color }) => (
  <div className={`${color} bg-opacity-20 border border-white/20 rounded px-3 py-1 flex flex-col items-center backdrop-blur-md shadow-lg`}>
    <span className="text-[10px] font-black text-white/70 tracking-tighter">{label}</span>
    <span className="text-sm font-mono font-bold text-white">${value.toLocaleString()}</span>
  </div>
);
