import { Trophy, Camera } from "lucide-react";
import { DerbyHorse, HorseSilkBadge, type RacerDef, type HorseMood } from "./derby-horse";
import { buildStandings, type RacerProgress } from "./derby-race-utils";

function FinishSky() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-[#2d6a9f] via-[#5ba3cc] 22% to-[#8ec4e8] 38% via-[#c9b896] 58% to-[#d4b896] 100%" />
      <div className="absolute top-[8%] left-0 right-0 h-14 bg-gradient-to-b from-white/35 to-transparent" />
      <div className="absolute top-[12%] left-[8%] w-20 h-6 rounded-full bg-white/25 blur-md derby-cloud-drift" />
      <div className="absolute top-[16%] right-[12%] w-28 h-8 rounded-full bg-white/20 blur-md derby-cloud-drift-slow" />
      <svg className="absolute top-[14%] left-[20%] w-8 h-4 opacity-50 derby-bird-fly" viewBox="0 0 32 16" fill="none">
        <path d="M4 8 Q8 4 12 8 Q16 12 20 8 Q24 4 28 8" stroke="#1a2a3a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
      <div
        className="absolute bottom-[48%] left-0 right-0 h-12 opacity-50 pointer-events-none derby-finish-crowd"
        style={{
          background: "repeating-linear-gradient(90deg, transparent 0 5px, #1a2a1a 5px 7px, transparent 7px 12px)",
          clipPath: "polygon(0 100%, 100% 100%, 100% 40%, 0 70%)",
        }}
      />
    </>
  );
}

function FinishCameraFlash() {
  return (
    <>
      <div className="absolute inset-0 z-50 pointer-events-none derby-finish-flash-burst" />
      <div className="absolute inset-0 z-40 pointer-events-none derby-finish-shutter" />
    </>
  );
}

