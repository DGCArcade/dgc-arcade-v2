import { ChickenSprite, CarSprite, BarrierSprite, getCarColor } from "./chicken-road-sprites";

const VARIANTS = ["sedan", "suv", "truck"] as const;

/** Stake-style car impact — flash, car slam, chicken knockback, debris */
export function CarCrashEffect({ laneIndex, direction }: { laneIndex: number; direction: "down" | "up" }) {
  const variant = VARIANTS[laneIndex % 3];
  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
      <div className="cr-impact-flash absolute inset-0" />
      <div className="cr-impact-shockwave absolute left-1/2 top-[40%] -translate-x-1/2 w-20 h-20 rounded-full" />
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-20 ${
          direction === "down" ? "cr-car-crash-slam-down" : "cr-car-crash-slam-up"
        }`}
        style={{ top: direction === "down" ? "32%" : "38%" }}
      >
        <CarSprite color={getCarColor(laneIndex)} variant={variant} size={46} direction={direction} />
      </div>
      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 z-10 cr-chicken-knockback">
        <ChickenSprite size={40} />
      </div>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="cr-crash-debris absolute left-1/2 top-[42%] w-1.5 h-1.5 rounded-full bg-yellow-200"
          style={{
            animationDelay: `${i * 0.04}s`,
            ["--debris-angle" as string]: `${i * 60 - 150}deg`,
          }}
        />
      ))}
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 text-[10px] font-black text-red-400 cr-crash-text">
        CRASH!
      </div>
    </div>
  );
}

/** Barrier drops from above on near-miss — Stake-style */
export function BarrierDropEffect({ size = 44 }: { size?: number }) {
  return (
    <div className="absolute left-1/2 top-0 -translate-x-1/2 z-25 w-full h-full pointer-events-none">
      <div className="absolute left-1/2 top-[28%] -translate-x-1/2 cr-barrier-drop">
        <BarrierSprite size={size} />
      </div>
      <div className="cr-barrier-dust absolute left-1/2 top-[48%] -translate-x-1/2 w-12 h-3 rounded-full" />
    </div>
  );
}
