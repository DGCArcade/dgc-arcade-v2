import { Trophy } from "lucide-react";
import { DerbyHorse, HorseSilkBadge, type RacerDef } from "./derby-horse";
import { DerbyRaceHUD, DerbyLaneRankBadge } from "./derby-race-hud";
import {
  DerbyBroadcastOverlay,
  DerbyConfetti,
  DerbyLaneNumber,
  DerbyYourPickBanner,
  getLeaderProgress,
  getRacePhase,
  type RacePhase,
} from "./derby-broadcast";

export type RacerProgress = { racerId: number; progress: number; done: boolean };
export type CameraAngle = "side" | "front" | "aerial" | "finish";

const TRACK_LEN = 100;
const LANE_COUNT = 6;

function HorseRacerLabel({
  r,
  isMyPick,
  compact,
  showName = true,
}: {
  r: RacerDef;
  isMyPick: boolean;
  compact?: boolean;
  showName?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 mb-0.5 ${compact ? "scale-90 origin-bottom" : ""}`}>
      <HorseSilkBadge r={r} size={compact ? "xs" : "sm"} highlight={isMyPick} />
      {showName && !compact && (
        <span className="text-[8px] font-bold text-white/95 drop-shadow-[0_1px_2px_#000] max-w-[44px] truncate">
          {r.name}
        </span>
      )}
      {isMyPick && (
        <span className="text-[6px] font-black uppercase text-yellow-300 bg-black/60 px-1 rounded border border-yellow-400/50 shrink-0">
          YOU
        </span>
      )}
    </div>
  );
}

function SkyAndHorizon() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-[#3d7ab5] via-[#6eb5d8] 28% to-[#d4b896] 58%" />
      <div className="absolute top-[10%] left-0 right-0 h-12 bg-gradient-to-b from-white/30 to-transparent" />
      <div className="absolute top-[18%] left-[10%] w-16 h-5 rounded-full bg-white/20 blur-md" />
      <div className="absolute top-[14%] right-[18%] w-24 h-7 rounded-full bg-white/15 blur-md" />
    </>
  );
}

function CrowdSilhouette({ animated = false }: { animated?: boolean }) {
  return (
    <div
      className={`absolute bottom-[42%] left-0 right-0 h-12 opacity-40 pointer-events-none ${animated ? "derby-crowd-wave" : ""}`}
      style={{
        background:
          "repeating-linear-gradient(90deg, transparent 0 6px, #1a1a1a 6px 8px, transparent 8px 14px)",
        clipPath: "polygon(0 100%, 100% 100%, 100% 35%, 0 65%)",
      }}
    />
  );
}

function HorseRig({
  r,
  gallop,
  scale,
  view,
  isMyPick,
  isWinner,
}: {
  r: RacerDef;
  gallop: boolean;
  scale: number;
  view?: "side" | "front-chase" | "top";
  isMyPick: boolean;
  isWinner: boolean;
}) {
  return (
    <div
      className={`relative derby-horse-rig ${isMyPick ? "derby-pick-ring" : ""} ${isWinner ? "brightness-115 derby-winner-glow" : ""} ${
        gallop ? "derby-horse-bob derby-horse-lean derby-horse-stride" : ""
      }`}
    >
      <DerbyHorse r={r} gallop={gallop} scale={scale} view={view} showBadge={false} />
      {gallop && (
        <>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-2.5 derby-dust-puff rounded-full" />
          <div className="absolute top-1/2 -left-3 w-7 h-4 derby-horse-trail rounded-full opacity-60" />
        </>
      )}
    </div>
  );
}

type ViewBaseProps = {
  racers: RacerDef[];
  progress: RacerProgress[];
  racing: boolean;
  selectedRacer: number | null;
  compact?: boolean;
  phase?: RacePhase;
  camera?: CameraAngle;
};

export function DerbySideView({
  racers,
  progress,
  cameraX,
  racing,
  selectedRacer,
  winnerId,
  showResult,
  compact = false,
  phase,
  camera = "side",
}: ViewBaseProps & {
  cameraX: number;
  winnerId?: number;
  showResult: boolean;
}) {
  const atGate = !racing && progress.every(p => p.progress < 1);
  const gateOpening = racing && progress.every(p => p.progress < 2);
  const horseScale = compact ? 0.68 : 0.88;
  const leaderProg = getLeaderProgress(progress);
  const racePhase = phase ?? getRacePhase(leaderProg, racing, progress.every(p => p.done));
  const leader = racers.find(r => {
    const p = progress.find(x => x.racerId === r.id);
    return p && p.progress === leaderProg;
  });
  const pick = selectedRacer ? racers.find(r => r.id === selectedRacer) : undefined;

  return (
    <div className="relative h-full w-full overflow-hidden derby-side-scene">
      <SkyAndHorizon />
      <CrowdSilhouette animated={racing} />

      <DerbyBroadcastOverlay
        phase={racePhase}
        camera={camera}
        racing={racing}
        leaderName={leader?.name}
        leaderNum={leader?.num}
        leaderSilk={leader?.silk}
        compact={compact}
      />
      <DerbyRaceHUD
        racers={racers}
        progress={progress}
        selectedRacer={selectedRacer}
        racing={racing}
        compact={compact}
      />

      {pick && atGate && <DerbyYourPickBanner pick={pick} compact={compact} />}

      <div className="absolute bottom-[40%] left-0 right-0 h-16 bg-[#5A8F45] opacity-50"
        style={{ clipPath: "polygon(0 100%, 15% 40%, 35% 70%, 55% 30%, 75% 60%, 100% 25%, 100% 100%)" }} />

      <div className="absolute bottom-[38%] left-[3%] w-28 h-14 opacity-50 rounded-t-lg border border-white/10"
        style={{ background: "repeating-linear-gradient(90deg, #333 0 6px, #555 6px 12px)" }} />

      {/* Dirt track */}
      <div className="absolute bottom-0 left-0 right-0 h-[42%] bg-gradient-to-b from-[#c9a66b] via-[#a8844e] to-[#5c4028]" />
      <div className="absolute bottom-[22%] left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#ffd700]/70 to-transparent" />

      {/* Scrolling track + lane grid */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[46%] derby-track-scroll overflow-hidden"
        style={{ transform: `translateX(-${cameraX}%)`, width: "260%" }}
      >
        {racing && <div className="absolute inset-0 derby-track-motion z-0 pointer-events-none" />}

        {[25, 50, 75, 100].map(d => (
          <div
            key={d}
            className="absolute top-2 text-[9px] sm:text-[10px] font-black text-white/80 uppercase tracking-wider drop-shadow z-10"
            style={{ left: `${d}%` }}
          >
            {d}m
          </div>
        ))}

        {/* Finish */}
        <div className="absolute right-[2%] top-0 bottom-0 flex flex-col items-center justify-end z-20 pb-1">
          {racing && leaderProg > TRACK_LEN * 0.8 && (
            <div className="absolute inset-0 -inset-x-4 derby-finish-flash rounded-sm" />
          )}
          <div className="w-2 h-20 sm:h-24 bg-white shadow-lg rounded-sm" />
          <div className="flex flex-col w-4 -ml-0.5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-2" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
            ))}
          </div>
          <span className="text-[9px] font-black text-white uppercase tracking-widest drop-shadow mt-0.5">Finish</span>
        </div>

        {/* Gate */}
        {(atGate || gateOpening) && (
          <div
            className={`absolute left-[1%] top-0 bottom-0 flex flex-col justify-end z-[15] pointer-events-none pb-1 ${gateOpening ? "derby-gate-open" : ""}`}
          >
            {gateOpening && <div className="absolute left-8 bottom-[30%] w-32 h-12 derby-gate-dust" />}
            <div className="flex gap-0.5 items-end h-[88%]">
              {Array.from({ length: LANE_COUNT }, (_, i) => (
                <div
                  key={i}
                  className={`${compact ? "w-2.5" : "w-3.5"} flex-1 max-w-[14px] bg-gradient-to-b from-[#a0522d] to-[#5c3317] border border-[#ffd700]/50 rounded-t-sm shadow-inner derby-gate-door opacity-90`}
                  style={{ height: `${72 - i * 4}%`, animationDelay: `${i * 0.05}s` }}
                />
              ))}
            </div>
            <span className="text-[7px] font-black text-white/85 uppercase tracking-widest mt-0.5 ml-1 drop-shadow">Start</span>
          </div>
        )}

        {/* Six clearly separated lane rows */}
        <div className="absolute inset-0 flex flex-col pt-6 pb-1 z-10">
          {racers.map((r, lane) => {
            const p = progress.find(x => x.racerId === r.id);
            const x = p?.progress ?? 0;
            const gallop = racing && !p?.done;
            const isWinner = showResult && winnerId === r.id;
            const isMyPick = r.id === selectedRacer;
            const gateX = 4;
            const left = atGate ? gateX : gateX + x * 0.92;

            return (
              <div
                key={r.id}
                className={`derby-lane-row flex-1 min-h-0 flex items-stretch border-b border-white/12 ${
                  lane % 2 === 0 ? "bg-black/[0.06]" : "bg-white/[0.03]"
                } ${isMyPick ? "derby-lane-row-pick" : ""}`}
              >
                <DerbyLaneNumber lane={lane + 1} compact={compact} highlight={isMyPick} />
                <div className="relative flex-1 min-w-0">
                  <div
                    className="absolute bottom-0 flex flex-col items-center transition-none"
                    style={{
                      left: `${left}%`,
                      transform: "translateX(-50%)",
                      zIndex: 10 + lane,
                    }}
                  >
                    <HorseRacerLabel r={r} isMyPick={isMyPick} compact={compact} showName={!compact} />
                    <HorseRig
                      r={r}
                      gallop={gallop}
                      scale={horseScale}
                      isMyPick={isMyPick}
                      isWinner={isWinner}
                    />
                    {isWinner && (
                      <Trophy className="absolute -top-1 -right-4 w-4 h-4 text-yellow-400 animate-bounce drop-shadow" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/30 via-transparent to-black/25" />
      {racing && <div className="absolute inset-0 pointer-events-none derby-speed-lines opacity-35" />}
    </div>
  );
}

export function DerbyFrontChaseView({
  racers,
  progress,
  racing,
  selectedRacer,
  compact = false,
  phase,
  camera = "front",
}: ViewBaseProps) {
  const leaderProg = getLeaderProgress(progress);
  const racePhase = phase ?? getRacePhase(leaderProg, racing, progress.every(p => p.done));
  const leader = racers.find(r => progress.find(p => p.racerId === r.id)?.progress === leaderProg);

  const rankMap = new Map<number, number>();
  if (racing) {
    [...racers]
      .map(r => ({ id: r.id, prog: progress.find(p => p.racerId === r.id)?.progress ?? 0 }))
      .sort((a, b) => b.prog - a.prog)
      .forEach((x, i) => rankMap.set(x.id, i + 1));
  }

  const gateBottom = compact ? 6 : 4;
  const gateScale = compact ? 0.55 : 0.62;
  const horseScale = compact ? 0.65 : 0.82;

  return (
    <div className="relative h-full w-full overflow-hidden derby-front-scene">
      <DerbyBroadcastOverlay
        phase={racePhase}
        camera={camera}
        racing={racing}
        leaderName={leader?.name}
        leaderNum={leader?.num}
        leaderSilk={leader?.silk}
        compact={compact}
      />
      <DerbyRaceHUD
        racers={racers}
        progress={progress}
        selectedRacer={selectedRacer}
        racing={racing}
        compact={compact}
      />

      <SkyAndHorizon />

      {/* Perspective track */}
      <div
        className="absolute inset-x-[3%] bottom-0 top-[28%] derby-chase-track"
        style={{
          background: "linear-gradient(180deg, #b89550 0%, #7a5a32 40%, #4a3520 100%)",
          clipPath: "polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)",
        }}
      />

      {/* Vanishing point lines */}
      <div className="absolute top-[28%] left-1/2 -translate-x-1/2 w-px h-[72%] bg-white/8 pointer-events-none" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="absolute top-[32%] bottom-0 w-px bg-white/12 pointer-events-none derby-chase-vanish"
          style={{ left: `${8 + i * 16.8}%` }}
        />
      ))}

      {/* Six spaced lane columns */}
      <div className="absolute inset-x-[2%] top-[28%] bottom-0 grid grid-cols-6 gap-1 sm:gap-2 px-0.5">
        {racers.map((r, laneIdx) => {
          const p = progress.find(x => x.racerId === r.id);
          const prog = (p?.progress ?? 0) / TRACK_LEN;
          const gallop = racing && !p?.done;
          const isMyPick = r.id === selectedRacer;
          const atGate = prog < 0.03;
          const rank = rankMap.get(r.id) ?? 0;
          const isLeader = rank === 1 && racing;
          const scale = atGate ? gateScale : gateScale + prog * (compact ? 0.48 : 0.58);
          const bottom = atGate ? gateBottom : gateBottom + prog * (compact ? 58 : 48);

          return (
            <div
              key={r.id}
              className={`relative derby-chase-column border-x border-white/10 ${
                isMyPick ? "derby-chase-column-pick" : ""
              } ${laneIdx % 2 === 0 ? "bg-black/[0.04]" : "bg-white/[0.02]"}`}
            >
              <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20">
                <HorseSilkBadge r={r} size="xs" highlight={isMyPick} />
              </div>
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-[#8b4513]/80 rounded-t-sm" />

              <div
                className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center transition-none derby-chase-horse"
                style={{
                  bottom: `${bottom}%`,
                  transform: `translateX(-50%) scale(${scale})`,
                  zIndex: Math.round(prog * 200) + laneIdx + (isMyPick ? 60 : 0),
                }}
              >
                {racing && rank > 0 && <DerbyLaneRankBadge rank={rank} isLeader={isLeader} />}
                <HorseRacerLabel r={r} isMyPick={isMyPick} compact showName={false} />
                <HorseRig
                  r={r}
                  gallop={gallop}
                  scale={horseScale}
                  view="front-chase"
                  isMyPick={isMyPick}
                  isWinner={false}
                />
              </div>

              {[0, 1, 2].map(d => (
                <div
                  key={d}
                  className="absolute left-0 right-0 h-px bg-white/8 derby-lane-dash pointer-events-none"
                  style={{ bottom: `${20 + d * 22}%`, animationDelay: `${laneIdx * 0.08 + d * 0.1}s` }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {racing && <div className="absolute inset-0 pointer-events-none derby-speed-lines opacity-30" />}
      {racing && <div className="absolute inset-0 pointer-events-none derby-chase-wind opacity-20" />}
    </div>
  );
}

function ovalPosition(t: number, lane: number): { x: number; y: number; rot: number } {
  const laneOffset = lane * 3.2;
  const a = 36 - laneOffset * 0.45;
  const b = 26 - laneOffset * 0.38;
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
  phase,
  camera = "aerial",
}: ViewBaseProps) {
  const leaderProg = getLeaderProgress(progress);
  const racePhase = phase ?? getRacePhase(leaderProg, racing, progress.every(p => p.done));
  const leader = racers.find(r => progress.find(p => p.racerId === r.id)?.progress === leaderProg);

  return (
    <div className="relative h-full w-full overflow-hidden derby-aerial-scene bg-[#3d6b35]">
      <DerbyBroadcastOverlay
        phase={racePhase}
        camera={camera}
        racing={racing}
        leaderName={leader?.name}
        leaderNum={leader?.num}
        leaderSilk={leader?.silk}
        compact={compact}
      />

      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="derby-grass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4a7c42" />
            <stop offset="100%" stopColor="#2d5a28" />
          </linearGradient>
          <linearGradient id="derby-dirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c4a060" />
            <stop offset="100%" stopColor="#8b6914" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#derby-grass)" />
        {[0, 1, 2, 3, 4, 5].map(lane => {
          const rx = 42 - lane * 3.4;
          const ry = 30 - lane * 2.4;
          return (
            <ellipse
              key={lane}
              cx="50"
              cy="52"
              rx={rx}
              ry={ry}
              fill="none"
              stroke="#fff"
              strokeWidth="0.35"
              strokeDasharray="3 2"
              opacity={0.4 - lane * 0.04}
            />
          );
        })}
        <ellipse cx="50" cy="52" rx="40" ry="28" fill="url(#derby-dirt)" stroke="#6b4e2e" strokeWidth="0.6" />
        <ellipse cx="50" cy="52" rx="20" ry="13" fill="url(#derby-grass)" />
        <ellipse cx="50" cy="54" rx="7" ry="4.5" fill="#4a90a4" opacity="0.75" />
        <rect x="8" y="48" width="3" height="8" fill="#fff" opacity="0.9" />
        {[0, 1, 2, 3].map(i => (
          <rect key={i} x="8" y={48 + i * 2} width="3" height="1" fill={i % 2 === 0 ? "#111" : "#fff"} />
        ))}
        <text x="5" y="46" fontSize="2.8" fill="#fff" fontWeight="bold" opacity="0.85">
          START
        </text>
        <rect x="64" y="16" width="26" height="11" rx="1" fill="#555" opacity="0.55" />
      </svg>

      {racing && <div className="absolute inset-0 derby-aerial-scan pointer-events-none opacity-30" />}

      {racers.map((r, lane) => {
        const p = progress.find(x => x.racerId === r.id);
        const t = (p?.progress ?? 0) / TRACK_LEN;
        const pos = ovalPosition(t, lane);
        const gallop = racing && !p?.done;
        const isMyPick = r.id === selectedRacer;
        return (
          <div
            key={r.id}
            className="absolute transition-none pointer-events-none"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`,
              zIndex: 10 + lane + (isMyPick ? 20 : 0),
            }}
          >
            <div style={{ transform: `rotate(${-pos.rot}deg)` }} className="relative flex flex-col items-center gap-0.5">
              <HorseSilkBadge r={r} size="xs" highlight={isMyPick} />
              <div className={isMyPick ? "derby-pick-ring rounded-full" : ""}>
                <HorseRig
                  r={r}
                  gallop={gallop}
                  scale={compact ? 0.72 : 0.88}
                  view="top"
                  isMyPick={isMyPick}
                  isWinner={false}
                />
              </div>
              <span className="text-[7px] font-bold text-white drop-shadow bg-black/40 px-1 rounded">{r.num}</span>
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
    <div className="relative h-full w-full overflow-hidden derby-finish-scene">
      <DerbyConfetti />
      <SkyAndHorizon />
      <div className="absolute bottom-0 left-0 right-0 h-[44%] bg-gradient-to-b from-[#b8956a] to-[#5c4033]" />
      <div className="absolute bottom-[34%] left-0 right-0 flex justify-center z-10">
        <div className="w-2 h-28 bg-white shadow-xl derby-finish-post" />
        <div className="flex flex-col w-5 -ml-2">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
          ))}
        </div>
      </div>

      <div className="absolute top-3 left-0 right-0 text-center z-20">
        <span className="derby-finish-title">Photo Finish</span>
      </div>

      <div className="absolute bottom-[8%] left-0 right-0 flex items-end justify-center gap-2 sm:gap-5 px-2 sm:px-6 z-10">
        {ordered.map((r, i) => (
          <div
            key={r.id}
            className={`flex flex-col items-center derby-finish-horse ${winnerId === r.id ? "derby-finish-winner" : ""}`}
            style={{ marginBottom: i * 10, animationDelay: `${i * 0.12}s` }}
          >
            {winnerId === r.id && <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 mb-1 animate-bounce" />}
            <span
              className={`text-[10px] sm:text-xs font-black mb-1 ${
                i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : "text-white/80"
              }`}
            >
              #{i + 1}
            </span>
            <DerbyHorse r={r} gallop={false} scale={1.2 - i * 0.1} />
            <span className="text-[9px] sm:text-[10px] font-bold text-white/95 mt-1 truncate max-w-[56px]">{r.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { TRACK_LEN };
