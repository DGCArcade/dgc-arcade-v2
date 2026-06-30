import { useEffect, useRef } from "react";
import {
  ChickenSprite,
  CarSprite,
  TrafficLight,
  ManholeCover,
  BarrierSprite,
  getCarColor,
} from "./chicken-road-sprites";

export type LaneState = "idle" | "past" | "current" | "future" | "bust";

export type CrossAnim = {
  lane: number;
  phase: "car-down" | "car-up" | "barrier" | "done";
  carDirection: "down" | "up";
} | null;

interface StakeChickenBoardProps {
  lanes: number;
  currentLane: number;
  status: "idle" | "active" | "won" | "lost";
  multipliers: number[];
  hopping: boolean;
  bustLane?: number;
  crossAnim: CrossAnim;
  laneWidth?: number;
}

function CitySkyline() {
  return (
    <div className="cr-city-skyline absolute inset-x-0 top-0 h-[32%] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#151a28] via-[#1e2438] to-transparent" />
      {[6, 20, 35, 52, 68, 82].map((left, i) => (
        <div key={i} className="absolute bottom-0 bg-[#1a2030] border border-white/5 rounded-t"
          style={{
            left: `${left}%`,
            width: `${8 + (i % 3) * 5}%`,
            height: `${30 + (i % 4) * 14}%`,
            opacity: 0.65 + (i % 2) * 0.2,
          }}>
          {Array.from({ length: 2 + (i % 3) }).map((_, r) => (
            <div key={r} className="flex gap-0.5 p-0.5">
              {[0, 1].map(c => (
                <div key={c} className="w-1 h-1.5 rounded-sm bg-yellow-300/15" />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LaneStrip({
  laneIndex,
  state,
  multiplier,
  crossAnim,
  bustLane,
}: {
  laneIndex: number;
  state: LaneState;
  multiplier: number;
  crossAnim: CrossAnim;
  bustLane?: number;
}) {
  const variants = ["sedan", "suv", "truck"] as const;
  const variant = variants[laneIndex % 3];
  const isCrossing = crossAnim?.lane === laneIndex;
  const showCar = isCrossing && crossAnim.phase === "car-down";
  const showCarUp = isCrossing && crossAnim.phase === "car-up";
  const showBarrier = isCrossing && crossAnim.phase === "barrier";
  const isBust = state === "bust" || bustLane === laneIndex;

  return (
    <div className={`cr-stake-lane relative flex-shrink-0 w-[68px] sm:w-[76px] h-full ${
      state === "future" ? "opacity-40" : state === "idle" ? "opacity-50" : ""
    }`}>
      {/* Road lane — flat Stake-style */}
      <div className={`absolute inset-x-0 top-0 bottom-16 bg-[#4a5568] border-x border-[#5a6578]/80 ${
        state === "current" ? "cr-lane-active" : ""
      }`}>
        <div className="absolute left-1/2 top-2 bottom-2 w-0 border-l border-dashed border-white/15" />

        {/* Car only during active cross animation on THIS lane */}
        {showCar && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-pass-once z-10">
            <CarSprite color={getCarColor(laneIndex)} variant={variant} size={44} direction="down" />
          </div>
        )}
        {showCarUp && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-pass-once-reverse z-10">
            <CarSprite color={getCarColor(laneIndex + 1)} variant={variants[(laneIndex + 1) % 3]} size={40} direction="up" />
          </div>
        )}

        {/* Near-miss barrier */}
        {showBarrier && (
          <div className="absolute left-1/2 top-[38%] -translate-x-1/2 z-20">
            <BarrierSprite size={44} />
          </div>
        )}

        {/* Bust — car stopped at chicken */}
        {isBust && state === "bust" && (
          <div className="absolute left-1/2 top-[42%] -translate-x-1/2 z-20 cr-car-bust-shake">
            <CarSprite color="#E74C3C" variant="sedan" size={46} direction="down" />
          </div>
        )}
      </div>

      {/* Manhole multiplier at bottom */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20">
        <ManholeCover multiplier={multiplier} state={state} />
      </div>
    </div>
  );
}

export function StakeChickenBoard({
  lanes,
  currentLane,
  status,
  multipliers,
  hopping,
  bustLane,
  crossAnim,
}: StakeChickenBoardProps) {
  const isActive = status === "active";
  const laneWidth = 76;
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Chicken stands on sidewalk before lane 0, or on completed lane */
  const chickenLane = isActive ? currentLane : status === "idle" ? -1 : Math.max(0, currentLane - 1);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || chickenLane < 0) return;
    const target = Math.max(0, chickenLane * laneWidth - el.clientWidth / 2 + laneWidth);
    el.scrollTo({ left: target, behavior: "smooth" });
  }, [chickenLane, laneWidth]);

  return (
    <div className="cr-stake-board relative rounded-xl overflow-hidden border border-white/10 bg-[#1a202c] shadow-2xl">
      <CitySkyline />
      <div className="relative flex h-[min(480px,62vh)] min-h-[320px]">
        {/* Sidewalk / start zone */}
        <div className="relative z-10 w-[76px] sm:w-[88px] shrink-0 bg-[#5a6578] border-r border-white/10 flex flex-col items-center py-3 gap-2">
          <TrafficLight active={isActive ? "green" : status === "lost" ? "red" : "yellow"} />
          <div className="w-14 h-14 rounded-full bg-[#276749] border-2 border-[#22543D] shadow-inner flex items-center justify-center overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#2F855A]/60" />
          </div>
          {/* Crosswalk */}
          <div className="flex-1 w-full flex flex-col justify-end gap-1 px-3 pb-2">
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-1.5 bg-white/90 rounded-sm" />
            ))}
          </div>
          {status === "idle" && (
            <div className="mb-1">
              <ChickenSprite size={46} />
            </div>
          )}
          <span className="text-[8px] font-bold uppercase text-white/40 tracking-widest mb-1">Start</span>
        </div>

        {/* Lanes */}
        <div ref={scrollRef} className="flex-1 relative overflow-x-auto overflow-y-hidden cr-lanes-scroll">
          <div className="flex h-full min-w-max relative">
            {Array.from({ length: lanes }, (_, i) => {
              let state: LaneState = "future";
              if (!isActive && status === "idle") state = "idle";
              else if (i < currentLane) state = "past";
              else if (i === currentLane && isActive) state = "current";
              else if (bustLane === i && status === "lost") state = "bust";

              return (
                <LaneStrip
                  key={i}
                  laneIndex={i}
                  state={state}
                  multiplier={multipliers[i] ?? 1}
                  crossAnim={crossAnim}
                  bustLane={bustLane}
                />
              );
            })}

            {/* Chicken walker — only one chicken, moves lane to lane */}
            {chickenLane >= 0 && status !== "idle" && (
              <div
                className="absolute z-30 pointer-events-none cr-chicken-walker transition-all duration-500 ease-out"
                style={{
                  left: `${chickenLane * laneWidth + laneWidth / 2}px`,
                  top: "40%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <ChickenSprite hopping={hopping} size={50} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 px-3 py-2 border-t border-white/10 bg-black/40 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          {isActive ? "Press Go to cross — cash out anytime" : "Pick difficulty & bet, then Go"}
        </span>
        {isActive && (
          <span className="text-xs font-mono font-bold text-primary">
            Lane {currentLane + 1} / {lanes}
          </span>
        )}
      </div>
    </div>
  );
}
