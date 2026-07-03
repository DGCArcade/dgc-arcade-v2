import { createHmac } from "crypto";

/**
 * Advanced Cryptographic Engine for Chicken Road
 * Uses HMAC-SHA512 to generate deterministic grid matrices.
 */

// Difficulty tiers
export const TIER_CONFIGS = {
  easy: { cars: 1, safe: 4, label: "Easy (1 Car)" },
  medium: { cars: 2, safe: 3, label: "Medium (2 Cars)" },
  hard: { cars: 3, safe: 2, label: "Hard (3 Cars)" },
  extreme: { cars: 4, safe: 1, label: "Extreme (4 Cars)" },
} as const;

export type DifficultyTier = keyof typeof TIER_CONFIGS;

export const LANES = 10;
export const TILES_PER_LANE = 5;

/**
 * Calculates the multiplier for a given difficulty tier and step (lane index).
 * Step is 0-indexed (0 to 9).
 * Formula: Multiplier_Step(n) = (Prev_Multiplier * (5 / safe_tiles)) * 0.99
 */
export function calculateMultiplier(tier: DifficultyTier, step: number): number {
  if (step < 0) return 1.0;
  
  const safeTiles = TIER_CONFIGS[tier].safe;
  let multiplier = 1.0;
  
  for (let i = 0; i <= step; i++) {
    multiplier = (multiplier * (TILES_PER_LANE / safeTiles)) * 0.99;
  }
  
  return multiplier;
}

/**
 * Generates the deterministic matrix of cars (hazards) for the game.
 * 
 * Algorithm:
 * 1. Hash string = HMAC_SHA512(Key = Server_Seed, Message = Client_Seed + ":" + Nonce).
 * 2. Divide the 128-character hex string into distinct 4-byte segments (8 hex characters each).
 * 3. Convert each segment to an integer and apply modulo operation matching the tile count (5)
 *    to place the 'Cars' (Hazards).
 * 
 * Returns an array of length 10 (lanes), where each element is an array of car positions (0-4).
 */
export function generateChickenRoadMatrix(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  tier: DifficultyTier
): number[][] {
  const carsPerLane = TIER_CONFIGS[tier].cars;
  const message = `${clientSeed}:${nonce}`;
  
  // 1. Generate HMAC-SHA512 hash
  const hash = createHmac("sha512", serverSeed).update(message).digest("hex");
  
  const matrix: number[][] = [];
  
  // 2 & 3. Parse bytes to generate grid
  let hashIndex = 0;
  
  for (let lane = 0; lane < LANES; lane++) {
    const laneCars: number[] = [];
    
    // Keep generating car positions until we have the required amount for this tier
    while (laneCars.length < carsPerLane) {
      // If we run out of hash characters (unlikely but possible), append a salt and rehash
      if (hashIndex + 8 > hash.length) {
        const rehash = createHmac("sha512", serverSeed)
          .update(message + ":" + lane + ":" + laneCars.length)
          .digest("hex");
        
        // We just need a few more bytes, so we can use the start of the new hash
        const segment = rehash.substring(0, 8);
        const intValue = parseInt(segment, 16);
        const pos = intValue % TILES_PER_LANE;
        
        if (!laneCars.includes(pos)) {
          laneCars.push(pos);
        }
        break; // Break to avoid infinite loops if something goes wrong, though rehash should fix it
      }
      
      const segment = hash.substring(hashIndex, hashIndex + 8);
      hashIndex += 8;
      
      const intValue = parseInt(segment, 16);
      const pos = intValue % TILES_PER_LANE;
      
      // Ensure unique car positions within the lane
      if (!laneCars.includes(pos)) {
        laneCars.push(pos);
      }
    }
    
    // Sort for consistency
    laneCars.sort((a, b) => a - b);
    matrix.push(laneCars);
  }
  
  return matrix;
}
