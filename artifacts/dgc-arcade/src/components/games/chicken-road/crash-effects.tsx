import { ChickenSprite, DeadChickenSprite, CarSprite, BarrierSprite, getCarColor } from "./chicken-road-sprites";

const VARIANTS = ["sedan", "suv", "truck"] as const;

/**
 * Burst of white feathers that scatter, flutter, and fall — plays once.
 * Anchored from the bottom of the lane strip (the manhole row where the
 * chicken stands).
 */
export function FeatherBurst({
  count = 14,
  bottom = 44,
  delaySec = 0,
}: {
  count?: number;
  /** Origin height in px from the bottom of the lane strip. */
  bottom?: number;
  delaySec?: number;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360 + (i % 3) * 14;
        const dist = 26 + (i % 5) * 13;
        const fall = 30 + (i % 4) * 14;
        const size = 5 + (i % 3) * 2.5;
        return (
          <div
            key={i}
            className="cr-feather absolute left-1/2"
            style={{
              bottom: `${bottom}px`,
              width: `${size * 1.7}px`,
              height: `${size}px`,
              animationDelay: `${delaySec + (i % 6) * 0.03}s`,
              ["--fx" as string]: `${Math.cos((angle * Math.PI) / 180) * dist}px`,
              ["--fy" as string]: `${-Math.abs(Math.sin((angle * Math.PI) / 180)) * dist * 0.8 - 22}px`,
              ["--ffall" as string]: `${fall}px`,
              ["--frot" as string]: `${(i % 2 === 0 ? 1 : -1) * (160 + (i % 4) * 90)}deg`,
              backgroundColor: i % 4 === 3 ? "#ECECE4" : "#F8F8F2",
            }}
          />
        );
      })}
    </div>
  );
}

/** Rubber skid marks left by the braking car, ending just above the impact point. */
function SkidMarks({ direction, animate = true }: { direction: "down" | "up"; animate?: boolean }) {
  return (
    <div
      className={`${animate ? "cr-skid-marks" : "cr-skid-marks-static"} absolute left-1/2 -translate-x-1/2 z-[8] pointer-events-none`}
      style={direction === "down" ? { top: "18%", height: "48%" } : { bottom: "84px", height: "30%" }}
    >
      <div className="absolute left-[calc(50%-11px)] w-[5px] h-full rounded-full bg-black/55" />
      <div className="absolute left-[calc(50%+6px)] w-[5px] h-full rounded-full bg-black/55" />
    </div>
  );
}

/**
 * Stake-style car kill — rendered at the LANE STRIP level (unclipped) so the
 * whole sequence plays where the chicken actually stands: the manhole row.
 * The killing car races in, slams the chicken with a white flash + double
 * shockwave, rubber skids behind it, feathers explode, and the chicken is
 * launched spinning off the road.
 */
