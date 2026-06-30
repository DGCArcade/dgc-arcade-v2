import { HorseSilkBadge, type RacerDef } from "./derby-horse";

type RacerProgress = { racerId: number; progress: number; done: boolean };

/** Live race standings — shown during chase / all camera angles */
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
  if (!racing) return null;

  const sorted = [...racers]
    .map(r => ({
      r,
      prog: progress.find(p => p.racerId === r.id)?.progress ?? 0,
    }))
    .sort((a, b) => b.prog - a.prog);

  return (
    <div
      className={`absolute z-40 pointer-events-none ${
        compact ? "bottom-2 left-1.5 right-1.5" : "top-12 right-2 w-[min(200px,42%)]"
      }`}
    >
      <div
        className={`bg-black/70 backdrop-blur-md rounded-lg border border-white/12 shadow-xl ${
          compact ? "px-2 py-1.5" : "px-2.5 py-2"
        }`}
      >
        <span className="text-[7px] font-bold uppercase text-white/45 tracking-widest block mb-1">
          Positions
        </span>
        <div className={`flex flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
          {sorted.map(({ r, prog }, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${
                r.id === selectedRacer ? "bg-yellow-500/15 border border-yellow-400/25" : ""
              }`}
            >
              <span
                className={`text-[8px] font-black w-3.5 text-center shrink-0 ${
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-white/50"
                }`}
              >
                {i + 1}
              </span>
              <HorseSilkBadge r={r} size="xs" highlight={r.id === selectedRacer} />
              <span className={`font-bold text-white truncate flex-1 ${compact ? "text-[8px]" : "text-[9px]"}`}>
                {r.name}
              </span>
              <span className={`font-mono text-white/50 shrink-0 ${compact ? "text-[7px]" : "text-[8px]"}`}>
                {Math.round(prog)}m
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DerbyLaneRankBadge({ rank, isLeader }: { rank: number; isLeader: boolean }) {
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
      className={`absolute -top-3 left-1/2 -translate-x-1/2 z-30 text-[8px] font-black min-w-[18px] h-[18px] px-0.5 rounded-full flex items-center justify-center border shadow-lg ${colors} ${
        isLeader ? "derby-leader-pulse scale-110" : ""
      }`}
    >
      {rank}
    </span>
  );
}
