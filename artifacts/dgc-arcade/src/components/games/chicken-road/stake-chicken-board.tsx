import { useEffect, useRef, useState } from "react";
import {
  ChickenSprite,
  CarSprite,
  TrafficLight,
  ManholeCover,
  getCarColor,
} from "./chicken-road-sprites";
import { AmbientLaneTraffic } from "./ambient-traffic";
import { CarCrashEffect, BarrierDropEffect } from "./crash-effects";
import { getSurvivalChancePercent, type StakeTier } from "@/lib/chicken-road-stake-math";
import { useChickenMotor } from "./use-chicken-motor";
import { useScreenShake } from "./use-screen-shake";
import { PhysicsBurstLayer } from "./physics-burst-layer";
import { useBoardLaneCenters } from "./use-board-lane-centers";

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
  onCrossNext?: () => void;
  canCross?: boolean;
  crossLoading?: boolean;
  betAmount?: number;
  tier?: StakeTier;
  /** While hopping, chicken glides to this lane strip index (0-based sewer). */
  chickenStripIndex?: number;
}

const SIDEWALK_W = 88;
const LANE_W = 80;

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
      <div className="absolute bottom-0 left-[12%] w-[20%] h-[18%] bg-[#1e2840]/80 rounded-t border border-white/5">
        <div className="absolute inset-x-2 top-1 h-1.5 bg-primary/30 rounded-sm cr-city-window-flicker" />
      </div>
    </div>
  );
}