export function CarCrashEffect({ laneIndex, direction }: { laneIndex: number; direction: "down" | "up" }) {
  const variant = VARIANTS[laneIndex % 3];
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Screen flash + expanding shockwaves at the point of impact */}
      <div className="cr-impact-flash absolute inset-0" />
      <div className="cr-impact-shockwave absolute left-1/2 bottom-[16px] -translate-x-1/2 w-20 h-20 rounded-full" />
      <div className="cr-impact-shockwave-2 absolute left-1/2 bottom-[16px] -translate-x-1/2 w-20 h-20 rounded-full" />

      {/* Rubber left on the asphalt as the car brakes */}
      <SkidMarks direction={direction} />

      {/* The killing car — races in, slams into the chicken at the manhole row */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-20 ${
          direction === "down" ? "cr-car-kill-slam-down" : "cr-car-kill-slam-up"
        }`}
        style={{ bottom: "34px" }}
      >
        <div className="cr-car-speed-trail absolute inset-0 -z-10" />
        <CarSprite color={getCarColor(laneIndex)} variant={variant} size={46} direction={direction} />
      </div>

      {/* Chicken launched off the manhole — up, spinning, off to the side */}
      <div className="absolute left-1/2 bottom-[30px] -translate-x-1/2 z-10 cr-chicken-knockback">
        <ChickenSprite size={40} shadow={false} />
      </div>

      {/* Feather explosion from the impact point */}
      <FeatherBurst count={16} bottom={48} delaySec={0.1} />

      {/* Sparks / debris ring */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div
          key={i}
          className="cr-crash-debris absolute left-1/2 bottom-[46px] w-1.5 h-1.5 rounded-full"
          style={{
            animationDelay: `${i * 0.035}s`,
            ["--debris-angle" as string]: `${i * 45 - 180}deg`,
            backgroundColor: i % 3 === 0 ? "#F6E05E" : i % 3 === 1 ? "#FC8181" : "#E2E8F0",
          }}
        />
      ))}
      <div className="cr-impact-spark absolute left-1/2 bottom-[8px] -translate-x-1/2 w-24 h-24 rounded-full pointer-events-none" />
      <div className="absolute left-1/2 bottom-[120px] -translate-x-1/2 text-xs font-black text-red-400 cr-crash-text">
        SPLAT!
      </div>
    </div>
  );
}

/**
 * Persistent bust-lane visual after a car kill: the stopped car sits with its
 * bumper over the flattened chicken on the manhole, hazards blinking, with a
 * few feathers still drifting down.
 */
export function CarBustAftermath({ laneIndex, direction }: { laneIndex: number; direction: "down" | "up" }) {
  const variant = VARIANTS[laneIndex % 3];
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <SkidMarks direction={direction} animate={false} />
      {/* Flattened chicken on the manhole, under the car's bumper */}
      <div className="absolute left-1/2 bottom-[10px] -translate-x-1/2 z-[24] cr-dead-chicken-settle">
        <DeadChickenSprite size={44} />
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 z-[25] cr-car-bust-shake" style={{ bottom: "48px" }}>
        <div className="cr-hazard-blink absolute inset-0 -z-10 rounded-full" />
        <CarSprite color={getCarColor(laneIndex)} variant={variant} size={46} direction={direction} />
      </div>
      <FeatherBurst count={7} bottom={40} delaySec={0.05} />
    </div>
  );
}

/** Transient manhole eruption — fire column blasting out of the sewer the chicken landed on. */
export function ManholeFireEffect() {
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div className="cr-impact-flash absolute inset-0" />
      {/* Fire column erupting from the manhole */}
      <div className="cr-manhole-eruption absolute left-1/2 bottom-[18px] -translate-x-1/2 w-16 h-24 rounded-full" />
      <div className="cr-manhole-burst absolute left-1/2 bottom-[14px] -translate-x-1/2 w-20 h-14 rounded-full" />
      <div className="cr-manhole-burst-ring absolute left-1/2 bottom-[10px] -translate-x-1/2 w-20 h-14 rounded-full" />
      {/* Embers shooting upward */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="cr-ember-fly absolute left-1/2 bottom-[34px] w-1.5 h-1.5 rounded-full"
          style={{
            animationDelay: `${i * 0.06}s`,
            ["--ex" as string]: `${(i - 2.5) * 12}px`,
            ["--ey" as string]: `${-60 - (i % 3) * 26}px`,
            backgroundColor: i % 2 === 0 ? "#FFCC00" : "#FF6600",
          }}
        />
      ))}
      <div className="absolute left-1/2 bottom-[120px] -translate-x-1/2 text-xs font-black text-orange-400 cr-crash-text">
        ROASTED!
      </div>
    </div>
  );
}

/** Persistent manhole-death visual: charred chicken smoking on the sewer. */
export function ManholeBustAftermath() {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Lingering ember glow on the manhole */}
      <div className="cr-manhole-ember absolute left-1/2 bottom-[16px] -translate-x-1/2 w-16 h-8 rounded-full" />
      {/* Charred flattened chicken on the manhole */}
      <div className="absolute left-1/2 bottom-[12px] -translate-x-1/2 z-[24] cr-dead-chicken-settle">
        <DeadChickenSprite size={42} charred />
      </div>
      {/* Smoke wisps rising off the corpse */}
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="cr-smoke-wisp absolute left-1/2 bottom-[44px] w-3 h-3 rounded-full"
          style={{ animationDelay: `${i * 0.5}s`, marginLeft: `${(i - 1) * 9}px` }}
        />
      ))}
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
