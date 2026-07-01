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
  generateChickenRoadLayout,
  calculateMultiplier,
  getMultiplierTable,
  maxStepsForTier,
  TIER_CONFIGS,
  normalizeTier,
  parseLayout,
  verifyChickenRoadSession,
  type DifficultyTier,
  RTP,
} from "../lib/chicken-road-engine.js";
import { cached } from "../lib/response-cache.js";

export const chickenRoadRouter = Router();

// GET /api/chicken-road/session — resume active session for logged-in user
chickenRoadRouter.get("/session", requireAuth, async (req, res) => {
  try {
    const [session] = await db.select().from(chickenRoadSessionsTable)
      .where(and(eq(chickenRoadSessionsTable.userId, req.user!.userId), eq(chickenRoadSessionsTable.status, "active")))
      .limit(1);

    if (!session) {
      res.json({ session: null });
      return;
    }

    const tier = normalizeTier(session.tier);
    const revealed: number[] = JSON.parse(session.revealed);
    const serverSeedHash = createHash("sha256").update(session.serverSeed).digest("hex");

    res.json({
      session: {
        sessionId: session.id,
        serverSeedHash,
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        tier,
        tierLabel: TIER_CONFIGS[tier].label,
        maxSteps: maxStepsForTier(tier),
        currentLane: revealed.length,
        currentMultiplier: parseFloat(session.currentMultiplier),
        bet: parseFloat(session.bet),
        multipliers: getMultiplierTable(tier),
        status: "active",
      },
    });
  } catch (err) {
    req.log.error({ err }, "Chicken Road session fetch error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/chicken-road/config — public preview multipliers per tier (Stake guest-mode board)
chickenRoadRouter.get("/config", async (_req, res) => {
  const payload = await cached("chicken-road-config", 60_000, async () => {
    const tiers = (Object.keys(TIER_CONFIGS) as DifficultyTier[]).map(tier => ({
      tier,
      label: TIER_CONFIGS[tier].label,
      deaths: TIER_CONFIGS[tier].deaths,
      maxSteps: maxStepsForTier(tier),
      multipliers: getMultiplierTable(tier),
    }));
    return { rtp: RTP, positions: 20, tiers };
  });
  res.json(payload);
});

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

    const finalBalance = await deductBalance(user.id, amount);

    const serverSeed = uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "");
    const clientSeed = rawClientSeed || "chicken-road";
    const nonce = 1;

    const layout = generateChickenRoadLayout(serverSeed, clientSeed, nonce, tier);
    const maxSteps = maxStepsForTier(tier);

    const [session] = await db.insert(chickenRoadSessionsTable).values({
      userId: user.id,
      gameId: game.id,
      bet: String(amount),
      serverSeed,
      clientSeed,
      nonce,
      tier,
      matrix: JSON.stringify(layout),
      revealed: JSON.stringify([]),
      status: "active",
      currentMultiplier: "1",
    }).returning();

    const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");

    res.json({
      sessionId: session.id,
      balance: finalBalance,
      serverSeedHash,
      clientSeed,
      nonce,
      tier,
      tierLabel: TIER_CONFIGS[tier].label,
      maxSteps,
      rtp: RTP,
      status: "active",
      currentMultiplier: 1,
      multipliers: getMultiplierTable(tier),
    });

  } catch (err) {
    req.log.error({ err }, "Chicken Road initialize error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/chicken-road/progress
chickenRoadRouter.post("/progress", requireAuth, requireLocationVerified, async (req, res) => {
  const { sessionId, laneIndex } = req.body;

  if (!sessionId || laneIndex === undefined) {
    res.status(400).json({ error: "sessionId and laneIndex required" });
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

    const tier = normalizeTier(session.tier);
    const maxSteps = maxStepsForTier(tier);
    const revealed: number[] = JSON.parse(session.revealed);

    if (laneNum !== revealed.length) {
      res.status(400).json({ error: `Must play lane ${revealed.length} next` });
      return;
    }

    if (laneNum >= maxSteps) {
      res.status(400).json({ error: "All lanes completed — cash out" });
      return;
    }

    const layout = parseLayout(session.matrix);
    const isDeath = layout.deathSteps.includes(laneNum);
    const hazardType = layout.hazardTypes[laneNum] ?? "car";

    if (isDeath) {
      revealed.push(laneNum);

      await db.update(chickenRoadSessionsTable)
        .set({ status: "lost", revealed: JSON.stringify(revealed) })
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
        meta: { layout, revealed, result: "bust", tier: session.tier, hazardType },
      });

      recordTournamentWager(session.userId, parseFloat(session.bet), req.log).catch(() => {});

      res.json({
        status: "lost",
        laneIndex: laneNum,
        isDeath: true,
        hazardType,
        layout,
        serverSeed: session.serverSeed,
      });
      return;
    }

    revealed.push(laneNum);
    const newMultiplier = calculateMultiplier(tier, laneNum);

    if (revealed.length === maxSteps) {
      const payout = parseFloat(session.bet) * newMultiplier;
      const finalBalance = await creditBalance(session.userId, payout);

      await db.update(chickenRoadSessionsTable)
        .set({ status: "won", revealed: JSON.stringify(revealed), currentMultiplier: String(newMultiplier) })
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
        meta: { layout, revealed, result: "completed", tier: session.tier },
      });

      recordTournamentWager(session.userId, parseFloat(session.bet), req.log).catch(() => {});

      res.json({
        status: "won",
        laneIndex: laneNum,
        isDeath: false,
        multiplier: newMultiplier,
        payout,
        balance: finalBalance,
        layout,
        serverSeed: session.serverSeed,
      });
      return;
    }

    await db.update(chickenRoadSessionsTable)
      .set({ revealed: JSON.stringify(revealed), currentMultiplier: String(newMultiplier) })
      .where(eq(chickenRoadSessionsTable.id, session.id));

    res.json({
      status: "active",
      laneIndex: laneNum,
      isDeath: false,
      multiplier: newMultiplier,
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

    if (revealed.length === 0) {
      res.status(400).json({ error: "Cannot cashout before making a move" });
      return;
    }

    const multiplier = parseFloat(session.currentMultiplier);
    const payout = parseFloat(session.bet) * multiplier;
    const finalBalance = await creditBalance(session.userId, payout);
    const layout = parseLayout(session.matrix);

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
      meta: { layout, revealed, result: "cashed_out", tier: session.tier },
    });

    recordTournamentWager(session.userId, parseFloat(session.bet), req.log).catch(() => {});

    res.json({
      status: "won",
      multiplier,
      payout,
      balance: finalBalance,
      layout,
      serverSeed: session.serverSeed,
    });

  } catch (err) {
    req.log.error({ err }, "Chicken Road settle error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/chicken-road/verify/:sessionId
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
    const storedLayout = parseLayout(session.matrix);
    const layoutMatch =
      JSON.stringify(storedLayout.deathSteps) === JSON.stringify(result.deathSteps) &&
      JSON.stringify(storedLayout.hazardTypes) === JSON.stringify(result.hazardTypes);
    res.json({
      ...result,
      hashValid: true,
      layoutMatch,
      storedLayout,
      revealed: JSON.parse(session.revealed),
      verifyUrl: `/chicken-road-verify.html`,
    });
  } catch (err) {
    req.log.error({ err }, "Chicken Road verify error");
    res.status(500).json({ error: "Internal server error" });
  }
});
