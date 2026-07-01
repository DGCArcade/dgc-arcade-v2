import { useEffect, useRef, useState } from "react";
import { nextShakeOffset } from "./chicken-road-physics";

/** Geometric screen-shake decay (Stake-style impact feedback). */
export function useScreenShake(impactPulse: number, pulseIntensity: number) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const intensityRef = useRef(0);

  useEffect(() => {
    if (impactPulse > 0 && pulseIntensity > 0) {
      intensityRef.current = Math.max(intensityRef.current, pulseIntensity);
    }
  }, [impactPulse, pulseIntensity]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { x, y, intensity } = nextShakeOffset(intensityRef.current);
      intensityRef.current = intensity;
      setOffset({ x, y });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return offset;
}
