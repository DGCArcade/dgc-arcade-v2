import { useEffect, useRef, useState } from "react";
import { idleBreath, squishStretch } from "./chicken-road-physics";

const GLIDE_MS = 580;

export type ChickenMotorState = {
  left: number;
  scaleX: number;
  scaleY: number;
  liftY: number;
};

/**
 * Drives the chicken's horizontal position with a smooth glide animation.
 *
 * Key stability guarantees:
 * - targetLeft changes are debounced: we only start a new glide when the
 *   incoming target differs from the COMMITTED target by >= 8 px AND the
 *   value has been stable for at least one rAF tick.  This breaks the
 *   scroll -> remeasure -> new targetLeft -> re-glide feedback loop that
 *   caused the chicken to oscillate between sewers 4-6.
 * - While a glide is in flight we ignore any new targetLeft that is
 *   within 8 px of either the current display position OR the in-flight
 *   destination, preventing micro-jitter from measurement drift.
 * - The idle-breath loop only runs when no glide is active, so it can
 *   never interfere with positional animation.
 */
export function useChickenMotor(
  targetLeft: number,
  hopping: boolean,
  laneWidth: number,
  enabled: boolean,
): ChickenMotorState {
  const [state, setState] = useState<ChickenMotorState>({
    left: targetLeft,
    scaleX: 1,
    scaleY: 1,
    liftY: 0,
  });

  // The position the motor has visually committed to (end of last glide or snap).
  const committedLeftRef = useRef(targetLeft);
  // The destination of the current in-flight glide (or same as committed if idle).
  const destLeftRef = useRef(targetLeft);
  // Whether a glide rAF loop is currently running.
  const glidingRef = useRef(false);
  // rAF handle for the active glide.
  const glideRafRef = useRef(0);
  // rAF handle for the idle-breath loop.
  const breathRafRef = useRef(0);

  // -- Reset on enable/disable -----------------------------------------------
  useEffect(() => {
    committedLeftRef.current = targetLeft;
    destLeftRef.current = targetLeft;
    glidingRef.current = false;
    cancelAnimationFrame(glideRafRef.current);
    cancelAnimationFrame(breathRafRef.current);
    setState(s => ({ ...s, left: targetLeft, liftY: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // -- Glide to new targetLeft ------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    const THRESHOLD = 8; // px -- ignore changes smaller than this

    // Skip if the new target is too close to where we already are or where
    // we're already heading.  This is the primary oscillation guard.
    const distFromCommitted = Math.abs(committedLeftRef.current - targetLeft);
    const distFromDest = Math.abs(destLeftRef.current - targetLeft);

    if (distFromCommitted < THRESHOLD && distFromDest < THRESHOLD && !hopping) {
      return;
    }

    // If we're already gliding to essentially the same destination, don't
    // restart the animation -- just let it finish.
    if (glidingRef.current && distFromDest < THRESHOLD) {
      return;
    }

    // Cancel any running glide and breath loops.
    cancelAnimationFrame(glideRafRef.current);
    cancelAnimationFrame(breathRafRef.current);

    const fromLeft = committedLeftRef.current;
    destLeftRef.current = targetLeft;
    glidingRef.current = true;
    const start = performance.now();

    const tick = (now: number) => {
      const rawT = Math.min(1, (now - start) / GLIDE_MS);
      // Smooth ease-out (quadratic) -- no elastic bounce.
      const eased = 1 - (1 - rawT) * (1 - rawT);
      const left = fromLeft + (targetLeft - fromLeft) * eased;

      let scaleX = 1;
      let scaleY = 1;

      if (hopping && rawT < 1) {
        const squish = squishStretch(rawT);
        scaleX = squish.scaleX;
        scaleY = squish.scaleY;
      } else if (!hopping) {
        const breath = idleBreath(now);
        scaleX = breath.scaleX;
        scaleY = breath.scaleY;
      }

      setState({ left, scaleX, scaleY, liftY: 0 });

      if (rawT < 1) {
        glideRafRef.current = requestAnimationFrame(tick);
      } else {
        // Glide complete -- commit the final position.
        glidingRef.current = false;
        committedLeftRef.current = targetLeft;
        destLeftRef.current = targetLeft;
        setState(s => ({ ...s, left: targetLeft, liftY: 0 }));
      }
    };

    glideRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(glideRafRef.current);
    };
  }, [targetLeft, hopping, laneWidth, enabled]);

  // -- Idle breath loop (only when not gliding) --------------------------------
  useEffect(() => {
    if (!enabled || hopping) return;

    const tick = (now: number) => {
      // Bail out immediately if a glide has started since this loop launched.
      if (glidingRef.current) return;
      const breath = idleBreath(now);
      setState(s => ({
        ...s,
        left: committedLeftRef.current,
        scaleX: breath.scaleX,
        scaleY: breath.scaleY,
        liftY: 0,
      }));
      breathRafRef.current = requestAnimationFrame(tick);
    };

    breathRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(breathRafRef.current);
    };
  }, [enabled, hopping, targetLeft]);

  return state;
}
