import { HorseSilkBadge, type RacerDef } from "./derby-horse";

type RacerProgress = { racerId: number; progress: number; done: boolean };

/** Live race standings — mobile Lanes view */
export function DerbyRaceHUD({
  racers,
  progress,
  selectedRacer,
  racing,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  selectedRacer: number | null;
  racing: boolean;
}) {
  if (!racing) return null;

  const sorted = [...racers]
    .map(r => ({
      r,
      prog: progress.find(p => p.racerId === r.id)?.progress ?? 0,
      done: progress.find(p => p.racerId === r.id)?.done ?? false,
    }))
    .sort((a, b) => b.prog - a.prog);

  const leader = sorted[0];

  return (
    <div className="absolute top-1 left-1 right-1 z-40 flex items-start justify-between gap-1 pointer-events-none">
      <div className="flex flex-col gap-0.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-1 border border-white/10 max-w-[48%]">
        <span className="text-[7px] font-bold uppercase text-white/50 tracking-wider">Live</span>
        {sorted.slice(0, 3).map(({ r, prog }, i) => (
          <div
            key={r.id}
            className={`flex items-center gap-1 ${r.id === selectedRacer ? "opacity-100" : "opacity-85"}`}
          >
            <span
              className={`text-[8px] font-black w-3 text-center ${
                i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : "text-amber-700"
              }`}
            >
              {i + 1}
            </span>
            <HorseSilkBadge r={r} size="xs" highlight={r.id === selectedRacer} />
            <span className="text-[8px] font-bold text-white truncate max-w-[52px]">{r.name}</span>
            <span className="text-[7px] font-mono text-white/45 ml-auto">{Math.round(prog)}m</span>
          </div>
        ))}
      </div>

      {leader && (
        <div className="bg-black/55 backdrop-blur-sm rounded-md px-2 py-1 border border-yellow-500/30 shrink-0">
          <span className="text-[7px] font-bold uppercase text-yellow-400/80 block">Leader</span>
          <div className="flex items-center gap-1">
            <HorseSilkBadge r={leader.r} size="xs" />
            <span className="text-[9px] font-black text-white">{leader.r.name}</span>
          </div>
        </div>
      )}
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
          : "bg-black/60 text-white/80 border-white/20";
  return (
    <span
      className={`absolute -top-2 -right-1 z-20 text-[7px] font-black w-4 h-4 rounded-full flex items-center justify-center border shadow ${colors} ${
        isLeader ? "derby-leader-pulse" : ""
      }`}
    >
      {rank}
    </span>
  );
}
