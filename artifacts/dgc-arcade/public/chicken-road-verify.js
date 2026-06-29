/**
 * Chicken Road Provably Fair Verification Script
 * 
 * You can run this script directly in your browser console to verify 
 * that your Chicken Road game was provably fair and not tampered with.
 * 
 * Instructions:
 * 1. Open your browser console (F12 or Ctrl+Shift+I)
 * 2. Copy and paste this entire script
 * 3. Call verifyChickenRoad() with your game details
 * 
 * Example:
 * verifyChickenRoad("server_seed_here", "client_seed_here", 1, "medium")
 */

async function verifyChickenRoad(serverSeed, clientSeed, nonce, tier) {
  const TIER_CONFIGS = {
    easy: { cars: 1, safe: 4 },
    medium: { cars: 2, safe: 3 },
    hard: { cars: 3, safe: 2 },
    extreme: { cars: 4, safe: 1 },
  };

  const LANES = 10;
  const TILES_PER_LANE = 5;

  if (!TIER_CONFIGS[tier]) {
    console.error(`Invalid tier: ${tier}. Must be easy, medium, hard, or extreme.`);
    return;
  }

  const carsPerLane = TIER_CONFIGS[tier].cars;
  const message = `${clientSeed}:${nonce}`;

  console.log("==========================================");
  console.log("🐔 CHICKEN ROAD VERIFICATION 🐔");
  console.log("==========================================");
  console.log(`Server Seed: ${serverSeed}`);
  console.log(`Client Seed: ${clientSeed}`);
  console.log(`Nonce:       ${nonce}`);
  console.log(`Tier:        ${tier} (${carsPerLane} Cars per lane)`);
  console.log("------------------------------------------");

  // Helper to generate HMAC-SHA512 in the browser
  async function hmacSha512(key, msg) {
    const enc = new TextEncoder();
    const keyData = enc.encode(key);
    const msgData = enc.encode(msg);

    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  try {
    const hash = await hmacSha512(serverSeed, message);
    console.log(`HMAC-SHA512 Hash:\n${hash}\n`);

    const matrix = [];
    let hashIndex = 0;

    for (let lane = 0; lane < LANES; lane++) {
      const laneCars = [];
      
      while (laneCars.length < carsPerLane) {
        if (hashIndex + 8 > hash.length) {
          const rehash = await hmacSha512(serverSeed, message + ":" + lane + ":" + laneCars.length);
          const segment = rehash.substring(0, 8);
          const intValue = parseInt(segment, 16);
          const pos = intValue % TILES_PER_LANE;
          
          if (!laneCars.includes(pos)) {
            laneCars.push(pos);
          }
          break;
        }
        
        const segment = hash.substring(hashIndex, hashIndex + 8);
        hashIndex += 8;
        
        const intValue = parseInt(segment, 16);
        const pos = intValue % TILES_PER_LANE;
        
        if (!laneCars.includes(pos)) {
          laneCars.push(pos);
        }
      }
      
      laneCars.sort((a, b) => a - b);
      matrix.push(laneCars);
    }

    console.log("DETERMINISTIC GRID RESULT:");
    console.log("(0 = Leftmost Tile, 4 = Rightmost Tile)\n");

    for (let i = 0; i < LANES; i++) {
      const laneStr = Array.from({ length: TILES_PER_LANE }, (_, tileIdx) => {
        return matrix[i].includes(tileIdx) ? "🚗" : "✅";
      }).join(" ");
      
      console.log(`Lane ${i.toString().padStart(2, "0")}: ${laneStr}  (Cars at: ${matrix[i].join(", ")})`);
    }
    
    console.log("\n==========================================");
    console.log("Verification Complete. If this matches your");
    console.log("game history, the result was mathematically");
    console.log("fair and pre-determined before you played.");
    console.log("==========================================");

    return matrix;
  } catch (err) {
    console.error("Verification failed:", err);
  }
}
