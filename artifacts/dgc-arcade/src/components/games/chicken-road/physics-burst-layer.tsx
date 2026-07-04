import { useEffect, useRef } from "react";
import {
  spawnCrashBurst,
  stepBurstPhysics,
  type BurstDebris,
  type BurstParticle,
} from "./chicken-road-physics";

type PhysicsBurstLayerProps = {
  /** Increment to fire a new burst at origin. */
  burstId: number;
  originX: number;
  originY: number;
  intensity?: number;
};

/** Transparent canvas overlay — neon embers + concrete shrapnel. */
export function PhysicsBurstLayer({
  burstId,
  originX,
  originY,
  intensity = 1,
}: PhysicsBurstLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<BurstParticle[]>([]);
  const debrisRef = useRef<BurstDebris[]>([]);
  const lastBurstIdRef = useRef(0);

  useEffect(() => {
    if (burstId <= 0 || burstId === lastBurstIdRef.current) return;
    lastBurstIdRef.current = burstId;
    spawnCrashBurst(particlesRef.current, debrisRef.current, originX, originY, intensity);
  }, [burstId, originX, originY, intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();
    const parent = canvas.parentElement;
    const ro = parent ? new ResizeObserver(resize) : null;
    if (parent && ro) ro.observe(parent);

    const loop = () => {
      const h = canvas.height;
      ctx.clearRect(0, 0, canvas.width, h);
      stepBurstPhysics(particlesRef.current, debrisRef.current, h);

      for (const p of particlesRef.current) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = p.glow ? 16 : 0;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const d of debrisRef.current) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = d.color;
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[45] pointer-events-none"
      aria-hidden
    />
  );
}
