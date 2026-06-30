import { Trophy } from "lucide-react";
import { DerbyHorse, type RacerDef } from "./derby-horse";

export type RacerProgress = { racerId: number; progress: number; done: boolean };
export type CameraAngle = "side" | "front" | "aerial" | "finish";

const TRACK_LEN = 100;
const LANE_COUNT = 6;
/** Uniform vertical lane slots — every horse shares the same X at the gate */
const LANE_BOTTOMS = [2, 14, 26, 38, 50, 62];

function SkyAndHorizon() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-[#4A90C8] via-[#7EC8E8] 30% to-[#D4B896] 62%" />
      <div className="absolute top-[12%] left-0 right-0 h-10 bg-gradient-to-b from-white/25 to-transparent" />
    </>
  );
}

function CrowdSilhouette({ animated = false }: { animated?: boolean }) {
  return (
    <div className={`absolute bottom-[34%] left-0 right-0 h-10 opacity-35 pointer-events-none ${animated ? "derby-crowd-wave" : ""}`}
      style={{
        background: "repeating-linear-gradient(90deg, transparent 0 8px, #2a2a2a 8px 10px, transparent 10px 18px)",
        clipPath: "polygon(0 100%, 100% 100%, 100% 40%, 0 70%)",
      }} />
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
  const atGate = !racing && progress.every(p => p.progress < 1);
  const gateOpening = racing && progress.every(p => p.progress < 2);

  return (
    <div className="relative h-full w-full overflow-hidden derby-side-scene">
      <SkyAndHorizon />
      <CrowdSilhouette animated={racing} />

      {/* Distant hills */}
      <div className="absolute bottom-[36%] left-0 right-0 h-20 bg-[#5A8F45] opacity-45"
        style={{ clipPath: "polygon(0 100%, 12% 35%, 28% 65%, 48% 25%, 68% 55%, 88% 20%, 100% 45%, 100% 100%)" }} />

      {/* Grandstand */}
      <div className="absolute bottom-[34%] left-[4%] w-32 h-16 opacity-55 rounded-t-lg border border-white/10"
        style={{ background: "repeating-linear-gradient(90deg, #3a3a3a 0 8px, #555 8px 16px)" }}>
        <div className="absolute -top-3 left-2 right-2 h-3 bg-[#444] rounded-t" />
      </div>

      {/* Track surface — taller */}
      <div className="absolute bottom-0 left-0 right-0 h-[38%] bg-gradient-to-b from-[#C9A66B] via-[#A8844E] to-[#5C4028]" />
      {/* Lane stripes */}
      {LANE_BOTTOMS.map((b, i) => (
        <div key={i} className="absolute left-0 right-0 h-px bg-white/12" style={{ bottom: `${b + 10}%` }} />
      ))}
      {/* Inner rail */}
      <div className="absolute bottom-[24%] left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FFD700]/60 to-transparent shadow-sm" />
      {/* Outer rail posts */}
      <div className="absolute bottom-[22%] left-0 right-0 flex justify-between px-[2%] pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="w-0.5 h-3 bg-white/40 rounded-full" />
        ))}
      </div>

      <div className="absolute bottom-[8%] left-0 h-[28%] transition-none derby-track-scroll"
        style={{ transform: `translateX(-${cameraX}%)`, width: "240%" }}>
        {/* Track motion blur when racing */}
        {racing && <div className="absolute inset-0 derby-track-motion z-0 pointer-events-none" />}

        {/* Distance markers */}
        {[20, 40, 60, 80, 100].map(d => (
          <div key={d} className="absolute bottom-full mb-2 text-[10px] font-black text-white/75 uppercase tracking-wider drop-shadow"
            style={{ left: `${d}%` }}>{d}m</div>
        ))}

        {/* Finish post */}
        <div className="absolute right-[3%] bottom-0 flex flex-col items-center z-10">
          <div className="w-2 h-24 bg-white shadow-lg rounded-sm" />
          <div className="flex flex-col w-5 -ml-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
              <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
            ))}
          </div>
          <span className="text-[11px] font-black text-white uppercase tracking-widest drop-shadow mt-1">Finish</span>
        </div>

        {/* Starting gate — opens when race begins */}
        {(atGate || gateOpening) && (
          <div className={`absolute left-[0.5%] bottom-0 flex flex-col items-start z-20 ${gateOpening ? "derby-gate-open" : ""}`}>
            <div className="flex gap-px">
              {Array.from({ length: LANE_COUNT }, (_, i) => (
                <div
                  key={i}
                  className={`w-4 h-16 bg-gradient-to-b from-[#A0522D] to-[#5C3317] border border-[#FFD700]/50 rounded-t-sm shadow-inner derby-gate-door`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                />
              ))}
            </div>
            <span className="text-[9px] font-black text-white/90 uppercase tracking-widest mt-1 ml-1 drop-shadow">Start</span>
          </div>
        )}

        {racers.map((r, lane) => {
          const p = progress.find(x => x.racerId === r.id);
          const x = p?.progress ?? 0;
          const gallop = racing && !p?.done;
          const isWinner = showResult && winnerId === r.id;
          const isMyPick = r.id === selectedRacer;
          const gateX = 2.5;
          const left = atGate ? gateX : gateX + x;

          return (
            <div
              key={r.id}
              className="absolute flex items-end justify-center"
              style={{
                left: `${left}%`,
                bottom: `${LANE_BOTTOMS[lane]}%`,
                width: "7%",
                zIndex: 10 + lane,
              }}
            >
              <div className="relative flex flex-col items-center">
                {isMyPick && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-yellow-300 drop-shadow-[0_1px_3px_#000] whitespace-nowrap px-1.5 py-0.5 rounded bg-black/40 border border-yellow-400/40">
                    YOU
                  </span>
                )}
                <div className={`relative ${isMyPick ? "derby-pick-ring" : ""} ${isWinner ? "brightness-110" : ""} ${gallop ? "derby-horse-bob" : ""}`}>
                  <DerbyHorse r={r} gallop={gallop} scale={1} />
                  {gallop && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 derby-dust-puff rounded-full" />}
                </div>
                {isWinner && (
                  <Trophy className="absolute -top-3 -right-4 w-5 h-5 text-yellow-400 animate-bounce shrink-0 drop-shadow" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/25 via-transparent to-black/20" />
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
      <div className="absolute inset-x-[8%] bottom-0 top-[32%]"
        style={{
          background: "linear-gradient(180deg, #9B7B3A 0%, #6B4E2E 35%, #4A3520 100%)",
          clipPath: "polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)",
        }}
      />
      <div className="absolute inset-x-[20%] bottom-0 top-[40%] border-l border-r border-white/15"
        style={{ clipPath: "polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)" }} />

      <div className="absolute top-[34%] left-[20%] right-[20%] flex justify-between px-[1%] opacity-75">
        {racers.map(r => (
          <div key={r.id} className="w-1.5 h-10 bg-[#8B4513] border border-[#FFD700]/40 rounded-t-sm" />
        ))}
      </div>

      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="absolute left-0 right-0 h-px bg-white/12 derby-lane-dash"
          style={{ bottom: `${10 + i * 12}%`, animationDelay: `${i * 0.12}s` }} />
      ))}

      <div className="absolute inset-0">
        {racers.map((r, laneIdx) => {
          const p = progress.find(x => x.racerId === r.id);
          const prog = (p?.progress ?? 0) / TRACK_LEN;
          const gallop = racing && !p?.done;
          const isMyPick = r.id === selectedRacer;
          const atGate = prog < 0.03;
          const scale = atGate ? 0.68 : 0.68 + prog * 0.75;
          const bottom = atGate ? 8 : 8 + prog * 32;
          const left = 8 + laneIdx * 14;

          return (
            <div key={r.id} className="absolute flex flex-col items-center transition-none"
              style={{
                bottom: `${bottom}%`,
                left: `${left}%`,
                transform: `scale(${scale})`,
                zIndex: Math.round(prog * 100) + laneIdx,
                opacity: atGate ? 1 : 0.85 + prog * 0.15,
              }}>
              {isMyPick && (
                <span className="text-[7px] font-black text-yellow-300 mb-0.5 drop-shadow px-1 rounded bg-black/30 border border-yellow-400/30">YOU</span>
              )}
              <div className={gallop ? "derby-horse-bob" : ""}>
                <DerbyHorse r={r} gallop={gallop} view="front-chase" scale={1} />
              </div>
              <span className="text-[8px] font-mono font-bold text-white/80 mt-0.5">#{r.num}</span>
            </div>
          );
        })}
      </div>
      {racing && <div className="absolute inset-0 pointer-events-none derby-speed-lines opacity-20" />}
    </div>
  );
}

/** Point along an elliptical race track */
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
        <ellipse cx="50" cy="52" rx="44" ry="32" fill="none" stroke="#fff" strokeWidth="0.4" opacity="0.25" />
        <ellipse cx="50" cy="52" rx="40" ry="28" fill="url(#derby-dirt)" stroke="#6B4E2E" strokeWidth="0.6" />
        <ellipse cx="50" cy="52" rx="22" ry="14" fill="url(#derby-grass)" />
        <ellipse cx="50" cy="54" rx="8" ry="5" fill="#4A90A4" opacity="0.7" />
        {[0, 1, 2, 3, 4, 5].map(lane => {
          const rx = 40 - lane * 2.8;
          const ry = 28 - lane * 2;
          return (
            <ellipse key={lane} cx="50" cy="52" rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth="0.25" strokeDasharray="2 2" opacity="0.35" />
          );
        })}
        <rect x="8" y="48" width="3" height="8" fill="#fff" opacity="0.9" />
        {[0, 1, 2, 3].map(i => (
          <rect key={i} x="8" y={48 + i * 2} width="3" height="1" fill={i % 2 === 0 ? "#111" : "#fff"} />
        ))}
        <text x="6" y="46" fontSize="2.5" fill="#fff" fontWeight="bold" opacity="0.8">START</text>
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
              zIndex: 10 + lane,
            }}>
            <div style={{ transform: `rotate(${-pos.rot}deg)` }} className="relative flex flex-col items-center">
              {isMyPick && (
                <div className="text-[7px] font-black text-yellow-300 text-center mb-0.5 drop-shadow px-1 rounded bg-black/30">YOU</div>
              )}
              <div className={isMyPick ? "derby-pick-ring rounded-full" : ""}>
                <DerbyHorse r={r} gallop={gallop} view="top" scale={0.95} />
              </div>
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
      <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-b from-[#B8956A] to-[#5C4033]" />
      <div className="absolute bottom-[32%] left-0 right-0 flex justify-center">
        <div className="w-2 h-28 bg-white shadow-xl" />
        <div className="flex flex-col w-5 -ml-2">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
          ))}
        </div>
      </div>
      <div className="absolute bottom-[10%] left-0 right-0 flex items-end justify-center gap-4 px-4">
        {ordered.map((r, i) => (
          <div key={r.id} className="flex flex-col items-center" style={{ marginBottom: i * 8 }}>
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
