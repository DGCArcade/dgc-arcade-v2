import { useEffect, useRef } from "react";
import {
  ChickenSprite,
  CarSprite,
  TrafficLight,
  ManholeCover,
  getCarColor,
} from "./chicken-road-sprites";
import { AmbientLaneTraffic } from "./ambient-traffic";
import { CarCrashEffect, BarrierDropEffect } from "./crash-effects";

export type LaneState = "idle" | "past" | "current" | "future" | "bust";
export type HazardType = "car" | "manhole";

export type CrossAnim = {
  lane: number;
  phase: "car-down" | "car-up" | "barrier" | "car-impact" | "manhole-fire" | "done";
  carDirection: "down" | "up";
} | null;

interface StakeChickenBoardProps {
  lanes: number;
  currentLane: number;
  status: "idle" | "active" | "won" | "lost";
  multipliers: number[];
  hopping: boolean;
  chickenVisible: boolean;
  bustLane?: number;
  bustHazard?: HazardType;
  crossAnim: CrossAnim;
}

function CitySkyline() {
  return (
    <div className="cr-city-skyline absolute inset-x-0 top-0 h-[28%] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#12182a] via-[#1a2238] to-transparent" />
      {[5, 18, 32, 48, 64, 78].map((left, i) => (
        <div key={i} className="absolute bottom-0 bg-[#161c2e] border border-white/5 rounded-t"
          style={{
            left: `${left}%`,
            width: `${7 + (i % 3) * 4}%`,
            height: `${28 + (i % 4) * 12}%`,
            opacity: 0.6 + (i % 2) * 0.15,
          }} />
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
  bustHazard,
  trafficActive,
}: {
  laneIndex: number;
  state: LaneState;
  multiplier: number;
  crossAnim: CrossAnim;
  bustLane?: number;
  bustHazard?: HazardType;
  trafficActive: boolean;
}) {
  const variants = ["sedan", "suv", "truck"] as const;
  const variant = variants[laneIndex % 3];
  const isCrossing = crossAnim?.lane === laneIndex;
  const showCar = isCrossing && crossAnim.phase === "car-down";
  const showCarUp = isCrossing && crossAnim.phase === "car-up";
  const showBarrier = isCrossing && crossAnim.phase === "barrier";
  const showCarImpact = isCrossing && crossAnim.phase === "car-impact";
  const showManholeBurst = isCrossing && crossAnim.phase === "manhole-fire";
  const isBust = bustLane === laneIndex && state === "bust";
  const hideAmbient = isCrossing && (
    crossAnim.phase === "car-down" || crossAnim.phase === "car-up" || crossAnim.phase === "car-impact"
  );

  return (
    <div className={`cr-stake-lane relative flex-shrink-0 w-[72px] sm:w-[80px] h-full ${
      state === "future" ? "opacity-55" : ""
    }`}>
      <div className={`absolute inset-x-0 top-0 bottom-[72px] bg-[#4a5568] border-x border-[#5a6578] overflow-hidden ${
        state === "current" ? "cr-lane-active" : ""
      }`}>
        <div className="absolute left-1/2 top-3 bottom-3 w-0 border-l border-dashed border-white/12" />

        <AmbientLaneTraffic
          laneIndex={laneIndex}
          active={trafficActive}
          hideDuringCross={hideAmbient}
        />

        {showCar && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-pass-once z-10">
            <CarSprite color={getCarColor(laneIndex)} variant={variant} size={42} direction="down" />
          </div>
        )}
        {showCarUp && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-pass-once-reverse z-10">
            <CarSprite color={getCarColor(laneIndex + 1)} variant={variants[(laneIndex + 1) % 3]} size={38} direction="up" />
          </div>
        )}
        {showBarrier && <BarrierDropEffect size={42} />}
        {showCarImpact && (
          <CarCrashEffect laneIndex={laneIndex} direction={crossAnim.carDirection} />
        )}
        {showManholeBurst && (
          <div className="absolute left-1/2 bottom-[20%] -translate-x-1/2 z-20">
            <div className="cr-manhole-burst w-16 h-12 rounded-full" />
          </div>
        )}

        {isBust && bustHazard === "car" && !showCarImpact && (
          <div className="absolute left-1/2 top-[38%] -translate-x-1/2 z-20 cr-car-bust-shake">
            <CarSprite color="#E74C3C" variant="sedan" size={44} direction="down" />
          </div>
        )}
        {isBust && bustHazard === "manhole" && (
          <div className="absolute left-1/2 bottom-[18%] -translate-x-1/2 z-20">
            <div className="cr-manhole-burst w-20 h-14 rounded-full" />
          </div>
        )}
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20">
        <ManholeCover multiplier={multiplier} state={state} showAmbientFire={trafficActive} />
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
  chickenVisible,
  bustLane,
  bustHazard,
  crossAnim,
}: StakeChickenBoardProps) {
  const isActive = status === "active";
  const trafficActive = status === "idle" || status === "active";
  const laneWidth = 80;
  const scrollRef = useRef<HTMLDivElement>(null);

  /** After Play: chicken on sidewalk. After each safe Go: stands on cleared manhole. */
  const onSidewalk = isActive && currentLane === 0;
  const chickenLane = isActive && currentLane > 0
    ? currentLane - 1
    : status === "won" || status === "lost"
      ? Math.max(0, currentLane - 1)
      : -1;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !chickenVisible) return;
    if (onSidewalk) {
      el.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    if (chickenLane < 0) return;
    const target = Math.max(0, chickenLane * laneWidth - el.clientWidth / 2 + laneWidth / 2);
    el.scrollTo({ left: target, behavior: "smooth" });
  }, [chickenLane, laneWidth, chickenVisible, onSidewalk]);

  return (
    <div className="cr-stake-board relative rounded-xl overflow-hidden border border-white/10 bg-[#141a28] shadow-2xl">
      <CitySkyline />
      <div className="relative flex h-[min(500px,64vh)] min-h-[340px]">
        {/* Sidewalk — Stake-style start pad with crosswalk, no chicken until Play */}
        <div className="relative z-10 w-[80px] sm:w-[88px] shrink-0 bg-[#5a6578] border-r border-white/10 flex flex-col items-center pt-3 pb-2">
          <TrafficLight active={isActive ? "green" : status === "lost" ? "red" : "yellow"} />
          <div className="w-12 h-12 mt-2 rounded-full bg-[#276749] border-2 border-[#22543D] shadow-inner" />
          <div className="flex-1 w-full flex flex-col justify-end gap-1 px-4 pb-3 mt-2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="h-1 bg-white/95 rounded-sm" />
            ))}
          </div>
          {chickenVisible && onSidewalk && (
            <div className="mb-1 cr-chicken-spawn">
              <ChickenSprite hopping={hopping} size={48} />
            </div>
          )}
          <span className="text-[8px] font-bold uppercase text-white/35 tracking-widest">Start</span>
        </div>

        <div ref={scrollRef} className="flex-1 relative overflow-x-auto overflow-y-hidden cr-lanes-scroll">
          <div className="flex h-full min-w-max relative">
            {Array.from({ length: lanes }, (_, i) => {
              let state: LaneState = "future";
              if (status === "idle") state = "idle";
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
                  bustHazard={bustHazard}
                  trafficActive={trafficActive}
                />
              );
            })}

            {chickenVisible && !onSidewalk && chickenLane >= 0 && (
              <div
                className={`absolute z-30 pointer-events-none cr-chicken-on-manhole transition-all duration-500 ease-out ${
                  hopping ? "cr-chicken-hop" : ""
                }`}
                style={{
                  left: `${chickenLane * laneWidth + laneWidth / 2}px`,
                  bottom: "28px",
                  transform: "translateX(-50%)",
                }}
              >
                <ChickenSprite size={48} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 px-3 py-2 border-t border-white/10 bg-black/50 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
          {status === "idle"
            ? "Select difficulty & amount, then Play"
            : isActive
              ? "Go to cross next lane — cash out anytime"
              : status === "won"
                ? "Round complete"
                : "Busted"}
        </span>
        {(isActive || status === "idle") && (
          <span className="text-[10px] font-mono font-bold text-primary shrink-0">
            {status === "idle" ? `${lanes} lanes` : `Lane ${currentLane + 1} / ${lanes}`}
          </span>
        )}
      </div>
    </div>
  );
}
