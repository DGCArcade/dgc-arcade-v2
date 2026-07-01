/** Stake-style easing & physics helpers (DOM board, not canvas game loop). */

export function elasticOut(t: number): number {
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export function sineOut(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

export function squishStretch(jumpProgress: number): { scaleX: number; scaleY: number } {
  const p = Math.min(1, Math.max(0, jumpProgress));
  return {
    scaleY: 1.35 - p * 0.35,
    scaleX: 0.75 + p * 0.25,
  };
}

export function idleBreath(nowMs: number): { scaleX: number; scaleY: number } {
  const wobble = Math.sin(nowMs * 0.007) * 0.03;
  return { scaleY: 1 + wobble, scaleX: 1 - wobble * 0.33 };
}

export type BurstParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  glow: boolean;
};

export type BurstDebris = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  size: number;
  color: string;
};

const BURST_COLORS = ["#ff3e3e", "#ff7b00", "#ffb300", "#ffffff", "#FC8181"];

export function spawnCrashBurst(
  particles: BurstParticle[],
  debris: BurstDebris[],
  originX: number,
  originY: number,
  intensity = 1,
) {
  const count = Math.floor(36 * intensity);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (3 + Math.random() * 8) * intensity;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 4,
      color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)]!,
      alpha: 1,
      decay: 0.018 + Math.random() * 0.028,
      glow: true,
    });
  }
  for (let i = 0; i < Math.floor(10 * intensity); i++) {
    debris.push({
      x: originX,
      y: originY,
      vx: (Math.random() - 0.5) * 10 * intensity,
      vy: -Math.random() * 8 - 4,
      angle: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      size: 5 + Math.random() * 8,
      color: i % 2 === 0 ? "#4a5568" : "#213743",
    });
  }
}

export function stepBurstPhysics(
  particles: BurstParticle[],
  debris: BurstDebris[],
  height: number,
): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.vx *= 0.98;
    p.alpha -= p.decay;
    if (p.alpha <= 0) particles.splice(i, 1);
  }
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]!;
    d.x += d.vx;
    d.y += d.vy;
    d.vy += 0.25;
    d.angle += d.va;
    if (d.y > height + 40) debris.splice(i, 1);
  }
}

export function nextShakeOffset(intensity: number): { x: number; y: number; intensity: number } {
  if (intensity < 0.2) return { x: 0, y: 0, intensity: 0 };
  return {
    x: (Math.random() - 0.5) * intensity,
    y: (Math.random() - 0.5) * intensity,
    intensity: intensity * 0.9,
  };
}
