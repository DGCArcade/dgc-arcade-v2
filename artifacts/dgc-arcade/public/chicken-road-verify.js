/**
 * Chicken Road provably fair verifier — matches api-server chicken-road-engine.ts
 * Fisher-Yates on 20 positions · HMAC-SHA512(serverSeed, clientSeed:nonce:chicken-road)
 */
(function () {
  const POSITIONS = 20;
  const RTP = 0.98;
  const TIER_CONFIGS = {
    easy: { deaths: 1, label: "Easy", maxSteps: 19 },
    medium: { deaths: 3, label: "Medium", maxSteps: 17 },
    hard: { deaths: 5, label: "Hard", maxSteps: 15 },
    extreme: { deaths: 10, label: "Expert", maxSteps: 10 },
    expert: { deaths: 10, label: "Expert", maxSteps: 10 },
  };

  function normalizeTier(tier) {
    const aliases = {
      low: "easy", easy: "easy", medium: "medium", high: "hard", hard: "hard",
      max: "extreme", extreme: "extreme", expert: "extreme",
    };
    const key = aliases[String(tier).toLowerCase()];
    if (!key) throw new Error("Invalid tier");
    return key;
  }

  async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function hmacSha512(key, msg) {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function createHmacByteStream(serverSeed, message) {
    let hash = null;
    let hashIndex = 0;
    let round = 0;

    return async function nextInt(max) {
      if (max <= 0) return 0;
      if (!hash || hashIndex + 8 > hash.length) {
        if (!hash) {
          hash = await hmacSha512(serverSeed, message);
        } else {
          round += 1;
          hash = await hmacSha512(serverSeed, `${message}:r${round}`);
        }
        hashIndex = 0;
      }
      const segment = hash.substring(hashIndex, hashIndex + 8);
      hashIndex += 8;
      return parseInt(segment, 16) % max;
    };
  }

  async function generateLayout(serverSeed, clientSeed, nonce, tier) {
    const deaths = TIER_CONFIGS[tier].deaths;
    const message = `${clientSeed}:${nonce}:chicken-road`;
    const nextInt = createHmacByteStream(serverSeed, message);

    const indices = Array.from({ length: POSITIONS }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = await nextInt(i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const deathSteps = indices.slice(0, deaths).sort((a, b) => a - b);
    const hazardTypes = {};
    for (const step of deathSteps) {
      hazardTypes[step] = (await nextInt(2)) === 0 ? "car" : "manhole";
    }
    return { deathSteps, hazardTypes };
  }

  async function verifyChickenRoad(serverSeed, clientSeed, nonce, tier, expectedHash) {
    const normalized = normalizeTier(tier);
    const serverSeedHash = await sha256Hex(serverSeed);
    const layout = await generateLayout(serverSeed, clientSeed, nonce, normalized);
    const hashValid = !expectedHash || expectedHash.toLowerCase() === serverSeedHash;

    return {
      valid: hashValid,
      serverSeedHash,
      hashValid,
      tier: normalized,
      tierLabel: TIER_CONFIGS[normalized].label,
      rtp: RTP,
      ...layout,
      algorithm:
        "Fisher-Yates on 20 positions via HMAC-SHA512(serverSeed, clientSeed:nonce:chicken-road); SHA-256 commit",
    };
  }

  window.verifyChickenRoad = verifyChickenRoad;
})();
