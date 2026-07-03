import React, { useEffect, useRef } from 'react';
import { SlotRenderer } from '../../../../slot-engine/src/engine/SlotRenderer';
import { SlotConfig } from '../../../../slot-engine/src/engine/types';
import { DragonRealmConfig } from '../../../../slot-engine/src/themes/dragon-realm';

interface SlotMachineProps {
  config?: SlotConfig;
}

export const SlotMachine: React.FC<SlotMachineProps> = ({ config }) => {
  const activeConfig = config ?? DragonRealmConfig;
  const containerId = `slot-container-${activeConfig.id}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SlotRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any existing renderer before creating a new one
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }

    rendererRef.current = new SlotRenderer(containerId, activeConfig);

    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [activeConfig.id]);

  const jackpots = activeConfig.jackpots ?? { mini: 10, minor: 50, major: 250, grand: 1000 };

  return (
    <div className="w-full h-full min-h-[600px] relative bg-black rounded-xl overflow-hidden shadow-2xl border border-purple-500/30">
      <div id={containerId} ref={containerRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
        <div className="flex gap-2">
          <JackpotBadge label="MINI" value={jackpots.mini} color="bg-blue-500" />
          <JackpotBadge label="MINOR" value={jackpots.minor} color="bg-green-500" />
        </div>
        <div className="flex gap-2">
          <JackpotBadge label="MAJOR" value={jackpots.major} color="bg-purple-500" />
          <JackpotBadge label="GRAND" value={jackpots.grand} color="bg-red-500" />
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
