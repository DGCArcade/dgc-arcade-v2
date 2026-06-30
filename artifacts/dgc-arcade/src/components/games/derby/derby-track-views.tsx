import { Trophy } from "lucide-react";
import { DerbyHorse, type RacerDef } from "./derby-horse";

export type RacerProgress = { racerId: number; progress: number; done: boolean };
export type CameraAngle = "side" | "front" | "aerial" | "finish";

const TRACK_LEN = 100;

/** Point along an elliptical race track (0–1 = start to finish along back stretch + turn) */
function ovalPosition(t: number, lane: number): { x: number; y: number; rot: number } {
  const laneOffset = lane * 2.2;
  const a = 38 - laneOffset * 0.4;
  const b = 28 - laneOffset * 0.35;
  const cx = 50;
  const cy = 50;
  const angle = -Math.PI * 0.85 + t * Math.PI * 1.35;
  const x = cx + a * Math.cos(angle);
  const y = cy + b * Math.sin(angle);
  const rot = (Math.atan2(-a * Math.sin(angle), b * Math.cos(angle)) * 180) / Math.PI + 90;
  return { x, y, rot };
}

function SkyAndHorizon() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-[#5BA3D9] via-[#87CEEB] 35% to-[#C9A86C] 65%" />
      <div className="absolute top-[18%] left-0 right-0 h-8 bg-gradient-to-b from-white/20 to-transparent" />
    </>
  );
}

