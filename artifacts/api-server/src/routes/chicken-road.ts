import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, chickenRoadSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { requireLocationVerified } from "../middlewares/location.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { recordTournamentWager } from "../lib/tournament-tracker.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { 
  generateChickenRoadMatrix, 
  calculateMultiplier, 
  TIER_CONFIGS, 
  normalizeTier,
  CROSS_TILE_INDEX,
  LANES,
  TILES_PER_LANE,
  verifyChickenRoadSession,
  type DifficultyTier,
} from "../lib/chicken-road-engine.js";

export const chickenRoadRouter = Router();

// POST /api/chicken-road/initialize
chickenRoadRouter.post("/initialize", requireAuth, requireLocationVerified, async (req, res) => {
  const { gameId, amount, tier: rawTier = "medium", clientSeed: rawClientSeed } = req.body;

  if (!gameId || !amount || amount <= 0) {
    res.status(400).json({ error: "gameId and amount required" });
    return;
  }

  let tier: DifficultyTier;
  try {
    tier = normalizeTier(String(rawTier));
  } catch {
    res.status(400).json({ error: "Invalid difficulty tier" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const { totalBalance } = await getUserBalance(user.id);
    if (totalBalance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const existing = await db.select().from(chickenRoadSessionsTable)
      .where(and(eq(chickenRoadSessionsTable.userId, req.user!.userId), eq(chickenRoadSessionsTable.status, "active")))
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "Active session exists. Cashout or bust first.", sessionId: existing[0].id });
      return;
    }

    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }

    // Deduct balance
    const finalBalance = await deductBalance(user.id, amount);

    // Cryptographic Generation
    const serverSeed = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, ""); // 64-byte secure hex
    const clientSeed = rawClientSeed || "chicken-road";
    const nonce = 1;

    // Deterministic Byte-to-Grid Mapping
    const matrix = generateChickenRoadMatrix(serverSeed, clientSeed, nonce, tier);

    const [session] = await db.insert(chickenRoadSessionsTable).values({
      userId: user.id,
      gameId: game.id,
      bet: String(amount),
      serverSeed,
      clientSeed,
      nonce,
      tier,
      matrix: JSON.stringify(matrix),
      revealed: JSON.stringify([]),
      status: "active",
      currentMultiplier: "1",
    }).returning();

    // Do NOT expose the serverSeed yet. Expose its SHA-256 hash.
    const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");

    res.json({
      sessionId: session.id,
      balance: finalBalance,
      serverSeedHash,
      clientSeed,
      nonce,
      tier,
      tierLabel: TIER_CONFIGS[tier].label,
      lanes: LANES,
      crossTileIndex: CROSS_TILE_INDEX,
      status: "active",
      currentMultiplier: 1,
      multipliers: Array.from({ length: LANES }, (_, i) => calculateMultiplier(tier, i)),
    });

  } catch (err) {
    req.log.error({ err }, "Chicken Road initialize error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chicken-road/progress
chickenRoadRouter.post("/progress", requireAuth, requireLocationVerified, async (req, res) => {
  const { sessionId, laneIndex, tileIndex: rawTile } = req.body;
  const tileIndex = rawTile !== undefined ? Number(rawTile) : CROSS_TILE_INDEX;

  if (!sessionId || laneIndex === undefined) {
    res.status(400).json({ error: "sessionId and laneIndex required" });
    return;
  }

  // Only the fixed crosswalk tile is valid — prevents client from picking safe tiles
  if (tileIndex !== CROSS_TILE_INDEX) {
    res.status(400).json({ error: "Invalid cross position" });
    return;
  }

  const laneNum = Number(laneIndex);
  if (!Number.isInteger(laneNum) || laneNum < 0) {
    res.status(400).json({ error: "Invalid lane index" });
    return;
  }

  try {
    const [session] = await db.select().from(chickenRoadSessionsTable)
      .where(and(eq(chickenRoadSessionsTable.id, sessionId), eq(chickenRoadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status !== "active") { res.status(400).json({ error: "Session is not active" }); return; }

    const revealed: number[] = JSON.parse(session.revealed);
    
    // Validate lane sequence — strict order, no skipping or replay
    if (laneNum !== revealed.length) {
      res.status(400).json({ error: `Must play lane ${revealed.length} next` });
      return;
    }
    
    if (laneNum >= LANES) {
      res.status(400).json({ error: "Game completed all lanes" });
      return;
    }
    
    if (tileIndex < 0 || tileIndex >= TILES_PER_LANE) {
      res.status(400).json({ error: "Invalid tile index" });
      return;
    }

    const matrix: number[][] = JSON.parse(session.matrix);
    const laneCars = matrix[laneNum];
    
    // Check for collision (Bust)
    if (laneCars.includes(tileIndex)) {
      revealed.push(tileIndex);
      
      await db.update(chickenRoadSessionsTable)
        .set({ 
          status: "lost", 
          revealed: JSON.stringify(revealed) 
        })
        .where(eq(chickenRoadSessionsTable.id, session.id));

      await db.insert(betsTable).values({
        userId: session.userId,
        gameId: session.gameId,
        amount: session.bet,
        payout: "0",
        won: false,
        multiplier: "0",
        serverSeed: session.serverSeed,
        serverSeedHash: createHash("sha256").update(session.serverSeed).digest("hex"),
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        meta: { matrix, revealed, result: "bust", tier: session.tier },
      });

      // Fire and forget wager tracking
      recordTournamentWager(session.userId, parseFloat(session.bet), req.log).catch(() => {});

      res.json({
        status: "lost",
        laneIndex: laneNum,
        tileIndex,
        isCar: true,
        matrix, // Reveal full board on loss
        serverSeed: session.serverSeed, // Reveal seed on game over
      });
      return;
    }

    // Success - Path is clear
    revealed.push(tileIndex);
    const newMultiplier = calculateMultiplier(session.tier as DifficultyTier, laneNum);
    
    // If completed all lanes, auto-cashout
    if (revealed.length === LANES) {
      const payout = parseFloat(session.bet) * newMultiplier;
      const finalBalance = await creditBalance(session.userId, payout);

      await db.update(chickenRoadSessionsTable)
        .set({ 
          status: "won", 
          revealed: JSON.stringify(revealed),
          currentMultiplier: String(newMultiplier)
        })
        .where(eq(chickenRoadSessionsTable.id, session.id));

      await db.insert(betsTable).values({
        userId: session.userId,
        gameId: session.gameId,
        amount: session.bet,
        payout: String(payout),
        won: true,
        multiplier: String(newMultiplier),
        serverSeed: session.serverSeed,
        serverSeedHash: createHash("sha256").update(session.serverSeed).digest("hex"),
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        meta: { matrix, revealed, result: "completed", tier: session.tier },
      });

      recordTournamentWager(session.userId, parseFloat(session.bet), req.log).catch(() => {});

      res.json({
        status: "won",
        laneIndex: laneNum,
        tileIndex,
        isCar: false,
        multiplier: newMultiplier,
        payout,
        balance: finalBalance,
        matrix, // Reveal full board on win
        serverSeed: session.serverSeed, // Reveal seed on game over
      });
      return;
    }

    // Continue game — do NOT expose matrix while active
    await db.update(chickenRoadSessionsTable)
      .set({ 
        revealed: JSON.stringify(revealed),
        currentMultiplier: String(newMultiplier)
      })
      .where(eq(chickenRoadSessionsTable.id, session.id));

    res.json({
      status: "active",
      laneIndex: laneNum,
      tileIndex,
      isCar: false,
      multiplier: newMultiplier
    });

  } catch (err) {
    req.log.error({ err }, "Chicken Road progress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chicken-road/settle
chickenRoadRouter.post("/settle", requireAuth, requireLocationVerified, async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  try {
    const [session] = await db.select().from(chickenRoadSessionsTable)
      .where(and(eq(chickenRoadSessionsTable.id, sessionId), eq(chickenRoadSessionsTable.userId, req.user!.userId)))
      .limit(1);

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status !== "active") { res.status(400).json({ error: "Session is not active" }); return; }

    const revealed: number[] = JSON.parse(session.revealed);
    
    // Cannot cashout on step 0
    if (revealed.length === 0) {
      res.status(400).json({ error: "Cannot cashout before making a move" });
      return;
    }

    const multiplier = parseFloat(session.currentMultiplier);
    const payout = parseFloat(session.bet) * multiplier;
    
    const finalBalance = await creditBalance(session.userId, payout);

    const matrix: number[][] = JSON.parse(session.matrix);

    await db.update(chickenRoadSessionsTable)
      .set({ status: "won" })
      .where(eq(chickenRoadSessionsTable.id, session.id));

    await db.insert(betsTable).values({
      userId: session.userId,
      gameId: session.gameId,
      amount: session.bet,
      payout: String(payout),
      won: true,
      multiplier: String(multiplier),
      serverSeed: session.serverSeed,
      serverSeedHash: createHash("sha256").update(session.serverSeed).digest("hex"),
      clientSeed: session.clientSeed,
      nonce: session.nonce,
      meta: { matrix, revealed, result: "cashed_out", tier: session.tier },
    });

    recordTournamentWager(session.userId, parseFloat(session.bet), req.log).catch(() => {});

    res.json({
      status: "won",
      multiplier,
      payout,
      balance: finalBalance,
      matrix, // Reveal full board on cashout
      serverSeed: session.serverSeed, // Reveal seed on game over
    });

  } catch (err) {
    req.log.error({ err }, "Chicken Road settle error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/chicken-road/verify/:sessionId — provably fair verification
chickenRoadRouter.get("/verify/:sessionId", async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }
    const [session] = await db.select().from(chickenRoadSessionsTable)
      .where(eq(chickenRoadSessionsTable.id, sessionId))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.status === "active") {
      res.status(400).json({ error: "Session still active — seed revealed after game ends" });
      return;
    }
    const tier = normalizeTier(session.tier);
    const result = verifyChickenRoadSession(session.serverSeed, session.clientSeed ?? "chicken-road", session.nonce, tier);
    const storedMatrix: number[][] = JSON.parse(session.matrix);
    const matrixMatch = JSON.stringify(result.matrix) === JSON.stringify(storedMatrix);
    res.json({
      ...result,
      matrixMatch,
      storedMatrix,
      revealed: JSON.parse(session.revealed),
    });
  } catch (err) {
    req.log.error({ err }, "Chicken Road verify error");
    res.status(500).json({ error: "Internal server error" });
  }
});
