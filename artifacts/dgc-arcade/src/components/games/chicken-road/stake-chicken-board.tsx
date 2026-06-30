import { ChickenSprite, CarSprite, TrafficLight, getCarColor } from "./chicken-road-sprites";

export type LaneState = "idle" | "past" | "current" | "future" | "bust";

interface StakeChickenBoardProps {
  lanes: number;
  currentLane: number;
  status: "idle" | "active" | "won" | "lost";
  multipliers: number[];
  loading: boolean;
  hopping: boolean;
  bustLane?: number;
}

function CitySkyline() {
  return (
    <div className="cr-city-skyline absolute inset-x-0 top-0 h-[38%] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2035] via-[#252b42] to-transparent" />
      {[8, 22, 38, 55, 70, 85].map((left, i) => (
        <div key={i} className="absolute bottom-0 bg-[#1e2438] border border-white/5 rounded-t-sm"
          style={{
            left: `${left}%`,
            width: `${10 + (i % 3) * 4}%`,
            height: `${35 + (i % 4) * 12}%`,
            opacity: 0.7 + (i % 2) * 0.15,
          }}>
          {Array.from({ length: 3 + (i % 2) }).map((_, r) => (
            <div key={r} className="flex gap-1 p-1">
              {[0, 1].map(c => (
                <div key={c} className="w-1.5 h-2 rounded-sm bg-yellow-400/20" />
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
  showCars,
}: {
  laneIndex: number;
  state: LaneState;
  multiplier: number;
  showCars: boolean;
}) {
  const color = getCarColor(laneIndex);
  const variants = ["sedan", "suv", "truck"] as const;
  const variant = variants[laneIndex % 3];
  const delay = (laneIndex % 5) * 0.55;

  return (
    <div className={`cr-stake-lane relative flex-shrink-0 w-[64px] sm:w-[72px] h-full ${state === "future" ? "opacity-35" : ""}`}>
      <div className={`absolute inset-x-0 top-0 bottom-12 bg-[#3a4150] border-x border-white/[0.07] ${state === "current" ? "cr-lane-active" : ""}`}>
        <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-white/20" />
        {showCars && (
          <>
            <div className="absolute left-1/2 -translate-x-[60%] cr-car-lane-down" style={{ animationDelay: `${delay}s` }}>
              <CarSprite color={color} variant={variant} size={42} direction="down" />
            </div>
            <div className="absolute left-1/2 -translate-x-[40%] cr-car-lane-up" style={{ animationDelay: `${delay + 1.2}s` }}>
              <CarSprite color={getCarColor(laneIndex + 2)} variant={variants[(laneIndex + 1) % 3]} size={38} direction="up" />
            </div>
          </>
        )}
        {state === "bust" && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 z-10">
            <CarSprite color="#E74C3C" variant="sedan" size={40} direction="down" />
          </div>
        )}
      </div>
      <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full flex items-center justify-center font-mono font-black text-[10px] border-2 z-20 ${
        state === "past" ? "bg-blue-600/80 border-blue-400 text-white" :
        state === "current" ? "bg-primary border-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30" :
        state === "bust" ? "bg-red-600/60 border-red-400 text-white" :
        "bg-[#2d3748] border-white/20 text-white/60"
      }`}>
        {multiplier.toFixed(2)}×
      </div>
    </div>
  );
}

export function StakeChickenBoard({
  lanes,
  currentLane,
  status,
  multipliers,
  loading,
  hopping,
  bustLane,
}: StakeChickenBoardProps) {
  const isActive = status === "active";
  const chickenLane = isActive ? currentLane : status === "idle" ? -1 : Math.max(0, currentLane - 1);

  return (
    <div className="cr-stake-board relative rounded-xl overflow-hidden border border-white/10 bg-[#1a202c] shadow-2xl">
      <CitySkyline />
      <div className="relative flex h-[min(440px,58vh)] min-h-[300px]">
        <div className="relative z-10 w-[72px] sm:w-[84px] shrink-0 bg-[#4a5568] border-r border-white/10 flex flex-col items-center py-3 gap-2">
          <TrafficLight active={isActive ? "green" : status === "lost" ? "red" : "yellow"} />
          <div className="w-12 h-12 rounded-full bg-[#276749] border-2 border-[#22543D] shadow-inner" />
          <div className="flex-1 w-full flex flex-col justify-end gap-1 px-2 pb-1">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-1.5 bg-white rounded-sm opacity-90" />
            ))}
          </div>
          {status === "idle" && <ChickenSprite size={44} />}
          <span className="text-[8px] font-bold uppercase text-white/40 tracking-widest mb-1">Start</span>
        </div>

        <div className="flex-1 relative overflow-x-auto overflow-y-hidden cr-lanes-scroll">
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
                  showCars={state !== "past" && !(state === "current" && loading)}
                />
              );
            })}
            {chickenLane >= 0 && (
              <div
                className="absolute z-30 pointer-events-none cr-chicken-walker transition-all duration-500 ease-out"
                style={{
                  left: `${chickenLane * 72 + 36}px`,
                  top: "42%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <ChickenSprite hopping={hopping || loading} size={48} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="relative z-10 px-3 py-2 border-t border-white/10 bg-black/40 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
          {isActive ? "Press Go to cross the next lane" : "Cross all lanes — cash out anytime"}
        </span>
        {isActive && <span className="text-xs font-mono font-bold text-primary">Step {currentLane + 1} / {lanes}</span>}
      </div>
    </div>
  );
}
