import { createHmac, createHash } from "crypto";

/**
 * Stake Chicken–aligned provably fair engine
 * - 20 positions, Fisher-Yates death placement (1/3/5/10 deaths by tier)
 * - Multipliers: 98% RTP via cumulative survival (same math as Stake Mines-style)
 * - SHA-256(serverSeed) commit before play
 */

export const POSITIONS = 20;
export const RTP = 0.98;

export const TIER_CONFIGS = {
  easy: { deaths: 1, label: "Easy", maxSteps: 19 },
  medium: { deaths: 3, label: "Medium", maxSteps: 17 },
  hard: { deaths: 5, label: "Hard", maxSteps: 15 },
  extreme: { deaths: 10, label: "Expert", maxSteps: 10 },
} as const;

export type DifficultyTier = keyof typeof TIER_CONFIGS;
export type HazardType = "car" | "manhole";

export type ChickenRoadLayout = {
  deathSteps: number[];
  hazardTypes: Record<number, HazardType>;
};

const TIER_ALIASES: Record<string, DifficultyTier> = {
  low: "easy",
  easy: "easy",
  medium: "medium",
  high: "hard",
  hard: "hard",
  max: "extreme",
  extreme: "extreme",
  expert: "extreme",
};

export function normalizeTier(tier: string): DifficultyTier {
  const key = TIER_ALIASES[tier.toLowerCase()];
  if (!key) throw new Error("Invalid difficulty tier");
  return key;
}

export function maxStepsForTier(tier: DifficultyTier): number {
  return TIER_CONFIGS[tier].maxSteps;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stake-aligned multiplier after surviving step `step` (0-indexed) */
export function calculateMultiplier(tier: DifficultyTier, step: number): number {
  if (step < 0) return 1.0;
  const deaths = TIER_CONFIGS[tier].deaths;
  const total = POSITIONS;
  const safe = total - deaths;
  let survival = 1;
  for (let i = 0; i <= step; i++) {
    survival *= (safe - i) / (total - i);
  }
  const mult = RTP / survival;
  if (mult >= 1000) return Math.round(mult * 10) / 10;
  return Math.round(mult * 100) / 100;
}

export function getMultiplierTable(tier: DifficultyTier): number[] {
  const steps = maxStepsForTier(tier);
  return Array.from({ length: steps }, (_, i) => calculateMultiplier(tier, i));
}

function createHmacByteStream(serverSeed: string, message: string) {
  let hash = createHmac("sha512", serverSeed).update(message).digest("hex");
  let hashIndex = 0;
  let round = 0;

  return function nextInt(max: number): number {
    if (max <= 0) return 0;
    if (hashIndex + 8 > hash.length) {
      round += 1;
      hash = createHmac("sha512", serverSeed).update(`${message}:r${round}`).digest("hex");
      hashIndex = 0;
    }
    const segment = hash.substring(hashIndex, hashIndex + 8);
    hashIndex += 8;
    return parseInt(segment, 16) % max;
  };
}

/** Fisher-Yates shuffle — first N shuffled indices become death lanes */
export function generateChickenRoadLayout(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  tier: DifficultyTier
): ChickenRoadLayout {
  const deaths = TIER_CONFIGS[tier].deaths;
  const message = `${clientSeed}:${nonce}:chicken-road`;
  const nextInt = createHmacByteStream(serverSeed, message);

  const indices = Array.from({ length: POSITIONS }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = nextInt(i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const deathSteps = indices.slice(0, deaths).sort((a, b) => a - b);
  const hazardTypes: Record<number, HazardType> = {};
  for (const step of deathSteps) {
    hazardTypes[step] = nextInt(2) === 0 ? "car" : "manhole";
  }

  return { deathSteps, hazardTypes };
}

/** @deprecated use generateChickenRoadLayout */
export function generateChickenRoadMatrix(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  tier: DifficultyTier
): ChickenRoadLayout {
  return generateChickenRoadLayout(serverSeed, clientSeed, nonce, tier);
}

export function parseLayout(matrixJson: string): ChickenRoadLayout {
  const parsed = JSON.parse(matrixJson);
  if (parsed.deathSteps) {
    return {
      deathSteps: parsed.deathSteps,
      hazardTypes: parsed.hazardTypes ?? {},
    };
  }
  // Legacy per-lane tile matrix — treat lane index as death if cross tile is hazardous
  const legacy: number[][] = parsed;
  const deathSteps: number[] = [];
  const hazardTypes: Record<number, HazardType> = {};
  legacy.forEach((laneCars, lane) => {
    if (laneCars?.includes(2)) {
      deathSteps.push(lane);
      hazardTypes[lane] = "car";
    }
  });
  return { deathSteps, hazardTypes };
}

export function verifyChickenRoadSession(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  tier: DifficultyTier
) {
  const serverSeedHash = sha256Hex(serverSeed);
  const layout = generateChickenRoadLayout(serverSeed, clientSeed, nonce, tier);
  return {
    valid: true,
    serverSeedHash,
    algorithm:
      "Fisher-Yates on 20 positions via HMAC-SHA512(serverSeed, clientSeed:nonce:chicken-road); SHA-256 commit; 98% RTP multipliers",
    ...layout,
    maxSteps: maxStepsForTier(tier),
    tier,
    rtp: RTP,
    multipliers: getMultiplierTable(tier),
  };
}

// Legacy exports for routes still importing these names
export const LANES = POSITIONS;
export const TILES_PER_LANE = 1;
export const CROSS_TILE_INDEX = 0;