function FinishConfetti({ winnerLeftPct }: { winnerLeftPct: number }) {
  const colors = ["#FFD166", "#FF6B6B", "#67E8F9", "#6EE7A0", "#F9A8D4", "#fff", "#fbbf24"];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {Array.from({ length: 42 }).map((_, i) => {
        const nearWinner = i < 18;
        const left = nearWinner
          ? winnerLeftPct + ((i * 13) % 28) - 14
          : (i * 17 + 3) % 100;
        return (
          <span
            key={i}
            className={`derby-confetti-piece ${nearWinner ? "derby-confetti-piece-gold" : ""}`}
            style={{
              left: `${Math.max(2, Math.min(98, left))}%`,
              backgroundColor: colors[i % colors.length],
              animationDelay: `${nearWinner ? 0.6 + (i % 6) * 0.08 : (i % 7) * 0.12}s`,
              animationDuration: `${nearWinner ? 2.4 + (i % 4) * 0.3 : 1.8 + (i % 5) * 0.25}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function PlaceRibbon({ place, compact }: { place: number; compact?: boolean }) {
  const styles =
    place === 1
      ? "bg-gradient-to-r from-yellow-500 to-amber-400 text-black border-yellow-200 derby-finish-ribbon-gold"
      : place === 2
        ? "bg-gradient-to-r from-gray-300 to-gray-100 text-black border-gray-200"
        : place === 3
          ? "bg-gradient-to-r from-amber-700 to-amber-500 text-white border-amber-400"
          : "bg-black/60 text-white/80 border-white/20";
  const label = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
  return (
    <span
      className={`derby-finish-ribbon inline-flex items-center justify-center font-black uppercase border shadow-lg ${styles} ${
        compact ? "text-[7px] px-1.5 py-0.5 min-w-[28px]" : "text-[8px] px-2 py-0.5 min-w-[32px]"
      }`}
    >
      {label}
    </span>
  );
}

export function DerbyFinishView({
  racers,
  progress,
  finishOrder,
  winnerId,
  compact = false,
  liveSequential = false,
}: {
  racers: RacerDef[];
  progress: RacerProgress[];
  finishOrder?: number[];
  winnerId?: number;
  compact?: boolean;
  liveSequential?: boolean;
}) {
  const orderedIds =
    finishOrder && finishOrder.length === racers.length
      ? finishOrder
      : buildStandings(racers, progress)
          .sort((a, b) => a.rank - b.rank)
          .map(s => s.r.id);

  const crossedIds = liveSequential
    ? orderedIds.filter(id => progress.find(p => p.racerId === id)?.done)
    : orderedIds;

  const lineup = [...crossedIds].reverse();
  const winner = racers.find(r => r.id === winnerId);
  const winnerSlotIdx = lineup.findIndex(id => id === winnerId);
  const winnerLeftPct = winnerSlotIdx >= 0 ? (winnerSlotIdx + 0.5) * (100 / Math.max(crossedIds.length, 1)) : 92;
  const showFullReveal = !liveSequential || crossedIds.length === racers.length;
  const showWinnerStamp = showFullReveal && winner;

  return (
    <div className="relative h-full w-full overflow-hidden derby-finish-scene">
      {showFullReveal && <FinishCameraFlash />}
      <FinishSky />
      {showFullReveal && <FinishConfetti winnerLeftPct={winnerLeftPct} />}

      {/* Track surface */}
      <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-b from-[#c9a66b] via-[#a8844e] to-[#5c4028]" />
      <div className="absolute bottom-[22%] left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent derby-finish-track-shine" />

      {/* Winner spotlight */}
      {winnerId && (
        <div
          className="absolute bottom-[8%] w-32 sm:w-40 h-[42%] pointer-events-none z-[5] derby-finish-spotlight"
          style={{ left: `${winnerLeftPct}%`, transform: "translateX(-50%)" }}
        />
      )}

      {/* Finish wire + post */}
      <div className="absolute bottom-[28%] right-[6%] top-[18%] w-0.5 bg-white z-20 derby-finish-wire" />
      <div className="absolute bottom-[28%] right-[4%] flex flex-col z-20 derby-finish-post-wrap">
        <div className="w-2 h-28 sm:h-32 bg-white shadow-xl derby-finish-post" />
        <div className="flex flex-col w-5 -ml-1.5">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <div key={i} className="h-2.5" style={{ background: i % 2 === 0 ? "#111" : "#fff" }} />
          ))}
        </div>
      </div>
      <div className="absolute bottom-[30%] right-[5%] w-16 h-16 pointer-events-none z-[6] derby-finish-wire-spark" />

      {/* Header */}
      <div className="absolute top-2 sm:top-3 left-0 right-0 text-center z-20 px-2">
        {showFullReveal ? (
          <>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 border border-white/15 mb-1 derby-finish-captured-badge">
              <Camera className="w-3 h-3 text-white/80" />
              <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-widest text-white/90">Photo captured</span>
            </div>
            <span className="derby-finish-title block">Photo Finish</span>
            <p className="text-[8px] sm:text-[9px] text-white/60 font-bold uppercase tracking-widest mt-0.5">Official results</p>
          </>
        ) : (
          <>
            <span className="derby-finish-title block text-base sm:text-lg">Live Wire</span>
            <p className="text-[8px] sm:text-[9px] text-yellow-300/90 font-bold uppercase tracking-widest mt-0.5">
              {crossedIds.length} of {racers.length} across
            </p>
          </>
        )}
      </div>

      {/* Winner stamp — after winner crosses */}
      {showWinnerStamp && winner && (
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 z-[35] pointer-events-none derby-finish-winner-stamp">
          <span className="block text-center font-black uppercase tracking-[0.2em] text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] text-lg sm:text-2xl">
            Winner!
          </span>
          <span className="block text-center font-black text-white text-xs sm:text-sm mt-0.5 drop-shadow-lg">
            #{winner.num} {winner.name}
          </span>
        </div>
      )}

      {/* Winner callout banner */}
      {showWinnerStamp && winner && (
        <div
          className="absolute top-[22%] left-1/2 -translate-x-1/2 z-25 derby-finish-winner-banner"
          style={{ animationDelay: showFullReveal ? "0.85s" : "0.28s" }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-500/90 to-amber-400/90 border border-yellow-200/60 shadow-xl backdrop-blur-sm">
            <Trophy className="w-4 h-4 text-yellow-900 shrink-0 derby-finish-trophy-spin" />
            <div className="text-left min-w-0">
              <p className="text-[7px] font-bold uppercase tracking-widest text-yellow-900/80">Winner</p>
              <p className={`font-black text-yellow-950 truncate ${compact ? "text-xs" : "text-sm"}`}>
                #{winner.num} {winner.name}
              </p>
            </div>
            <HorseSilkBadge r={winner} size="sm" highlight />
          </div>
        </div>
      )}

      {/* Horses at the wire */}
      <div className="absolute bottom-[4%] left-[2%] right-[8%] h-[40%] z-10">
        <div className="absolute bottom-[20%] left-0 right-0 h-px bg-white/30 derby-finish-line-glow" />
        <span className="absolute bottom-[22%] right-0 text-[7px] sm:text-[8px] font-black text-white/70 uppercase tracking-widest derby-finish-line-label">
          Finish line →
        </span>

        {lineup.map((racerId, visualIdx) => {
          const r = racers.find(x => x.id === racerId)!;
          const place = orderedIds.indexOf(racerId) + 1;
          const standing = buildStandings(racers, progress).find(s => s.r.id === racerId);
          const gapBehind = standing?.gapBehind ?? (place - 1) * 2.8;
          const isWinner = winnerId === r.id;
          const mood: HorseMood = isWinner ? "happy" : "sad";
          const slotCount = Math.max(crossedIds.length, 1);
          const slotWidth = 100 / slotCount;
          const left = visualIdx * slotWidth + slotWidth * 0.5;
          const horseScale = isWinner
            ? compact ? 1.0 : 1.18
            : compact
              ? Math.max(0.58, 0.72 - (place - 2) * 0.04)
              : Math.max(0.62, 0.88 - (place - 2) * 0.05);
          const enterDelay = liveSequential
            ? 0.05
            : isWinner
              ? 0.08
              : 0.15 + visualIdx * 0.12;
          const faceDelay = enterDelay + (liveSequential ? 0.18 : 0.35);

          return (
            <div
              key={r.id}
              className="absolute bottom-0"
              style={{ left: `${left}%`, transform: "translateX(-50%)", zIndex: isWinner ? 30 : 20 - place }}
            >
              <div
                className={`flex flex-col items-center derby-finish-horse-inner ${
                  isWinner ? "derby-finish-winner-cross" : liveSequential ? "derby-wire-horse-cross" : "derby-finish-horse-slide"
                }`}
                style={{ animationDelay: `${enterDelay}s` }}
              >
                {isWinner && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-14 h-4 derby-finish-winner-dust rounded-full" />}

                <span
                  className="text-xl sm:text-3xl mb-0.5 derby-face-emoji"
                  role="img"
                  aria-hidden
                  style={{ animationDelay: `${faceDelay}s` }}
                >
                  {isWinner ? "😄" : "😢"}
                </span>

                {isWinner && (
                  <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-yellow-400 mb-0.5 derby-finish-trophy-bounce drop-shadow-lg" />
                )}

                <div className="derby-finish-ribbon-wrap mb-1" style={{ animationDelay: `${enterDelay + 0.2}s` }}>
                  <PlaceRibbon place={place} compact={compact} />
                </div>

                <HorseSilkBadge r={r} size={compact ? "xs" : "sm"} highlight={isWinner} />
                <div className={isWinner ? "derby-finish-winner-glow-ring" : ""}>
                  <DerbyHorse r={r} gallop={false} scale={horseScale} mood={mood} />
                </div>
                <span
                  className={`font-bold text-white/95 mt-1 truncate text-center drop-shadow-md ${
                    compact ? "text-[8px] max-w-[52px]" : "text-[10px] max-w-[68px]"
                  }`}
                >
                  {r.name}
                </span>
                {!isWinner && (
                  <span
                    className="text-[7px] text-red-200/90 font-mono mt-0.5 derby-finish-gap-tag"
                    style={{ animationDelay: `${enterDelay + 0.3}s` }}
                  >
                    +{Math.round(gapBehind)}m
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
