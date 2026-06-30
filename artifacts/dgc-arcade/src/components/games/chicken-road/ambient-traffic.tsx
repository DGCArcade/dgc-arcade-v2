import { CarSprite, getCarColor } from "./chicken-road-sprites";

const VARIANTS = ["sedan", "suv", "truck"] as const;

/** Stake-style continuous lane traffic — cars always passing up/down alternating lanes */
export function AmbientLaneTraffic({
  laneIndex,
  active,
  hideDuringCross,
}: {
  laneIndex: number;
  active: boolean;
  /** Hide ambient car when a scripted cross-animation car is on this lane */
  hideDuringCross?: boolean;
}) {
  if (!active || hideDuringCross) return null;

  const direction: "up" | "down" = laneIndex % 2 === 0 ? "down" : "up";
  const variant = VARIANTS[laneIndex % 3];
  const duration = 2.4 + (laneIndex % 5) * 0.35;
  const delay = (laneIndex * 0.42) % duration;
  const size = variant === "truck" ? 40 : variant === "suv" ? 38 : 36;

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-[5] pointer-events-none ${
        direction === "down" ? "cr-car-ambient-down" : "cr-car-ambient-up"
      }`}
      style={{
        animationDuration: `${duration}s`,
        animationDelay: `-${delay}s`,
      }}
    >
      <CarSprite
        color={getCarColor(laneIndex + 1)}
        variant={variant}
        size={size}
        direction={direction}
        ambient
      />
    </div>
  );
}
