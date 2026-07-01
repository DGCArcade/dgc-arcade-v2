import { formatGap } from "./derby-race-utils";

export function DerbyRankPill({
  rank,
  gapBehind,
  compact,
  isLeader,
}: {
  rank: number;
  gapBehind: number;
  compact?: boolean;
  isLeader?: boolean;
}) {
  const rankColors =
    rank === 1
      ? "bg-yellow-500 text-black border-yellow-300"
      : rank === 2
        ? "bg-gray-300 text-black border-gray-200"
        : rank === 3
          ? "bg-amber-700 text-white border-amber-500"
          : "bg-black/75 text-white border-white/25";

  return (
    <div className={`flex flex-col items-center gap-0.5 ${compact ? "scale-90" : ""}`}>
      <span
        className={`text-[8px] font-black min-w-[20px] h-[18px] px-1 rounded-full flex items-center justify-center border shadow-md ${rankColors} ${
          isLeader ? "derby-leader-pulse" : ""
        }`}
      >
        #{rank}
      </span>
      {rank > 1 && (
        <span className="text-[7px] font-mono font-bold text-white/80 bg-black/55 px-1 rounded whitespace-nowrap">
          {formatGap(gapBehind)}
        </span>
      )}
      {isLeader && (
        <span className="text-[6px] font-black uppercase text-yellow-300 tracking-wider">Lead</span>
      )}
    </div>
  );
}

export function DerbyAheadBehindTag({
  rank,
  gapBehind,
  compact,
}: {
  rank: number;
  gapBehind: number;
  compact?: boolean;
}) {
  if (rank === 1) {
    return (
      <span
        className={`font-black uppercase text-yellow-300 bg-yellow-500/20 border border-yellow-400/40 rounded px-1 ${
          compact ? "text-[6px]" : "text-[7px]"
        }`}
      >
        Leading
      </span>
    );
  }
  return (
    <span
      className={`font-mono font-bold text-red-200/90 bg-black/50 border border-red-400/25 rounded px-1 ${
        compact ? "text-[6px]" : "text-[7px]"
      }`}
    >
      {formatGap(gapBehind)} back
    </span>
  );
}