function ManholeHoverDeck({
  laneIndex,
  currentLane,
  betAmount,
  tier,
  multiplier,
  mouseX,
  mouseY,
}: {
  laneIndex: number;
  currentLane: number;
  betAmount: number;
  tier: StakeTier;
  multiplier: number;
  mouseX: number;
  mouseY: number;
}) {
  const chance = getSurvivalChancePercent(tier, currentLane, laneIndex + 1);
  const payout = betAmount * multiplier;
  return (
    <div
      className="absolute z-50 pointer-events-none bg-card/95 border border-primary/40 p-2.5 rounded-lg shadow-2xl flex flex-col gap-1 text-[11px] font-mono tracking-tight w-48 backdrop-blur-md"
      style={{ left: mouseX + 14, top: mouseY - 72 }}
    >
      <div className="flex justify-between border-b border-border pb-1">
        <span className="text-muted-foreground font-sans text-[10px]">Sewer step</span>
        <span className="text-primary font-bold">#${laneIndex + 1}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground font-sans text-[10px]">Success chance</span>
        <span className="text-green-400 font-bold">${chance.toFixed(6)}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground font-sans text-[10px]">Est. Payout</span>
        <span className="text-primary font-bold">$${payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

function WinCelebration() {
  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full cr-confetti"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${-10 - Math.random() * 20}%`,
            opacity: 0.8,
            scale: `${0.5 + Math.random()}`,
            rotate: `${Math.random() * 360}deg`,
            backgroundColor: ["#68D391", "#63B3ED", "#F6E05E", "#FC8181", "#B794F6"][i % 5],
            animationDelay: `${(i % 8) * 0.08}s`,
          }}
        />
      ))}
      <div className="absolute top-[18%] left-1/2 -translate-x-1/2 text-center cr-win-title-pop">
        <span className="block text-2xl sm:text-3xl font-black uppercase tracking-widest text-green-400 drop-shadow-lg">
          Cleared!
        </span>
        <span className="block text-[10px] font-bold uppercase text-white/70 mt-1">All sewers crossed</span>
      </div>
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
  isNextTarget,
  onManholeClick,
  crossLoading,
  onManholeHover,
  manholeRef,
}: {
  laneIndex: number;
  state: LaneState;
  multiplier: number;
  crossAnim: CrossAnim;
  bustLane?: number;
  bustHazard?: HazardType;
  trafficActive: boolean;
  isNextTarget?: boolean;
  onManholeClick?: () => void;
  crossLoading?: boolean;
  onManholeHover?: (lane: number | null) => void;
  manholeRef?: (el: HTMLDivElement | null) => void;
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

  const justCleared = state === "past" && crossAnim === null;

  return (
    <div className={`cr-stake-lane relative flex-shrink-0 w-[80px] h-full ${
      state === "future" ? "opacity-55" : ""
    }`}>
      <div className={`absolute inset-x-0 top-0 bottom-[72px] bg-[#4a5568] border-x border-[#5a6578] overflow-hidden ${
        state === "current" ? "cr-lane-active" : ""
      } ${justCleared ? "cr-lane-cleared-flash" : ""}`}>
        <div className="absolute left-1/2 top-3 bottom-3 w-0 border-l border-dashed border-white/12" />
        <div className="absolute inset-0 cr-lane-asphalt-shimmer pointer-events-none opacity-30" />
        
        <AmbientLaneTraffic
          laneIndex={laneIndex}
          active={trafficActive}
          hideDuringCross={hideAmbient}
        />

        {showCar && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-pass-once z-10">
            <div className="cr-car-speed-trail absolute inset-0 -z-10" />
            <CarSprite color={getCarColor(laneIndex)} variant={variant} size={42} direction="down" />
          </div>
        )}

        {showCarUp && (
          <div className="absolute left-1/2 -translate-x-1/2 cr-car-pass-once-reverse z-10">
            <div className="cr-car-speed-trail absolute inset-0 -z-10" />
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
            <div className="cr-manhole-burst-ring absolute inset-0 rounded-full" />
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
            <div className="cr-manhole-burst-ring absolute inset-0 rounded-full" />
          </div>
        )}
      </div>

      <div
        ref={manholeRef}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20"
        onMouseEnter={() => onManholeHover?.(laneIndex)}
        onMouseLeave={() => onManholeHover?.(null)}
      >
        <ManholeCover
          multiplier={multiplier}
          state={state}
          showAmbientFire={trafficActive}
          tappable={isNextTarget && !crossLoading}
          onTap={isNextTarget && !crossLoading ? onManholeClick : undefined}
        />
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
  onCrossNext,
  canCross,
  crossLoading,
  betAmount = 0,
  tier,
  chickenStripIndex,
  laneWidth = LANE_W,
}: StakeChickenBoardProps & { laneWidth?: number }) {
  const isActive = status === "active";
  const trafficActive = isActive || status === "lost";

  const scrollRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const playRowRef = useRef<HTMLDivElement>(null);
  const sidewalkRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [hoveredLane, setHoveredLane] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [burstId, setBurstId] = useState(0);
  const [burstOrigin, setBurstOrigin] = useState({ x: 200, y: 300 });
  const [viewportWidth, setViewportWidth] = useState(0);

  const onSidewalk = isActive && currentLane === 0 && !hopping;

  const settledStripIndex = isActive
    ? currentLane === 0
      ? -1
      : currentLane - 1
    : status === "won" || status === "lost"
      ? Math.max(0, currentLane - 1)
      : -1;

  const positionStripIndex =
    hopping && chickenStripIndex !== undefined
      ? chickenStripIndex
      : settledStripIndex;

  // Track viewport width to enable screen-space fixed chicken positioning
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      if (entries[0]) setViewportWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // useBoardLaneCenters is kept for its side-effect: it observes lane DOM elements
  // and triggers a remeasure after scroll settles.
  useBoardLaneCenters(
    playRowRef,
    sidewalkRef,
    lanes,
    laneRefs,
    scrollRef,
  );

  /**
   * FIX: Decouple chicken from scroll.
   * Instead of using world-space (SIDEWALK_W + index * LANE_W), we use screen-space.
   * The chicken stays at a fixed screen coordinate (centered in the viewport).
   * The board scrolls the lanes underneath the chicken.
   * This prevents the chicken from "moving with the scroll" (thumb) and 
   * prevents it from going off-screen.
   */
  const CHICKEN_VIEWPORT_X = viewportWidth > 0 ? viewportWidth / 2 : 140;
  const targetLeft =
    positionStripIndex < 0
      ? SIDEWALK_W / 2
      : SIDEWALK_W + CHICKEN_VIEWPORT_X;

  const scrollTargetLane = positionStripIndex;

  const motor = useChickenMotor(targetLeft, hopping, laneWidth, chickenVisible);
  const shakeIntensity = status === "lost" ? 25 : crossAnim?.phase === "car-impact" ? 16 : crossAnim?.phase === "manhole-fire" ? 12 : 0;
  const shake = useScreenShake(burstId, shakeIntensity);

  useEffect(() => {
    if (status !== "lost") return;
    const area = playAreaRef.current;
    // For the lost burst, we use the world-coordinate so the explosion stays on the sewer
    const worldX = positionStripIndex < 0 
      ? SIDEWALK_W / 2 
      : SIDEWALK_W + positionStripIndex * laneWidth + laneWidth / 2;
    setBurstOrigin({ x: worldX, y: area ? area.clientHeight - 52 : 300 });
    setBurstId(id => id + 1);
  }, [status, positionStripIndex, laneWidth]);

  useEffect(() => {
    if (crossAnim?.phase !== "car-impact" && crossAnim?.phase !== "manhole-fire") return;
    const area = playAreaRef.current;
    const laneCenter = SIDEWALK_W + (crossAnim.lane * laneWidth) + laneWidth / 2;
    setBurstOrigin({
      x: laneCenter,
      y: area ? area.clientHeight * (crossAnim.phase === "manhole-fire" ? 0.72 : 0.42) : 300,
    });
    setBurstId(id => id + 1);
    }, [crossAnim?.lane, crossAnim?.phase, laneWidth]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !chickenVisible) return;

    if (onSidewalk) {
      el.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    if (scrollTargetLane < 0) return;

    // Scroll the board so the target lane is centered in the viewport (matching the chicken)
    const laneWorldX = scrollTargetLane * laneWidth + laneWidth / 2;
    const viewportW = el.clientWidth;
    if (viewportW > 0) {
      const target = Math.max(0, laneWorldX - viewportW / 2);
      if (Math.abs(el.scrollLeft - target) > 10) {
        el.scrollTo({ left: target, behavior: "smooth" });
      }
    }
  }, [scrollTargetLane, laneWidth, chickenVisible, onSidewalk]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onMove = (e: MouseEvent) => {
      const rect = board.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    board.addEventListener("mousemove", onMove);
    return () => board.removeEventListener("mousemove", onMove);
  }, []);

  const showHoverDeck =
    hoveredLane !== null &&
    isActive &&
    hoveredLane >= currentLane &&
    betAmount > 0;

  return (
    <div
      ref={boardRef}
      className="cr-stake-board relative rounded-xl overflow-hidden border border-white/10 bg-[#141a28] shadow-2xl"
    >
      <div
        ref={playAreaRef}
        className="relative"
        style={{
          transform: `translate(${shake.x}px, ${shake.y}px)`,
          willChange: shake.x || shake.y ? "transform" : undefined,
        }}
      >
      <CitySkyline />

      <div ref={playRowRef} className="relative flex h-[min(500px,64vh)] min-h-[340px]">
        {/* Sidewalk */}
        <div ref={sidewalkRef} className="relative z-10 w-[88px] shrink-0 bg-[#5a6578] border-r border-white/10 flex flex-col items-center pt-3 pb-2">
          <TrafficLight active={isActive ? "green" : status === "lost" ? "red" : "yellow"} />
          <div className="w-12 h-12 mt-2 rounded-full bg-[#276749] border-2 border-[#22543D] shadow-inner" />
          <div className="flex-1 w-full flex flex-col justify-end gap-1 px-4 pb-3 mt-2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="h-1 bg-white/95 rounded-sm" />
            ))}
          </div>
          <span className="text-[8px] font-bold uppercase text-white/35 tracking-widest mb-2">Start</span>
        </div>

        {/* Lanes scroll area */}
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
                  isNextTarget={isActive && i === currentLane && canCross}
                  onManholeClick={onCrossNext}
                  crossLoading={crossLoading}
                  onManholeHover={setHoveredLane}
                  manholeRef={el => {
                    laneRefs.current[i] = el;
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* 
          Chicken stays fixed on screen (relative to the sidewalk), 
          only moves when hopping to next sewer relative to the board's scroll.
        */}
        {chickenVisible && (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${motor.left}px`,
              bottom: `${28 + motor.liftY}px`,
              transform: `translateX(-50%) scale(${motor.scaleX}, ${motor.scaleY})`,
              transformOrigin: "center bottom",
              willChange: "left, bottom, transform",
            }}
          >
            <div className={`relative flex flex-col items-center`}>
              <ChickenSprite hopping={hopping} running={hopping} size={48} />
              {hopping && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-2 cr-chicken-dust rounded-full" />
              )}
            </div>
          </div>
        )}
      </div>

      <PhysicsBurstLayer
        burstId={burstId}
        originX={burstOrigin.x}
        originY={burstOrigin.y}
        intensity={status === "lost" ? 1.2 : 1}
      />

      {showHoverDeck && hoveredLane !== null && (
        <ManholeHoverDeck
          laneIndex={hoveredLane}
          currentLane={currentLane}
          betAmount={betAmount}
          tier={tier ?? "medium"}
          multiplier={multipliers[hoveredLane] ?? 1}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
        />
      )}

      {status === "won" && <WinCelebration />}
      </div>

      <div className="relative z-10 px-3 py-2 border-t border-white/10 bg-black/50 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">
          {status === "idle"
            ? "Select difficulty & amount, then Play"
            : isActive
              ? "Tap the glowing sewer or Go to cross — cash out anytime"
              : status === "won"
                ? "Round complete"
                : "Busted"}
        </span>
        {(isActive || status === "idle") && (
          <span className="text-[10px] font-mono font-bold text-primary shrink-0">
            {status === "idle" ? `${lanes} sewers` : `Step ${currentLane + 1} / ${lanes}`}
          </span>
        )}
      </div>
    </div>
  );
}
