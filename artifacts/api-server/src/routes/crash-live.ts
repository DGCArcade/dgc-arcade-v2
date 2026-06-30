import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, gamesTable, betsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { crashRoundManager, flyingMultiplier } from "../lib/crash-round-manager.js";
import { optionalAuth, requireAuth } from "../middlewares/auth.js";
import { requireLocationVerified } from "../middlewares/location.js";
import { deductBalance, creditBalance } from "../lib/balance-service.js";

export const crashLiveRouter = Router();

function clearLiveFeedCaches() {
  // Bets table writes invalidate client caches via polling; no-op placeholder for parity
}

function serializeBets(round: NonNullable<ReturnType<typeof crashRoundManager.getCurrentRound>>) {
  const reveal = round.state === "crashed" || round.state === "results";
  return round.bets.map((b) => ({
    username: b.username,
    amount: b.amount,
    cashoutAt: b.cashoutAt,
    ...(reveal ? { won: b.won, payout: b.payout } : {}),
  }));
}

crashLiveRouter.get("/round", optionalAuth, (_req, res) => {
  try {
    const round = crashRoundManager.getCurrentRound();
    if (!round) {
      res.json({ round: null, bets: [] });
      return;
    }

    const now = Date.now();
    const timeRemaining = Math.max(0, round.bettingEndsAt - now);
    let currentMultiplier = 1;

    if (round.state === "flying" && round.flyingStartedAt) {
      const elapsed = (now - round.flyingStartedAt) / 1000;
      currentMultiplier = flyingMultiplier(elapsed);
      if (round.crashPoint) currentMultiplier = Math.min(currentMultiplier, round.crashPoint);
    } else if (round.state === "crashed" || round.state === "results") {
      currentMultiplier = round.crashPoint ?? 1;
    }

    res.json({
      round: {
        roundId: round.roundId,
        state: round.state,
        startedAt: round.startedAt,
        bettingEndsAt: round.bettingEndsAt,
        flyingStartedAt: round.flyingStartedAt,
        timeRemaining,
        currentMultiplier,
        crashPoint: round.state === "crashed" || round.state === "results" ? round.crashPoint : undefined,
        betCount: round.bets.length,
        totalBetAmount: round.bets.reduce((s, b) => s + b.amount, 0),
        serverSeedHash: round.serverSeedHash,
        serverSeed: round.state === "crashed" || round.state === "results" ? round.serverSeed : undefined,
        clientSeed: round.state === "crashed" || round.state === "results" ? round.clientSeed : undefined,
      },
      bets: serializeBets(round),
    });
  } catch (err) {
    _req.log.error({ err }, "Get crash live round error");
    res.status(500).json({ error: "Internal server error" });
  }
});

crashLiveRouter.post("/bet", requireAuth, requireLocationVerified, async (req, res) => {
  const { amount, cashoutAt } = req.body as { amount?: number; cashoutAt?: number };

  try {
    const amt = parseFloat(String(amount));
    const target = parseFloat(String(cashoutAt ?? 2));
    if (isNaN(amt) || amt <= 0) {
      res.status(400).json({ error: "Invalid bet amount" });
      return;
    }
    if (isNaN(target) || target < 1.01) {
      res.status(400).json({ error: "Cashout must be at least 1.01×" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.slug, "crash"))
      .limit(1);
    if (!game || !game.active) {
      res.status(404).json({ error: "Crash game not found" });
      return;
    }

    const minBet = parseFloat(game.minBet);
    const maxBet = parseFloat(game.maxBet);
    if (amt < minBet || amt > maxBet) {
      res.status(400).json({ error: `Bet must be between ${minBet} and ${maxBet}` });
      return;
    }

    const round = crashRoundManager.getCurrentRound();
    if (!round || round.state !== "betting") {
      res.status(400).json({ error: "Betting window closed — wait for next round" });
      return;
    }

    if (round.bets.some((b) => b.userId === user.id)) {
      res.status(400).json({ error: "You already have a bet in this round" });
      return;
    }

    let newBalance: number;
    try {
      newBalance = await deductBalance(user.id, amt);
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error).message || "Insufficient balance" });
      return;
    }

    const pendingBetId = Date.now();
    try {
      crashRoundManager.addBet({
        betId: pendingBetId,
        userId: user.id,
        username: user.username,
        amount: amt,
        cashoutAt: target,
      });
    } catch (err: unknown) {
      await creditBalance(user.id, amt);
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    res.json({ success: true, newBalance, roundId: round.roundId });
  } catch (err) {
    req.log.error({ err }, "Crash live bet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

crashLiveRouter.get("/history", optionalAuth, (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? 10), 10), 50);
    const history = crashRoundManager.getRoundHistory(limit);
    res.json({
      rounds: history.map((r) => ({
        roundId: r.roundId,
        crashPoint: r.crashPoint,
        startedAt: r.startedAt,
        betCount: r.bets.length,
        serverSeedHash: r.serverSeedHash,
        serverSeed: r.serverSeed,
        clientSeed: r.clientSeed,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Crash history error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Persist resolved bets when round crashes
crashRoundManager.setOnCrashResolve(async (round) => {
  const [game] = await db.select().from(gamesTable).where(eq(gamesTable.slug, "crash")).limit(1);
  if (!game) return;

  for (const bet of round.bets) {
    const serverSeed = round.serverSeed;
    const serverSeedHash = round.serverSeedHash;
    const clientSeed = round.clientSeed;
    const nonce = bet.betId;
    const won = bet.won ?? false;
    const payout = bet.payout ?? 0;
    const multiplier = won ? bet.cashoutAt : 0;

    await creditBalance(bet.userId, payout);

    await db.update(usersTable).set({
      totalBets: sql`coalesce(total_bets, 0) + 1`,
      totalWon: sql`coalesce(total_won, 0) + ${won ? payout : 0}`,
      totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet.amount}`,
    }).where(eq(usersTable.id, bet.userId));

    await db.insert(betsTable).values({
      userId: bet.userId,
      gameId: game.id,
      amount: String(bet.amount),
      payout: String(payout),
      won,
      multiplier: String(multiplier),
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      meta: {
        cashoutAt: bet.cashoutAt,
        crashPoint: round.crashPoint,
        roundId: round.roundId,
        username: bet.username,
        liveRound: true,
      },
    });
  }
  clearLiveFeedCaches();
});
