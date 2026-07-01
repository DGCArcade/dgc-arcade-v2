import { useEffect, useRef, useState } from "react";
import { elasticOut, idleBreath, squishStretch } from "./chicken-road-physics";

const GLIDE_MS = 580;

export type ChickenMotorState = {
  left: number;
  scaleX: number;
  scaleY: number;
  liftY: number;
};

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
  const displayLeftRef = useRef(targetLeft);
  const glidingRef = useRef(false);

  useEffect(() => {
    displayLeftRef.current = targetLeft;
    setState(s => ({ ...s, left: targetLeft }));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    const fromLeft = displayLeftRef.current;
    const start = performance.now();
    const span = Math.max(Math.abs(targetLeft - fromLeft), laneWidth * 0.45);
    glidingRef.current = true;

    const tick = (now: number) => {
      const rawT = Math.min(1, (now - start) / GLIDE_MS);
      const eased = elasticOut(rawT);
      const left = fromLeft + (targetLeft - fromLeft) * eased;
      displayLeftRef.current = left;

      const jumpProgress = Math.min(1, Math.abs(targetLeft - left) / span);
      let scaleX: number;
      let scaleY: number;
      let liftY = 0;

      if (hopping && rawT < 1) {
        const squish = squishStretch(jumpProgress);
        scaleX = squish.scaleX;
        scaleY = squish.scaleY;
        liftY = -Math.sin(rawT * Math.PI) * 20;
      } else {
        const breath = idleBreath(now);
        scaleX = breath.scaleX;
        scaleY = breath.scaleY;
      }

      setState({ left, scaleX, scaleY, liftY });

      if (rawT < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        glidingRef.current = false;
        displayLeftRef.current = targetLeft;
        setState({
          left: targetLeft,
          scaleX: 1,
          scaleY: 1,
          liftY: 0,
        });
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetLeft, hopping, laneWidth, enabled]);

  useEffect(() => {
    if (!enabled || hopping || glidingRef.current) return;
    let raf = 0;
    const tick = (now: number) => {
      if (glidingRef.current) return;
      const breath = idleBreath(now);
      setState(s => ({
        ...s,
        left: displayLeftRef.current,
        scaleX: breath.scaleX,
        scaleY: breath.scaleY,
        liftY: 0,
      }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, hopping, targetLeft]);

  return state;
}
