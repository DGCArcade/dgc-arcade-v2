import { CarSprite, getCarColor } from "./chicken-road-sprites";

const VARIANTS = ["sedan", "suv", "truck"] as const;

function AmbientCar({
  laneIndex,
  direction,
  duration,
  delay,
  size,
  offset = 0,
}: {
  laneIndex: number;
  direction: "up" | "down";
  duration: number;
  delay: number;
  size: number;
  offset?: number;
}) {
  const variant = VARIANTS[(laneIndex + offset) % 3];
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
        color={getCarColor(laneIndex + offset + 1)}
        variant={variant}
        size={size}
        direction={direction}
        ambient
      />
    </div>
  );
}

/** Stake-style continuous lane traffic — dual cars per lane for density */
export function AmbientLaneTraffic({
  laneIndex,
  active,
  hideDuringCross,
}: {
  laneIndex: number;
  active: boolean;
  hideDuringCross?: boolean;
}) {
  if (!active || hideDuringCross) return null;

  const direction: "up" | "down" = laneIndex % 2 === 0 ? "down" : "up";
  const duration = 2.2 + (laneIndex % 5) * 0.32;
  const delay = (laneIndex * 0.42) % duration;
  const size = laneIndex % 3 === 2 ? 40 : laneIndex % 3 === 1 ? 38 : 36;

  return (
    <>
      <AmbientCar laneIndex={laneIndex} direction={direction} duration={duration} delay={delay} size={size} />
      <AmbientCar
        laneIndex={laneIndex}
        direction={direction}
        duration={duration * 1.35}
        delay={(delay + duration * 0.55) % duration}
        size={size - 4}
        offset={2}
      />
    </>
  );
}
