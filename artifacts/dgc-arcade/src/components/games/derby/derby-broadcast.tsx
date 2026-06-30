import { HorseSilkBadge, type RacerDef } from "./derby-horse";
import type { CameraAngle } from "./derby-track-views";

export type RacePhase = "gate" | "break" | "mid" | "turn" | "stretch" | "wire" | "finish";

export const TRACK_LEN = 100;

export function getLeaderProgress(
  progress: { racerId: number; progress: number }[],
): number {
  return progress.reduce((max, p) => Math.max(max, p.progress), 0);
}

export function getRacePhase(
  leaderProgress: number,
  racing: boolean,
  allDone: boolean,
): RacePhase {
  if (!racing && allDone) return "finish";
  if (!racing) return "gate";
  const p = leaderProgress / TRACK_LEN;
  if (p < 0.07) return "gate";
  if (p < 0.24) return "break";
  if (p < 0.48) return "mid";
  if (p < 0.62) return "turn";
  if (p < 0.8) return "stretch";
  if (p < 0.95) return "wire";
  return "finish";
}

/** Broadcast-style auto camera cuts — changes angle as the race unfolds */
export function getAutoCamera(phase: RacePhase, isMobile: boolean): CameraAngle {
  switch (phase) {
    case "gate":
      return "front";
    case "break":
      return "side";
    case "mid":
      return isMobile ? "front" : "aerial";
    case "turn":
      return "side";
    case "stretch":
      return "front";
    case "wire":
      return isMobile ? "side" : "aerial";
    case "finish":
      return "finish";
  }
}

export const PHASE_COPY: Record<
  RacePhase,
  { title: string; subtitle: string; camLabel: string }
> = {
  gate: { title: "At the Gate", subtitle: "Stalls loaded — ready to break", camLabel: "CHASE CAM" },
  break: { title: "And They're Off!", subtitle: "Horses surge from the gate", camLabel: "TRACK CAM" },
  mid: { title: "Mid-Race", subtitle: "Pack spreads across the lanes", camLabel: "AERIAL CAM" },
  turn: { title: "Into the Backstretch", subtitle: "Positions shaking out", camLabel: "TRACK CAM" },
  stretch: { title: "Down the Stretch!", subtitle: "Leaders dig for the wire", camLabel: "CHASE CAM" },
  wire: { title: "To the Wire!", subtitle: "Neck-and-neck at the finish", camLabel: "WIRE CAM" },
  finish: { title: "Photo Finish!", subtitle: "Official result", camLabel: "FINISH CAM" },
};

const CAM_LABELS: Record<CameraAngle, string> = {
  side: "TRACK CAM",
  front: "CHASE CAM",
  aerial: "AERIAL CAM",
  finish: "FINISH CAM",
};

export function DerbyBroadcastOverlay({
  phase,
  camera,
  racing,
  leaderName,
  leaderNum,
  leaderSilk,
  compact,
}: {
  phase: RacePhase;
  camera: CameraAngle;
  racing: boolean;
  leaderName?: string;
  leaderNum?: string;
  leaderSilk?: string;
  compact?: boolean;
}) {
  const copy = PHASE_COPY[phase];
  const camLabel = racing ? copy.camLabel : CAM_LABELS[camera];

  return (
    <div className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-2 sm:p-3">
      {/* Top broadcast bar */}
      <div className="flex items-start justify-between gap-2">
        <div
          key={phase}
          className={`derby-phase-banner ${racing ? "derby-phase-banner-live" : ""} ${compact ? "derby-phase-banner-compact" : ""}`}
        >
          <span className="derby-phase-cam">{camLabel}</span>
          <span className="derby-phase-title">{copy.title}</span>
          {!compact && <span className="derby-phase-sub">{copy.subtitle}</span>}
        </div>

        {racing && (
          <div className="derby-live-pill shrink-0">
            <span className="derby-live-dot" />
            LIVE
          </div>
        )}
      </div>

      {/* Leader ticker during race */}
      {racing && leaderName && (
        <div className="self-center derby-leader-ticker">
          <span className="text-[8px] font-bold uppercase text-yellow-400/90 mr-1.5">Leader</span>
          {leaderSilk && (
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded text-[7px] font-black border border-white/40 mr-1"
              style={{ backgroundColor: leaderSilk, color: "#111" }}
            >
              {leaderNum}
            </span>
          )}
          <span className="text-[10px] font-black text-white">{leaderName}</span>
        </div>
      )}
    </div>
  );
}

export function DerbyLaneNumber({
  lane,
  compact,
  highlight,
}: {
  lane: number;
  compact?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`derby-lane-num shrink-0 flex items-center justify-center font-black font-mono border-r border-white/15 ${
        compact ? "w-5 text-[8px]" : "w-7 text-[9px]"
      } ${highlight ? "bg-yellow-500/25 text-yellow-200 border-yellow-400/30" : "bg-black/40 text-white/70"}`}
    >
      {lane}
    </div>
  );
}

export function DerbyConfetti() {
  const colors = ["#FFD166", "#FF6B6B", "#67E8F9", "#6EE7A0", "#F9A8D4", "#fff"];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className="derby-confetti-piece"
          style={{
            left: `${(i * 17 + 3) % 100}%`,
            backgroundColor: colors[i % colors.length],
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${1.8 + (i % 5) * 0.25}s`,
          }}
        />
      ))}
    </div>
  );
}

export function DerbyYourPickBanner({
  pick,
  compact,
}: {
  pick: RacerDef;
  compact?: boolean;
}) {
  return (
    <div
      className={`absolute z-40 flex items-center gap-2 rounded-lg border border-yellow-400/40 bg-black/65 backdrop-blur-md shadow-lg ${
        compact ? "top-10 left-1.5 right-1.5 px-2 py-1" : "top-14 left-3 px-3 py-1.5"
      }`}
    >
      <span className="text-[8px] font-bold uppercase text-yellow-400/80 shrink-0">Your horse</span>
      <HorseSilkBadge r={pick} size={compact ? "xs" : "sm"} highlight />
      <span className={`font-black text-white truncate ${compact ? "text-[10px]" : "text-xs"}`}>
        {pick.name}
      </span>
      <span className="text-[8px] text-white/50 ml-auto shrink-0">Lane {pick.id}</span>
    </div>
  );
}
