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

/**
 * Vertical hop arc: 0 at take-off and touchdown, 1 at the apex (t = 0.5).
 * Slightly front-loaded so the jump feels punchy on take-off.
 */
export function hopArc(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return Math.sin(Math.PI * Math.pow(p, 0.88));
}

/**
 * Squash & stretch while airborne:
 * - 0.00-0.14  anticipation crouch (wide + short)
 * - 0.14-0.55  take-off stretch (tall + narrow), peaking mid-air
 * - 0.55-1.00  relax back toward neutral before touchdown
 */
export function hopSquish(jumpProgress: number): { scaleX: number; scaleY: number } {
  const p = Math.min(1, Math.max(0, jumpProgress));
  if (p < 0.14) {
    const c = p / 0.14;
    return { scaleX: 1 + 0.18 * c, scaleY: 1 - 0.2 * c };
  }
  if (p < 0.55) {
    const c = (p - 0.14) / 0.41;
    const s = Math.sin(c * Math.PI * 0.5);
    return { scaleX: 1.18 - 0.3 * s, scaleY: 0.8 + 0.34 * s };
  }
  const c = (p - 0.55) / 0.45;
  return { scaleX: 0.88 + 0.12 * c, scaleY: 1.14 - 0.14 * c };
}

/**
 * Elastic landing squash right after touchdown: hard squash that springs
 * back to neutral with a tiny overshoot.
 */
export function landingSquish(landProgress: number): { scaleX: number; scaleY: number } {
  const p = Math.min(1, Math.max(0, landProgress));
  // Damped bounce: strong initial squash decaying to zero.
  const wave = Math.sin(p * Math.PI) * (1 - p * 0.55);
  return { scaleX: 1 + 0.22 * wave, scaleY: 1 - 0.26 * wave };
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
