import { ChickenSprite, CarSprite, TrafficLight } from "./chicken-road-sprites";

export type TileStatus = "hidden" | "safe" | "car" | "revealed-car";
export type TileCell = { status: TileStatus };

interface LaneVisualProps {
  laneIndex: number;
  tiles: TileCell[];
  multiplier: number;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  loading: boolean;
  onPickTile: (tileIndex: number) => void;
  chickenRow: number | null;
  showCars: boolean;
  carSeed: number;
}

function LaneColumn({
  laneIndex,
  tiles,
  multiplier,
  isCurrent,
  isPast,
  isFuture,
  loading,
  onPickTile,
  chickenRow,
  showCars,
  carSeed,
}: LaneVisualProps) {
  const carColor = ["#9B59B6", "#3498DB", "#2ECC71", "#E74C3C"][laneIndex % 4];
  const carDelay = (carSeed % 5) * 0.7;

  return (
    <div className={`cr-lane-col flex flex-col flex-1 min-w-[52px] max-w-[72px] relative ${isFuture ? "opacity-40" : ""} ${isPast ? "opacity-90" : ""}`}>
      <div className={`cr-lane-road flex-1 relative mx-0.5 rounded-sm overflow-hidden border-x border-white/10 ${isCurrent ? "cr-lane-active ring-2 ring-primary/60" : ""}`}>
        {/* Asphalt */}
        <div className="absolute inset-0 bg-[#3D4451]" />
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 border-l border-dashed border-white/25" />

        {/* Animated cars in lane */}
        {showCars && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-lane" style={{ animationDelay: `${carDelay}s` }}>
            <CarSprite color={carColor} variant={laneIndex % 3 === 0 ? "truck" : "sedan"} size={40} />
          </div>
        )}

        {/* Crossing rows */}
        <div className="absolute inset-0 flex flex-col justify-evenly py-2 z-10">
          {tiles.map((tile, rowIdx) => {
            const clickable = isCurrent && !loading && tile.status === "hidden";
            const hasChicken = chickenRow === rowIdx;
            return (
              <button
                key={rowIdx}
                type="button"
                disabled={!clickable}
                onClick={() => onPickTile(rowIdx)}
                className={`cr-crossing-row relative h-[18%] min-h-[28px] mx-1 rounded transition-all border ${
                  tile.status === "hidden" && clickable
                    ? "border-white/20 bg-white/5 hover:bg-primary/20 hover:border-primary/50 cursor-pointer"
                    : tile.status === "hidden"
                    ? "border-transparent bg-transparent"
                    : tile.status === "safe"
                    ? "border-green-500/50 bg-green-500/15"
                    : "border-red-500/60 bg-red-500/25"
                }`}
              >
                {tile.status === "car" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CarSprite color="#E74C3C" size={32} />
                  </div>
                )}
                {tile.status === "revealed-car" && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-50">
                    <CarSprite color="#888" size={28} />
                  </div>
                )}
                {hasChicken && (
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <ChickenSprite hopping={isCurrent && !loading} size={36} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Multiplier badge */}
      <div className={`cr-mult-badge mt-1.5 mx-auto px-2 py-1 rounded-full text-center font-mono font-black text-[11px] border ${
        isPast ? "bg-green-500/20 border-green-500/40 text-green-400" :
        isCurrent ? "bg-primary/20 border-primary/50 text-primary animate-pulse" :
        "bg-secondary/40 border-border/40 text-muted-foreground"
      }`}>
        {multiplier.toFixed(2)}×
      </div>
    </div>
  );
}

interface ChickenRoadBoardProps {
  lanes: number;
  tilesPerLane: number;
  grid: TileCell[][];
  currentLane: number;
  status: "idle" | "active" | "won" | "lost";
  multipliers: number[];
  loading: boolean;
  onPickTile: (lane: number, tile: number) => void;
  lastSafeRow: number | null;
}

export function ChickenRoadBoard({
  lanes,
  tilesPerLane,
  grid,
  currentLane,
  status,
  multipliers,
  loading,
  onPickTile,
  lastSafeRow,
}: ChickenRoadBoardProps) {
  const isActive = status === "active";
  const chickenLane = isActive ? currentLane : -1;
  const chickenRow = isActive ? lastSafeRow : status === "idle" ? null : lastSafeRow;

  return (
    <div className="cr-board-root rounded-xl overflow-hidden border border-border bg-[#2D3748] shadow-inner">
      <div className="flex h-[min(420px,55vh)] min-h-[280px]">
        {/* Sidewalk + start area */}
        <div className="cr-sidewalk w-16 sm:w-20 shrink-0 flex flex-col items-center justify-between py-3 px-1 bg-[#4A5568] border-r border-white/10">
          <TrafficLight active={isActive ? "green" : status === "lost" ? "red" : "yellow"} />
          <div className="cr-bush w-10 h-10 rounded-full bg-[#276749] border-2 border-[#22543D] shadow-inner" />
          <div className="cr-crosswalk-start w-full py-2 flex flex-col gap-0.5">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="h-1.5 bg-white/80 rounded-sm" />
            ))}
          </div>
          {(status === "idle" || (isActive && currentLane === 0)) && (
            <div className="mt-auto mb-2">
              <ChickenSprite hopping={false} size={40} />
            </div>
          )}
          <div className="text-[8px] font-bold uppercase text-white/50 tracking-wider text-center">Start</div>
        </div>

        {/* Lanes scroll area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden cr-lanes-scroll">
          <div className="flex h-full min-w-max px-1 py-2 gap-0.5">
            {Array.from({ length: lanes }, (_, laneIdx) => (
              <LaneColumn
                key={laneIdx}
                laneIndex={laneIdx}
                tiles={grid[laneIdx] ?? Array.from({ length: tilesPerLane }, () => ({ status: "hidden" as const }))}
                multiplier={multipliers[laneIdx] ?? 1}
                isCurrent={isActive && laneIdx === currentLane}
                isPast={isActive && laneIdx < currentLane}
                isFuture={isActive && laneIdx > currentLane}
                loading={loading}
                onPickTile={(tile) => onPickTile(laneIdx, tile)}
                chickenRow={laneIdx === chickenLane ? chickenRow : null}
                showCars={laneIdx !== chickenLane || status === "lost"}
                carSeed={laneIdx * 7 + currentLane}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Road header */}
      <div className="px-3 py-2 border-t border-white/10 bg-black/30 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Cross the road — pick a safe lane</span>
        {isActive && (
          <span className="text-xs font-mono font-bold text-primary">Lane {currentLane + 1} / {lanes}</span>
        )}
      </div>
    </div>
  );
}
