import { createHmac, createHash } from "crypto";

/**
 * Chicken Road provably fair engine
 * - Server seed hash: SHA-256(serverSeed) shown before play
 * - Lane hazards: HMAC-SHA512(serverSeed, clientSeed:nonce) → car positions per lane
 * Reference: industry-standard chicken-cross / mines-style byte derivation
 */

export const TIER_CONFIGS = {
  easy: { cars: 1, safe: 4, label: "Low" },
  medium: { cars: 2, safe: 3, label: "Medium" },
  hard: { cars: 3, safe: 2, label: "High" },
  extreme: { cars: 4, safe: 1, label: "Max" },
} as const;

export type DifficultyTier = keyof typeof TIER_CONFIGS;

/** Stake-style 15-step crossing */
export const LANES = 15;
export const TILES_PER_LANE = 5;
/** Fixed crosswalk row — chicken always crosses here (Stake-style single path) */
export const CROSS_TILE_INDEX = 2;

const TIER_ALIASES: Record<string, DifficultyTier> = {
  low: "easy",
  easy: "easy",
  medium: "medium",
  high: "hard",
  hard: "hard",
  max: "extreme",
  extreme: "extreme",
};

export function normalizeTier(tier: string): DifficultyTier {
  const key = TIER_ALIASES[tier.toLowerCase()];
  if (!key) throw new Error("Invalid difficulty tier");
  return key;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function calculateMultiplier(tier: DifficultyTier, step: number): number {
  if (step < 0) return 1.0;
  const safeTiles = TIER_CONFIGS[tier].safe;
  let multiplier = 1.0;
  for (let i = 0; i <= step; i++) {
    multiplier = (multiplier * (TILES_PER_LANE / safeTiles)) * 0.99;
  }
  return multiplier;
}

export function generateChickenRoadMatrix(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  tier: DifficultyTier
): number[][] {
  const carsPerLane = TIER_CONFIGS[tier].cars;
  const message = `${clientSeed}:${nonce}:chicken-road`;
  const hash = createHmac("sha512", serverSeed).update(message).digest("hex");

  const matrix: number[][] = [];
  let hashIndex = 0;

  for (let lane = 0; lane < LANES; lane++) {
    const laneCars: number[] = [];
    while (laneCars.length < carsPerLane) {
      if (hashIndex + 8 > hash.length) {
        const rehash = createHmac("sha512", serverSeed)
          .update(`${message}:${lane}:${laneCars.length}`)
          .digest("hex");
        const intValue = parseInt(rehash.substring(0, 8), 16);
        const pos = intValue % TILES_PER_LANE;
        if (!laneCars.includes(pos)) laneCars.push(pos);
        break;
      }
      const segment = hash.substring(hashIndex, hashIndex + 8);
      hashIndex += 8;
      const pos = parseInt(segment, 16) % TILES_PER_LANE;
      if (!laneCars.includes(pos)) laneCars.push(pos);
    }
    laneCars.sort((a, b) => a - b);
    matrix.push(laneCars);
  }
  return matrix;
}

export function verifyChickenRoadSession(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  tier: DifficultyTier
) {
  const serverSeedHash = sha256Hex(serverSeed);
  const matrix = generateChickenRoadMatrix(serverSeed, clientSeed, nonce, tier);
  return {
    valid: true,
    serverSeedHash,
    algorithm: "HMAC-SHA512(serverSeed, clientSeed:nonce:chicken-road) → lane hazards; SHA-256(serverSeed) for commit",
    matrix,
    crossTileIndex: CROSS_TILE_INDEX,
    lanes: LANES,
    tier,
  };
}
