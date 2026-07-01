import { Trophy } from "lucide-react";
import { DerbyHorse, HorseSilkBadge, type RacerDef } from "./derby-horse";
import { DerbyRaceHUD, DerbyLaneRankBadge, DerbyMobileLeaderChip } from "./derby-race-hud";
import {
  DerbyBroadcastOverlay,
  DerbyConfetti,
  DerbyLaneNumber,
  DerbyYourPickBanner,
  getLeaderProgress,
  getRacePhase,
  type RacePhase,
} from "./derby-broadcast";
import { buildStandings, getRankMap, relativeBehind, chaseVisualPosition } from "./derby-race-utils";
import { DerbyAheadBehindTag, DerbyRankPill } from "./derby-position-badge";
import type { HorseMood } from "./derby-horse";

export type RacerProgress = { racerId: number; progress: number; done: boolean };
export type CameraAngle = "side" | "front" | "aerial" | "finish";

const TRACK_LEN = 100;
const LANE_COUNT = 6;
/** Shared horizontal track — all horses use same X so ahead/behind is obvious */
const TRACK_START_PCT = 8;
const TRACK_END_PCT = 92;

function horseTrackLeft(progM: number): number {
  return TRACK_START_PCT + (progM / TRACK_LEN) * (TRACK_END_PCT - TRACK_START_PCT);
}

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
      <div className="absolute inset-0 bg-gradient-to-b from-[#2d6a9f] via-[#5ba3cc] 22% to-[#8ec4e8] 38% via-[#c9b896] 58% to-[#d4b896] 100%" />
      <div className="absolute top-[8%] left-0 right-0 h-14 bg-gradient-to-b from-white/35 to-transparent" />
      {/* Clouds */}
      <div className="absolute top-[12%] left-[8%] w-20 h-6 rounded-full bg-white/25 blur-md derby-cloud-drift" />
      <div className="absolute top-[16%] right-[12%] w-28 h-8 rounded-full bg-white/20 blur-md derby-cloud-drift-slow" />
      <div className="absolute top-[22%] left-[45%] w-16 h-5 rounded-full bg-white/15 blur-sm derby-cloud-drift" style={{ animationDelay: "-4s" }} />
      {/* Birds */}
      <svg className="absolute top-[14%] left-[20%] w-8 h-4 opacity-50 derby-bird-fly" viewBox="0 0 32 16" fill="none">
        <path d="M4 8 Q8 4 12 8 Q16 12 20 8 Q24 4 28 8" stroke="#1a2a3a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
      <svg className="absolute top-[20%] right-[25%] w-6 h-3 opacity-40 derby-bird-fly" style={{ animationDelay: "-6s", animationDuration: "18s" }} viewBox="0 0 32 16" fill="none">
        <path d="M4 8 Q8 4 12 8 Q16 12 20 8 Q24 4 28 8" stroke="#1a2a3a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
      <svg className="absolute top-[11%] left-[60%] w-5 h-2.5 opacity-35 derby-bird-fly" style={{ animationDelay: "-2s", animationDuration: "22s" }} viewBox="0 0 32 16" fill="none">
        <path d="M4 8 Q8 4 12 8 Q16 12 20 8" stroke="#1a2a3a" strokeWidth="1" fill="none" strokeLinecap="round" />
      </svg>
      {/* Distant treeline */}
      <div className="absolute bottom-[42%] left-0 right-0 h-10 opacity-60 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent, #3d6b35 40%, #2d5a28)",
          clipPath: "polygon(0 100%, 5% 40%, 12% 70%, 20% 30%, 30% 60%, 42% 25%, 55% 55%, 68% 20%, 80% 50%, 92% 35%, 100% 65%, 100% 100%)",
        }}
      />
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
  mood = "neutral",
  rank,
  gapBehind,
  racing,
  compact,
  showRankBadge = true,
}: {
  r: RacerDef;
  gallop: boolean;
  scale: number;
  view?: "side" | "front-chase" | "top";
  isMyPick: boolean;
  isWinner: boolean;
  mood?: HorseMood;
  rank?: number;
  gapBehind?: number;
  racing?: boolean;
  compact?: boolean;
  showRankBadge?: boolean;
}) {
  return (
    <div
      className={`relative derby-horse-rig ${isMyPick ? "derby-pick-glow" : ""} ${isWinner ? "brightness-115 derby-winner-glow" : ""} ${
        gallop ? "derby-horse-bob derby-horse-lean derby-horse-stride" : ""
      } ${rank === 1 && racing ? "derby-horse-leading" : ""} ${rank && rank > 3 && racing ? "derby-horse-trailing" : ""}`}
    >
      {racing && rank != null && showRankBadge && view !== "front-chase" && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap">
          <DerbyRankPill rank={rank} gapBehind={gapBehind ?? 0} compact={compact} isLeader={rank === 1} />
        </div>
      )}
      <DerbyHorse r={r} gallop={gallop} scale={scale} view={view} showBadge={false} mood={mood} />
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
  const horseScale = compact ? 0.72 : 0.92;
  const leaderProg = getLeaderProgress(progress);
  const racePhase = phase ?? getRacePhase(leaderProg, racing, progress.every(p => p.done));
  const leader = racers.find(r => {
    const p = progress.find(x => x.racerId === r.id);
    return p && p.progress === leaderProg;
  });
  const pick = selectedRacer ? racers.find(r => r.id === selectedRacer) : undefined;
  const standings = buildStandings(racers, progress);
  const rankMap = getRankMap(standings);

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
        preview={!racing}
      />
      <DerbyRaceHUD
        racers={racers}
        progress={progress}
        selectedRacer={selectedRacer}
        racing={racing}
        compact={compact}
      />
      {racing && compact && (
        <DerbyMobileLeaderChip
          leaderName={leader?.name}
          leaderNum={leader?.num}
          leaderSilk={leader?.silk}
        />
      )}

      {pick && atGate && !racing && <DerbyYourPickBanner pick={pick} compact={compact} />}

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
        style={{
          transform: racing ? `translateX(-${cameraX}%)` : "none",
          width: racing ? "260%" : "100%",
        }}
      >
        {racing && <div className="absolute inset-0 derby-track-motion z-0 pointer-events-none" />}

        {[0, 25, 50, 75, 100].map(d => (
          <div
            key={d}
            className="absolute top-2 text-[8px] sm:text-[10px] font-black text-white/75 uppercase tracking-wider drop-shadow z-10"
            style={{ left: `${horseTrackLeft(d)}%`, transform: "translateX(-50%)" }}
          >
            {d === 0 ? "Start" : `${d}m`}
          </div>
        ))}

        {/* Start line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-[6] pointer-events-none derby-start-line"
          style={{ left: `${TRACK_START_PCT}%` }}
        />

        {/* Finish */}
        <div className="absolute right-[2%] top-0 bottom-0 flex flex-col items-center justify-end z-20 pb-1"
          style={{ left: `${TRACK_END_PCT}%`, right: "auto", transform: "translateX(-50%)" }}>
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

        {/* Gate — removed global vertical bars; per-lane gates sit behind horses */}
        {(atGate || gateOpening) && (
          <span
            className="absolute bottom-1 text-[8px] font-black text-white/75 uppercase tracking-widest z-[4] drop-shadow"
            style={{ left: `${TRACK_START_PCT - 1}%`, transform: "translateX(-50%)" }}
          >
            START
          </span>
        )}

        {/* Six clearly separated lane rows (backgrounds + rails) */}
        <div className="absolute inset-0 flex flex-col pt-5 pb-2 z-10 gap-[3px] sm:gap-1.5">
          {racers.map((r, lane) => {
            const p = progress.find(x => x.racerId === r.id);
            const progM = p?.progress ?? 0;
            const standing = rankMap.get(r.id);
            const rank = standing?.rank ?? 0;
            const isMyPick = r.id === selectedRacer;

            return (
              <div
                key={`lane-${r.id}`}
                className={`derby-lane-row flex-1 min-h-[12px] sm:min-h-[16px] flex items-stretch border-b border-white/12 ${
                  lane % 2 === 0 ? "bg-black/[0.06]" : "bg-white/[0.03]"
                } ${rank === 1 && racing ? "derby-lane-row-leading" : ""}`}
              >
                <DerbyLaneNumber lane={lane + 1} compact={compact} highlight={isMyPick} />
                <div className="relative flex-1 min-w-0">
                  {racing && (
                    <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/10 left-0 right-0 mx-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${rank === 1 ? "bg-yellow-400" : "bg-white/35"}`}
                        style={{ width: `${(progM / TRACK_LEN) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Horses + gates — same horizontal coords as distance markers */}
        <div className="absolute inset-0 flex flex-col pt-5 pb-2 z-20 pointer-events-none gap-[3px] sm:gap-1.5">
          {racers.map((r, lane) => {
            const p = progress.find(x => x.racerId === r.id);
            const progM = p?.progress ?? 0;
            const standing = rankMap.get(r.id);
            const rank = standing?.rank ?? 0;
            const gapBehind = standing?.gapBehind ?? 0;
            const atStart = !racing || progM < 2;
            const trackLeft = horseTrackLeft(atStart ? 0 : progM);
            const gallop = racing && !p?.done;
            const isWinner = showResult && winnerId === r.id;
            const isMyPick = r.id === selectedRacer;

            return (
              <div key={`horse-${r.id}`} className="relative flex-1 min-h-[12px] sm:min-h-[16px]">
                {(atGate || (gateOpening && progM < 4)) && (
                  <div
                    className={`absolute bottom-0 z-[5] ${gateOpening ? "derby-gate-open" : ""}`}
                    style={{ left: `${TRACK_START_PCT}%`, transform: "translateX(-120%)" }}
                  >
                    {gateOpening && lane === 0 && (
                      <div className="absolute left-0 bottom-full mb-1 w-24 h-8 derby-gate-dust" />
                    )}
                    <div
                      className={`${compact ? "w-5 h-6" : "w-7 h-8"} bg-gradient-to-b from-[#a0522d] to-[#5c3317] border border-[#ffd700]/45 rounded-t-sm shadow-inner derby-gate-door opacity-75`}
                      style={{ animationDelay: `${lane * 0.06}s` }}
                    />
                  </div>
                )}
                <div
                  className="absolute bottom-0 flex flex-col items-center transition-none derby-horse-on-track"
                  style={{
                    left: `${trackLeft}%`,
                    transform: "translateX(-50%)",
                    zIndex: 20 + Math.round(progM) + (isMyPick ? 30 : 0),
                    opacity: racing ? 0.8 + (progM / TRACK_LEN) * 0.2 : 1,
                  }}
                >
                  {!compact && <HorseRacerLabel r={r} isMyPick={isMyPick} compact={compact} showName={!compact} />}
                  {racing && rank > 0 && !compact && (
                    <DerbyAheadBehindTag rank={rank} gapBehind={gapBehind} compact={compact} />
                  )}
                  <HorseRig
                    r={r}
                    gallop={gallop}
                    scale={horseScale * (rank === 1 && racing ? 1.08 : rank && rank > 3 && racing ? 0.92 : 1)}
                    isMyPick={isMyPick}
                    isWinner={isWinner}
                    rank={rank}
                    gapBehind={gapBehind}
                    racing={racing}
                    compact={compact}
                    showRankBadge={!compact}
                  />
                  {isWinner && (
                    <Trophy className="absolute -top-1 -right-4 w-4 h-4 text-yellow-400 animate-bounce drop-shadow" />
                  )}
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
  const standings = buildStandings(racers, progress);
  const rankMap = getRankMap(standings);

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
        preview={!racing}
      />
      <DerbyRaceHUD racers={racers} progress={progress} selectedRacer={selectedRacer} racing={racing} compact={compact} />
      {racing && compact && (
        <DerbyMobileLeaderChip leaderName={leader?.name} leaderNum={leader?.num} leaderSilk={leader?.silk} />
      )}

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
          const progM = p?.progress ?? 0;
          const standing = rankMap.get(r.id);
          const rank = standing?.rank ?? 0;
          const gapBehind = standing?.gapBehind ?? 0;
          const gallop = racing && !p?.done;
          const isMyPick = r.id === selectedRacer;
          const isLeader = rank === 1 && racing;
          const behind = relativeBehind(progM, leaderProg);
          const chasePos = chaseVisualPosition(progM, gapBehind, racing, !!compact);
          const bottom = chasePos.bottomPct;
          const rankMul = isLeader ? 1.08 : rank > 3 && racing ? 0.9 : 1;
          const visualScale = chasePos.scaleMul * horseScale * rankMul;
          const opacity = racing ? 0.55 + (progM / TRACK_LEN) * 0.45 : 1;
          const centerPull = racing ? (2.5 - laneIdx) * behind * (compact ? 4 : 5) : 0;

          return (
            <div
              key={r.id}
              className={`relative derby-chase-column border-x border-white/10 ${
                isLeader ? "derby-chase-column-leading" : ""
              } ${
                laneIdx % 2 === 0 ? "bg-black/[0.04]" : "bg-white/[0.02]"
              }`}
            >
              <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-0.5">
                <HorseSilkBadge r={r} size="xs" highlight={isMyPick} />
                {racing && rank > 0 && (
                  <span className="text-[6px] sm:text-[7px] font-mono font-bold text-white/80 bg-black/60 px-0.5 rounded whitespace-nowrap">
                    {rank === 1 ? "LEAD" : `−${Math.round(gapBehind)}m`}
                  </span>
                )}
              </div>
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-[#8b4513]/80 rounded-t-sm" />

              <div
                className="absolute flex flex-col items-center transition-none derby-chase-horse"
                style={{
                  bottom: `${bottom}%`,
                  left: `calc(50% + ${centerPull}%)`,
                  transform: `translateX(-50%) scale(${visualScale})`,
                  zIndex: Math.round(progM * 3) + laneIdx + (isMyPick ? 80 : 0) + (isLeader ? 40 : 0),
                  opacity,
                }}
              >
                {racing && rank > 0 && !compact && (
                  <DerbyLaneRankBadge rank={rank} isLeader={isLeader} compact={compact} />
                )}
                {!compact && <HorseRacerLabel r={r} isMyPick={isMyPick} compact showName={false} />}
                {racing && rank > 0 && !compact && (
                  <DerbyAheadBehindTag rank={rank} gapBehind={gapBehind} compact />
                )}
                <HorseRig
                  r={r}
                  gallop={gallop}
                  scale={1}
                  view="front-chase"
                  isMyPick={isMyPick}
                  isWinner={false}
                  rank={rank}
                  gapBehind={gapBehind}
                  racing={racing}
                  compact={compact}
                  showRankBadge={false}
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
  const standings = buildStandings(racers, progress);
  const rankMap = getRankMap(standings);

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
        preview={!racing}
      />
      <DerbyRaceHUD
        racers={racers}
        progress={progress}
        selectedRacer={selectedRacer}
        racing={racing}
        compact={compact}
      />
      {racing && compact && (
        <DerbyMobileLeaderChip
          leaderName={leader?.name}
          leaderNum={leader?.num}
          leaderSilk={leader?.silk}
        />
      )}

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
        <rect x="88" y="46" width="3" height="8" fill="#fff" opacity="0.9" />
        {[0, 1, 2, 3].map(i => (
          <rect key={`fin-${i}`} x="88" y={46 + i * 2} width="3" height="1" fill={i % 2 === 0 ? "#111" : "#fff"} />
        ))}
        <text x="86" y="44" fontSize="2.5" fill="#fff" fontWeight="bold" opacity="0.85">
          FINISH
        </text>
        <rect x="64" y="16" width="26" height="11" rx="1" fill="#555" opacity="0.55" />
      </svg>

      {racing && <div className="absolute inset-0 derby-aerial-scan pointer-events-none opacity-30" />}

      {racers.map((r, lane) => {
        const p = progress.find(x => x.racerId === r.id);
        const progM = p?.progress ?? 0;
        const t = progM / TRACK_LEN;
        const pos = ovalPosition(t, lane);
        const gallop = racing && !p?.done;
        const isMyPick = r.id === selectedRacer;
        const standing = rankMap.get(r.id);
        const rank = standing?.rank ?? 0;
        const gapBehind = standing?.gapBehind ?? 0;
        return (
          <div
            key={r.id}
            className="absolute transition-none pointer-events-none"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) rotate(${pos.rot}deg)`,
              zIndex: Math.round(progM * 2) + lane + (isMyPick ? 50 : 0),
              opacity: racing ? 0.65 + (progM / TRACK_LEN) * 0.35 : 1,
            }}
          >
            <div style={{ transform: `rotate(${-pos.rot}deg)` }} className="relative flex flex-col items-center gap-0.5">
              {racing && rank > 0 && !compact && (
                <DerbyRankPill rank={rank} gapBehind={gapBehind} compact isLeader={rank === 1} />
              )}
              <HorseSilkBadge r={r} size="xs" highlight={isMyPick} />
              <div className={isMyPick ? "derby-pick-glow rounded-full" : ""}>
                <HorseRig
                  r={r}
                  gallop={gallop}
                  scale={compact ? 0.72 : 0.88}
                  view="top"
                  isMyPick={isMyPick}
                  isWinner={false}
                  racing={false}
                />
              </div>
              {!compact && (
                <span className="text-[7px] font-bold text-white drop-shadow bg-black/50 px-1 rounded">
                  {r.num} · {Math.round(progM)}m
                </span>
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
  finishOrder,
  winnerId,
  compact = false,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  /** Provably-fair finish order [1st, 2nd, … 6th] — drives photo finish lineup */
  finishOrder?: number[];
  winnerId?: number;
  compact?: boolean;
}) {
  const orderedIds =
    finishOrder && finishOrder.length === racers.length
      ? finishOrder
      : buildStandings(racers, progress).sort((a, b) => a.rank - b.rank).map(s => s.r.id);
  // Photo finish: 6th → 1st left to right, winner at the wire (right)
  const lineup = [...orderedIds].reverse();

  return (
    <div className="relative h-full w-full overflow-hidden derby-finish-scene">
      <DerbyConfetti />
      <SkyAndHorizon />
      <div className="absolute bottom-0 left-0 right-0 h-[48%] bg-gradient-to-b from-[#b8956a] to-[#5c4033]" />

      {/* Finish wire */}
      <div className="absolute bottom-[30%] right-[6%] top-[20%] w-1 bg-white/90 shadow-lg z-20 derby-finish-wire" />
      <div className="absolute bottom-[30%] right-[4%] flex flex-col z-20">
        <div className="w-2 h-28 sm:h-32 bg-white shadow-xl derby-finish-post" />
        <div className="flex flex-col w-5 -ml-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
          ))}
        </div>
      </div>

      <div className="absolute top-3 left-0 right-0 text-center z-20">
        <span className="derby-finish-title">Photo Finish</span>
        <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest mt-1">Official results</p>
      </div>

      {/* Horses lined up at the wire — place order visible left (last) to right (winner) */}
      <div className="absolute bottom-[6%] left-[2%] right-[8%] h-[38%] z-10">
        <div className="absolute bottom-[18%] left-0 right-0 h-px bg-white/25" />
        <span className="absolute bottom-[20%] right-0 text-[8px] font-black text-white/70 uppercase tracking-widest">
          Finish line →
        </span>

        {lineup.map((racerId, visualIdx) => {
          const r = racers.find(x => x.id === racerId)!;
          const place = orderedIds.indexOf(racerId) + 1;
          const standing = buildStandings(racers, progress).find(s => s.r.id === racerId);
          const gapBehind = standing?.gapBehind ?? (place - 1) * 2.8;
          const isWinner = winnerId === r.id;
          const mood: HorseMood = isWinner ? "happy" : "sad";
          const slotWidth = 100 / 6;
          const left = visualIdx * slotWidth + slotWidth * 0.5;
          const horseScale = isWinner ? (compact ? 0.95 : 1.15) : compact ? 0.7 - (place - 2) * 0.04 : 0.85 - (place - 2) * 0.05;

          return (
            <div
              key={r.id}
              className={`absolute bottom-0 flex flex-col items-center derby-finish-horse ${
                isWinner ? "derby-finish-winner" : "derby-finish-loser"
              }`}
              style={{
                left: `${left}%`,
                transform: "translateX(-50%)",
                animationDelay: `${visualIdx * 0.1}s`,
                zIndex: isWinner ? 30 : 20 - place,
              }}
            >
              <span className="text-2xl sm:text-3xl mb-0.5 derby-face-emoji" role="img" aria-hidden>
                {isWinner ? "😄" : "😢"}
              </span>
              {isWinner && (
                <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-yellow-400 mb-0.5 animate-bounce drop-shadow-lg" />
              )}
              <span
                className={`font-black mb-1 ${
                  compact ? "text-[9px]" : "text-xs"
                } ${place === 1 ? "text-yellow-400" : place === 2 ? "text-gray-300" : "text-white/75"}`}
              >
                #{place}
              </span>
              <HorseSilkBadge r={r} size={compact ? "xs" : "sm"} highlight={isWinner} />
              <DerbyHorse r={r} gallop={false} scale={Math.max(0.55, horseScale)} mood={mood} />
              <span
                className={`font-bold text-white/95 mt-1 truncate text-center ${
                  compact ? "text-[8px] max-w-[48px]" : "text-[10px] max-w-[64px]"
                }`}
              >
                {r.name}
              </span>
              {!isWinner && (
                <span className="text-[7px] text-red-200/80 font-mono mt-0.5">+{Math.round(gapBehind)}m</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { TRACK_LEN };