export function DerbySideView({
  racers,
  progress,
  cameraX,
  racing,
  selectedRacer,
  winnerId,
  showResult,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  cameraX: number;
  racing: boolean;
  selectedRacer: number | null;
  winnerId?: number;
  showResult: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden derby-side-scene">
      <SkyAndHorizon />
      {/* Distant hills */}
      <div className="absolute bottom-[32%] left-0 right-0 h-16 bg-[#6B8E4E] opacity-40" style={{ clipPath: "polygon(0 100%, 15% 40%, 35% 70%, 55% 30%, 75% 60%, 100% 20%, 100% 100%)" }} />
      {/* Grandstand */}
      <div className="absolute bottom-[30%] left-[8%] w-24 h-14 opacity-50 rounded-t"
        style={{ background: "repeating-linear-gradient(90deg, #444 0 6px, #666 6px 12px)" }} />
      {/* Track surface */}
      <div className="absolute bottom-0 left-0 right-0 h-[32%] bg-gradient-to-b from-[#B8956A] to-[#6B4E2E]" />
      <div className="absolute bottom-[28%] left-0 right-0 h-1 bg-white/60 shadow-sm" />
      {/* Inner rail */}
      <div className="absolute bottom-[22%] left-0 right-0 h-0.5 bg-[#FFD700]/50" />

      <div className="absolute bottom-[14%] left-0 h-[22%] transition-none derby-track-scroll"
        style={{ transform: `translateX(-${cameraX}%)`, width: "220%" }}>
        {/* Distance markers */}
        {[20, 40, 60, 80].map(d => (
          <div key={d} className="absolute bottom-full mb-1 text-[9px] font-black text-white/70 uppercase"
            style={{ left: `${d}%` }}>{d}m</div>
        ))}
        {/* Finish post */}
        <div className="absolute right-[4%] bottom-0 flex flex-col items-center z-10">
          <div className="w-1.5 h-20 bg-white shadow-lg" />
          <div className="flex flex-col w-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
            ))}
          </div>
          <span className="text-[10px] font-black text-white uppercase tracking-widest drop-shadow mt-1">Finish</span>
        </div>

        {/* Starting gate */}
        {!racing && progress.every(p => p.progress < 1) && (
          <div className="absolute left-[1%] bottom-0 flex flex-col items-center z-5 opacity-90">
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="w-3 h-14 bg-gradient-to-b from-[#8B4513] to-[#5C3317] border border-[#FFD700]/40 rounded-t-sm" />
              ))}
            </div>
            <span className="text-[8px] font-black text-white/80 uppercase tracking-widest mt-0.5">Gate</span>
          </div>
        )}

        {racers.map((r, lane) => {
          const p = progress.find(x => x.racerId === r.id);
          const x = p?.progress ?? 0;
          const gallop = racing && !p?.done;
          const isWinner = showResult && winnerId === r.id;
          const isMyPick = r.id === selectedRacer;
          return (
            <div key={r.id} className="absolute flex items-end gap-0.5"
              style={{ left: `${1.5 + x}%`, bottom: `${lane * 12 + 1}%`, zIndex: isMyPick ? 30 : 20 - lane }}>
              {isMyPick && (
                <span className="text-[8px] font-black uppercase text-yellow-300 drop-shadow-[0_1px_2px_#000] mb-12 whitespace-nowrap">YOU</span>
              )}
              <div className={isWinner ? "scale-110 brightness-110" : ""}>
                <DerbyHorse r={r} gallop={gallop} scale={0.95} />
              </div>
              {isWinner && <Trophy className="w-5 h-5 text-yellow-400 mb-10 animate-bounce shrink-0" />}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/30 via-transparent to-black/25" />
      {racing && <div className="absolute inset-0 pointer-events-none derby-speed-lines opacity-30" />}
    </div>
  );
}

export function DerbyFrontChaseView({
  racers,
  progress,
  racing,
  selectedRacer,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  racing: boolean;
  selectedRacer: number | null;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden derby-front-scene">
      <SkyAndHorizon />
      <div className="absolute inset-x-[10%] bottom-0 top-[35%]"
        style={{
          background: "linear-gradient(180deg, #8B6914 0%, #6B4E2E 40%, #5C4033 100%)",
          clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)",
        }}
      />
      <div className="absolute inset-x-[22%] bottom-0 top-[42%] border-l border-r border-white/20"
        style={{ clipPath: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)" }} />

      {/* Starting gate at far end when not racing far */}
      <div className="absolute top-[36%] left-[22%] right-[22%] flex justify-between px-[2%] opacity-80">
        {racers.map(r => (
          <div key={r.id} className="w-1 h-8 bg-[#8B4513] border border-[#FFD700]/30 rounded-t-sm" />
        ))}
      </div>

      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="absolute left-0 right-0 h-px bg-white/15 derby-lane-dash"
          style={{ bottom: `${12 + i * 14}%`, animationDelay: `${i * 0.15}s` }} />
      ))}

      <div className="absolute inset-0">
        {racers.map((r, laneIdx) => {
          const p = progress.find(x => x.racerId === r.id);
          const prog = (p?.progress ?? 0) / TRACK_LEN;
          const gallop = racing && !p?.done;
          const isMyPick = r.id === selectedRacer;
          const atGate = prog < 0.03;
          const scale = atGate ? 0.62 : 0.62 + prog * 0.88;
          const bottom = atGate ? 10 : 10 + prog * 30;
          const left = 10 + laneIdx * 13.5;
          return (
            <div key={r.id} className="absolute flex flex-col items-center transition-none"
              style={{
                bottom: `${bottom}%`,
                left: `${left}%`,
                transform: `scale(${scale})`,
                zIndex: Math.round(prog * 100) + laneIdx + (isMyPick ? 50 : 0),
                opacity: atGate ? 1 : 0.8 + prog * 0.2,
              }}>
              {isMyPick && <span className="text-[7px] font-black text-yellow-300 mb-0.5 drop-shadow">YOU</span>}
              <DerbyHorse r={r} gallop={gallop} view="front-chase" scale={1} />
              <span className="text-[8px] font-mono font-bold text-white/80 mt-0.5">#{r.num}</span>
            </div>
          );
        })}
      </div>
      {racing && <div className="absolute inset-0 pointer-events-none derby-speed-lines opacity-20" />}
    </div>
  );
}

