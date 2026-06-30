import { Trophy } from "lucide-react";
import { DerbyHorse, HorseSilkBadge, type RacerDef } from "./derby-horse";
import { DerbyRaceHUD, DerbyLaneRankBadge } from "./derby-race-hud";

export type RacerProgress = { racerId: number; progress: number; done: boolean };
export type CameraAngle = "side" | "front" | "aerial" | "finish";

const TRACK_LEN = 100;
const LANE_COUNT = 6;
/** Uniform vertical lane slots — every horse shares the same X at the gate */
const LANE_BOTTOMS = [2, 14, 26, 38, 50, 62];
const LANE_BOTTOMS_MOBILE = [4, 16, 28, 40, 52, 64];
/** Evenly spaced chase-camera lane columns */
const CHASE_LANE_LEFT = [4, 19, 34, 49, 64, 79];
const CHASE_LANE_LEFT_DESKTOP = [7, 21, 35, 49, 63, 77];

function HorseRacerLabel({
  r,
  isMyPick,
  compact,
}: {
  r: RacerDef;
  isMyPick: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-0.5 mb-0.5 ${compact ? "scale-90" : ""}`}>
      <HorseSilkBadge r={r} size={compact ? "xs" : "sm"} highlight={isMyPick} />
      {!compact && (
        <span className="text-[7px] font-bold text-white/90 drop-shadow-[0_1px_2px_#000] max-w-[36px] truncate">
          {r.name}
        </span>
      )}
      {isMyPick && (
        <span className="text-[6px] font-black uppercase text-yellow-300 bg-black/50 px-1 rounded border border-yellow-400/50">
          YOU
        </span>
      )}
    </div>
  );
}

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
  compact = false,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  cameraX: number;
  racing: boolean;
  selectedRacer: number | null;
  winnerId?: number;
  showResult: boolean;
  /** Mobile/narrow viewport — taller lanes, visible labels, gate below horses */
  compact?: boolean;
}) {
  const atGate = !racing && progress.every(p => p.progress < 1);
  const gateOpening = racing && progress.every(p => p.progress < 2);
  const laneBottoms = compact ? LANE_BOTTOMS_MOBILE : LANE_BOTTOMS;
  const horseScale = compact ? 0.82 : 1;

  return (
    <div className="relative h-full w-full overflow-hidden derby-side-scene">
      <SkyAndHorizon />
      <CrowdSilhouette animated={racing} />

      {/* Mobile: lineup legend so players know their horse before the gate opens */}
      {compact && atGate && selectedRacer && (
        <div className="absolute top-1 left-1 right-1 z-30 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-black/55 border border-white/10 backdrop-blur-sm">
          <span className="text-[8px] font-bold uppercase text-white/60 shrink-0">Your pick</span>
          {(() => {
            const pick = racers.find(x => x.id === selectedRacer);
            return pick ? (
              <>
                <HorseSilkBadge r={pick} size="sm" highlight />
                <span className="text-[10px] font-black text-white truncate">{pick.name}</span>
                <span className="text-[8px] text-white/50">Lane {pick.id}</span>
              </>
            ) : null;
          })()}
        </div>
      )}

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
      {laneBottoms.map((b, i) => (
        <div key={i} className="absolute left-0 right-0 h-px bg-white/12" style={{ bottom: `${b + 8}%` }} />
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
          {racing && progress.some(p => p.progress > TRACK_LEN * 0.82) && (
            <div className="absolute inset-0 -left-6 -right-6 derby-finish-flash rounded-sm" />
          )}
          <div className="w-2 h-24 bg-white shadow-lg rounded-sm" />
          <div className="flex flex-col w-5 -ml-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
              <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
            ))}
          </div>
          <span className="text-[11px] font-black text-white uppercase tracking-widest drop-shadow mt-1">Finish</span>
        </div>

        {/* Starting gate — stall doors at leg height; horses render in front */}
        {(atGate || gateOpening) && (
          <div className={`absolute left-[0.5%] bottom-0 flex flex-col items-start z-[8] pointer-events-none ${gateOpening ? "derby-gate-open" : ""}`}>
            {gateOpening && (
              <div className="absolute -right-2 bottom-[20%] w-28 h-10 derby-gate-dust" />
            )}
            <div className="flex gap-px">
              {Array.from({ length: LANE_COUNT }, (_, i) => (
                <div
                  key={i}
                  className={`${compact ? "w-3 h-10" : "w-4 h-12"} bg-gradient-to-b from-[#A0522D] to-[#5C3317] border border-[#FFD700]/50 rounded-t-sm shadow-inner derby-gate-door opacity-90`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                />
              ))}
            </div>
            <span className="text-[8px] font-black text-white/80 uppercase tracking-widest mt-0.5 ml-1 drop-shadow">Start</span>
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
                bottom: `${laneBottoms[lane]}%`,
                width: compact ? "9%" : "7%",
                zIndex: 12 + lane,
              }}
            >
              <div className="relative flex flex-col items-center">
                <HorseRacerLabel r={r} isMyPick={isMyPick} compact={compact} />
                <div className={`relative derby-horse-rig ${isMyPick ? "derby-pick-ring" : ""} ${isWinner ? "brightness-110" : ""} ${
                  gallop ? "derby-horse-bob derby-horse-lean derby-horse-stride" : ""
                }`}>
                  <DerbyHorse r={r} gallop={gallop} scale={horseScale} showBadge={false} />
                  {gallop && (
                    <>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-2.5 derby-dust-puff rounded-full" />
                      <div className="absolute top-1/2 -left-3 w-6 h-4 derby-horse-trail rounded-full opacity-60" />
                    </>
                  )}
                </div>
                {isWinner && (
                  <Trophy className="absolute -top-1 -right-3 w-4 h-4 text-yellow-400 animate-bounce shrink-0 drop-shadow" />
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
  compact = false,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  racing: boolean;
  selectedRacer: number | null;
  compact?: boolean;
}) {
  const laneLefts = compact ? CHASE_LANE_LEFT : CHASE_LANE_LEFT_DESKTOP;

  const rankMap = new Map<number, number>();
  if (racing) {
    [...racers]
      .map(r => ({ id: r.id, prog: progress.find(p => p.racerId === r.id)?.progress ?? 0 }))
      .sort((a, b) => b.prog - a.prog)
      .forEach((x, i) => rankMap.set(x.id, i + 1));
  }

  const gateBottom = compact ? 12 : 8;
  const gateScale = compact ? 0.5 : 0.65;
  const horseScale = compact ? 0.72 : 1;

  return (
    <div className="relative h-full w-full overflow-hidden derby-front-scene">
      <DerbyRaceHUD racers={racers} progress={progress} selectedRacer={selectedRacer} racing={racing && compact} />
      <SkyAndHorizon />
      <div className="absolute inset-x-[4%] bottom-0 top-[30%] derby-chase-track"
        style={{
          background: "linear-gradient(180deg, #9B7B3A 0%, #6B4E2E 35%, #4A3520 100%)",
          clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
        }}
      />

      {/* Lane guides — visible columns so each horse has its own lane */}
      {laneLefts.map((left, i) => (
        <div
          key={i}
          className="absolute top-[32%] bottom-0 w-px bg-white/10 pointer-events-none"
          style={{ left: `${left + 4}%` }}
        />
      ))}

      <div className="absolute top-[30%] left-[4%] right-[4%] flex justify-between px-[1%] opacity-60">
        {racers.map((r, i) => (
          <div key={r.id} className="flex flex-col items-center" style={{ width: `${100 / 6}%` }}>
            <HorseSilkBadge r={r} size="xs" highlight={r.id === selectedRacer} />
            <div className="w-1 h-8 mt-0.5 bg-[#8B4513] border border-[#FFD700]/30 rounded-t-sm" />
          </div>
        ))}
      </div>

      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="absolute left-0 right-0 h-px bg-white/10 derby-lane-dash"
          style={{ bottom: `${8 + i * 11}%`, animationDelay: `${i * 0.12}s` }} />
      ))}

      <div className="absolute inset-0">
        {racers.map((r, laneIdx) => {
          const p = progress.find(x => x.racerId === r.id);
          const prog = (p?.progress ?? 0) / TRACK_LEN;
          const gallop = racing && !p?.done;
          const isMyPick = r.id === selectedRacer;
          const atGate = prog < 0.02;
          const rank = rankMap.get(r.id) ?? 0;
          const isLeader = rank === 1 && racing;
          const scale = atGate ? gateScale : gateScale + prog * (compact ? 0.42 : 0.55);
          const bottom = atGate ? gateBottom : gateBottom + prog * (compact ? 52 : 38);
          const left = laneLefts[laneIdx];

          return (
            <div
              key={r.id}
              className="absolute flex flex-col items-center transition-none derby-chase-horse"
              style={{
                bottom: `${bottom}%`,
                left: `${left}%`,
                width: compact ? "14%" : "12%",
                transform: `scale(${scale})`,
                zIndex: Math.round(prog * 200) + laneIdx + (isMyPick ? 50 : 0),
                opacity: atGate ? 1 : 0.88 + prog * 0.12,
              }}
            >
              <div className="relative">
                {racing && rank > 0 && <DerbyLaneRankBadge rank={rank} isLeader={isLeader} />}
                <HorseRacerLabel r={r} isMyPick={isMyPick} compact />
                <div className={`derby-horse-rig ${gallop ? "derby-horse-bob derby-horse-lean derby-horse-stride" : ""} ${isMyPick ? "derby-pick-ring rounded-md" : ""}`}>
                  <DerbyHorse r={r} gallop={gallop} view="front-chase" scale={horseScale} />
                </div>
                {gallop && (
                  <>
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-2 derby-dust-puff rounded-full" />
                    <div className="absolute top-1/2 -left-2 w-5 h-3 derby-horse-trail rounded-full opacity-50" />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {racing && <div className="absolute inset-0 pointer-events-none derby-speed-lines opacity-25" />}
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
  compact = false,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  racing: boolean;
  selectedRacer: number | null;
  compact?: boolean;
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
              <HorseSilkBadge r={r} size="xs" highlight={isMyPick} />
              <div className={isMyPick ? "derby-pick-ring rounded-full" : ""}>
                <DerbyHorse r={r} gallop={gallop} view="top" scale={compact ? 0.8 : 0.95} />
              </div>
              {compact && (
                <span className="text-[6px] font-bold text-white drop-shadow mt-0.5">{r.num}</span>
              )}
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
