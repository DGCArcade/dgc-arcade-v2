/** Stake-aligned multiplier tables — mirrors server chicken-road-engine.ts */

export const POSITIONS = 20;
export const RTP = 0.98;

export const STAKE_TIERS = {
  easy:   { deaths: 1,  maxSteps: 19, label: "Easy",   desc: "1 death · 19 lanes" },
  medium: { deaths: 3,  maxSteps: 17, label: "Medium", desc: "3 deaths · 17 lanes" },
  hard:   { deaths: 5,  maxSteps: 15, label: "Hard",   desc: "5 deaths · 15 lanes" },
  expert: { deaths: 10, maxSteps: 10, label: "Expert", desc: "10 deaths · 10 lanes" },
} as const;

export type StakeTier = keyof typeof STAKE_TIERS;

const TIER_ALIASES: Record<string, StakeTier> = {
  low: "easy", easy: "easy",
  medium: "medium",
  high: "hard", hard: "hard",
  max: "expert", extreme: "expert", expert: "expert",
};

export function normalizeStakeTier(tier: string): StakeTier {
  return TIER_ALIASES[tier.toLowerCase()] ?? "medium";
}

export function calculateStakeMultiplier(tier: StakeTier, step: number): number {
  if (step < 0) return 1.0;
  const deaths = STAKE_TIERS[tier].deaths;
  const safe = POSITIONS - deaths;
  let survival = 1;
  for (let i = 0; i <= step; i++) {
    survival *= (safe - i) / (POSITIONS - i);
  }
  const mult = RTP / survival;
  if (mult >= 1000) return Math.round(mult * 10) / 10;
  return Math.round(mult * 100) / 100;
}

export function getStakeMultiplierTable(tier: StakeTier): number[] {
  const steps = STAKE_TIERS[tier].maxSteps;
  return Array.from({ length: steps }, (_, i) => calculateStakeMultiplier(tier, i));
}

/** Cumulative survival % from `fromLane` through crossing `toLane` (exclusive end step index). */
export function getSurvivalChancePercent(tier: StakeTier, fromLane: number, toLane: number): number {
  if (toLane <= fromLane) return 100;
  const deaths = STAKE_TIERS[tier].deaths;
  const safe = POSITIONS - deaths;
  let survival = 1;
  for (let step = fromLane; step < toLane; step++) {
    survival *= (safe - step) / (POSITIONS - step);
  }
  return survival * 100;
}