export function DerbyAerialView({
  racers,
  progress,
  racing,
  selectedRacer,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  racing: boolean;
  selectedRacer: number | null;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden derby-aerial-scene bg-[#3D6B35]">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="derby-grass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4A7C42" />
            <stop offset="100%" stopColor="#2D5A28" />
          </linearGradient>
          <linearGradient id="derby-dirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C4A060" />
            <stop offset="100%" stopColor="#8B6914" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#derby-grass)" />
        {/* Outer track oval */}
        <ellipse cx="50" cy="52" rx="44" ry="32" fill="none" stroke="#fff" strokeWidth="0.4" opacity="0.25" />
        <ellipse cx="50" cy="52" rx="40" ry="28" fill="url(#derby-dirt)" stroke="#6B4E2E" strokeWidth="0.6" />
        <ellipse cx="50" cy="52" rx="22" ry="14" fill="url(#derby-grass)" />
        {/* Infield pond */}
        <ellipse cx="50" cy="54" rx="8" ry="5" fill="#4A90A4" opacity="0.7" />
        {/* Lane dividers */}
        {[0, 1, 2, 3, 4, 5].map(lane => {
          const rx = 40 - lane * 2.8;
          const ry = 28 - lane * 2;
          return (
            <ellipse key={lane} cx="50" cy="52" rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth="0.25" strokeDasharray="2 2" opacity="0.35" />
          );
        })}
        {/* Start / finish line on straight */}
        <rect x="8" y="48" width="3" height="8" fill="#fff" opacity="0.9" />
        {[0, 1, 2, 3].map(i => (
          <rect key={i} x="8" y={48 + i * 2} width="3" height="1" fill={i % 2 === 0 ? "#111" : "#fff"} />
        ))}
        <text x="6" y="46" fontSize="2.5" fill="#fff" fontWeight="bold" opacity="0.8">START</text>
        {/* Grandstand */}
        <rect x="62" y="18" width="28" height="10" rx="1" fill="#555" opacity="0.6" />
        <rect x="64" y="20" width="24" height="6" fill="#333" opacity="0.5" />
      </svg>

      {racers.map((r, lane) => {
        const p = progress.find(x => x.racerId === r.id);
        const t = (p?.progress ?? 0) / TRACK_LEN;
        const pos = ovalPosition(t, lane);
        const gallop = racing && !p?.done;
        const isMyPick = r.id === selectedRacer;
        return (
          <div key={r.id} className="absolute transition-none pointer-events-none"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`,
              zIndex: isMyPick ? 20 : 10 - lane,
            }}>
            <div style={{ transform: `rotate(${-pos.rot}deg)` }}>
              {isMyPick && <div className="text-[7px] font-black text-yellow-300 text-center mb-0.5 drop-shadow">YOU</div>}
              <DerbyHorse r={r} gallop={gallop} view="top" scale={0.9} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DerbyFinishView({
  racers,
  progress,
  winnerId,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  winnerId?: number;
}) {
  const ordered = [...racers].sort((a, b) => {
    const pa = progress.find(x => x.racerId === a.id)?.progress ?? 0;
    const pb = progress.find(x => x.racerId === b.id)?.progress ?? 0;
    return pb - pa;
  });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SkyAndHorizon />
      <div className="absolute bottom-0 left-0 right-0 h-[35%] bg-gradient-to-b from-[#B8956A] to-[#5C4033]" />
      <div className="absolute bottom-[30%] left-0 right-0 flex justify-center">
        <div className="w-2 h-24 bg-white shadow-xl" />
        <div className="flex flex-col w-5 -ml-2">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
          ))}
        </div>
      </div>
      <div className="absolute bottom-[12%] left-0 right-0 flex items-end justify-center gap-3 px-4">
        {ordered.map((r, i) => (
          <div key={r.id} className="flex flex-col items-center" style={{ marginBottom: i * 6 }}>
            {winnerId === r.id && <Trophy className="w-6 h-6 text-yellow-400 mb-1 animate-bounce" />}
            <span className="text-xs font-black text-white mb-1">#{i + 1}</span>
            <DerbyHorse r={r} gallop={false} scale={1.15 - i * 0.08} />
            <span className="text-[10px] font-bold text-white/90 mt-1">{r.name}</span>
          </div>
        ))}
      </div>
      <div className="absolute top-4 left-0 right-0 text-center">
        <span className="text-sm font-display font-black uppercase tracking-[0.3em] text-white drop-shadow-lg">Photo Finish</span>
      </div>
    </div>
  );
}

export { TRACK_LEN };
