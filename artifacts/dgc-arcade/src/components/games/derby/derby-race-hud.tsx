import { HorseSilkBadge, type RacerDef } from "./derby-horse";
import { buildStandings } from "./derby-race-utils";

type RacerProgress = { racerId: number; progress: number; done: boolean };

/** Desktop-only standings panel — hidden on mobile during race to keep view clear */
export function DerbyRaceHUD({
  racers,
  progress,
  selectedRacer,
  racing,
  compact = false,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  selectedRacer: number | null;
  racing: boolean;
  compact?: boolean;
}) {
  if (!racing || compact) return null;

  const sorted = buildStandings(racers, progress);

  return (
    <div className="absolute top-12 right-2 w-[min(200px,42%)] z-40 pointer-events-none">
      <div className="bg-black/70 backdrop-blur-md rounded-lg border border-white/12 shadow-xl px-2.5 py-2">
        <span className="text-[7px] font-bold uppercase text-white/45 tracking-widest block mb-1">
          Positions
        </span>
        <div className="flex flex-col gap-1">
          {sorted.map((s, i) => (
            <div
              key={s.r.id}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${
                s.r.id === selectedRacer ? "bg-yellow-500/15 border border-yellow-400/25" : ""
              }`}
            >
              <span
                className={`text-[8px] font-black w-3.5 text-center shrink-0 ${
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-white/50"
                }`}
              >
                {s.rank}
              </span>
              <HorseSilkBadge r={s.r} size="xs" highlight={s.r.id === selectedRacer} />
              <span className="font-bold text-white truncate flex-1 text-[9px]">{s.r.name}</span>
              <span className={`font-mono shrink-0 text-[8px] ${i === 0 ? "text-yellow-400/90" : "text-white/45"}`}>
                {i === 0 ? "LEAD" : `−${Math.round(s.gapBehind)}m`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tiny mobile leader chip — does not block the race */
export function DerbyMobileLeaderChip({
  leaderName,
  leaderNum,
  leaderSilk,
  gapBehind,
}: {
  leaderName?: string;
  leaderNum?: string;
  leaderSilk?: string;
  gapBehind?: number;
}) {
  if (!leaderName) return null;
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/75 border border-yellow-400/35 backdrop-blur-sm shadow-lg">
        <span className="text-[7px] font-black uppercase text-yellow-400">Lead</span>
        {leaderSilk && (
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded text-[7px] font-black border border-white/40"
            style={{ backgroundColor: leaderSilk, color: "#111" }}
          >
            {leaderNum}
          </span>
        )}
        <span className="text-[9px] font-black text-white">{leaderName}</span>
        {gapBehind != null && gapBehind > 0 && (
          <span className="text-[7px] font-mono text-white/50">+{Math.round(gapBehind)}m gap</span>
        )}
      </div>
    </div>
  );
}

export function DerbyLaneRankBadge({ rank, isLeader, compact }: { rank: number; isLeader: boolean; compact?: boolean }) {
  if (rank < 1) return null;
  const colors =
    rank === 1
      ? "bg-yellow-500 text-black border-yellow-300"
      : rank === 2
        ? "bg-gray-300 text-black border-gray-200"
        : rank === 3
          ? "bg-amber-700 text-white border-amber-500"
          : "bg-black/70 text-white/85 border-white/25";
  return (
    <span
      className={`absolute z-30 font-black rounded-full flex items-center justify-center border shadow-lg ${colors} ${
        isLeader ? "derby-leader-pulse" : ""
      } ${compact ? "-top-2 left-1/2 -translate-x-1/2 text-[7px] min-w-[16px] h-4" : "-top-3 left-1/2 -translate-x-1/2 text-[8px] min-w-[18px] h-[18px]"}`}
    >
      {rank}
    </span>
  );
}
