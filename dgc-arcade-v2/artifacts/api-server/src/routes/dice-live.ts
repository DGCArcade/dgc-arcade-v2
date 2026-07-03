import { Router } from "express";
import { diceRoundManager, type DiceRound, type DiceRoundBet } from "../lib/dice-round-manager.js";
import { optionalAuth } from "../middlewares/auth.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const diceLiveRouter = Router();

/**
 * GET /api/dice/live/round
 * Returns the current live Dice round state, including:
 * - Round ID, state (betting/rolling/results)
 * - Time remaining in betting window
 * - Current bets from all players
 * - Roll result (if rolled)
 * - SHA-256 server seed hash for provably fair verification
 */
diceLiveRouter.get("/round", optionalAuth, (req, res) => {
  try {
    const round = diceRoundManager.getCurrentRound();
    if (!round) {
      res.json({ round: null, message: "No active round" });
      return;
    }

    const now = Date.now();
    const timeRemaining = Math.max(0, round.bettingEndsAt - now);

    res.json({
      round: {
        roundId: round.roundId,
        state: round.state,
        startedAt: round.startedAt,
        bettingEndsAt: round.bettingEndsAt,
        timeRemaining,
        roll: round.roll,
        betCount: round.bets.length,
        totalBetAmount: round.bets.reduce((sum, b) => sum + b.amount, 0),
        serverSeedHash: round.serverSeedHash, // SHA-256 hash for provably fair
      },
      bets: round.bets.map(b => ({
        username: b.username,
        amount: b.amount,
        target: b.target,
        mode: b.mode,
        won: b.won,
        payout: b.payout,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get live round error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/dice/live/next-round
 * Returns the next round's details so players can place bets in advance
 */
diceLiveRouter.get("/next-round", optionalAuth, (req, res) => {
  try {
    const nextRound = diceRoundManager.getNextRound();
    if (!nextRound) {
      res.json({ nextRound: null });
      return;
    }

    const now = Date.now();
    const timeUntilStart = Math.max(0, nextRound.startedAt - now);

    res.json({
      nextRound: {
        roundId: nextRound.roundId,
        state: nextRound.state,
        startedAt: nextRound.startedAt,
        bettingEndsAt: nextRound.bettingEndsAt,
        timeUntilStart,
        betCount: nextRound.bets.length,
        totalBetAmount: nextRound.bets.reduce((sum, b) => sum + b.amount, 0),
        serverSeedHash: nextRound.serverSeedHash, // SHA-256 hash for provably fair
      },
      bets: nextRound.bets.map(b => ({
        username: b.username,
        amount: b.amount,
        target: b.target,
        mode: b.mode,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get next round error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/dice/live/bet
 * Place a bet in the current or next round.
 * Query param: roundId (optional, defaults to current round)
 */
diceLiveRouter.post("/bet", optionalAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { amount, target, mode } = req.body;
  const roundId = req.query.roundId as string | undefined;

  try {
    const [user] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bet: DiceRoundBet = {
      betId: 0, // Placeholder
      userId: req.user.userId,
      username: user.username,
      amount: parseFloat(String(amount)),
      target: parseInt(String(target)),
      mode: mode as "over" | "under",
    };

    diceRoundManager.addBetToRound(bet, roundId);

    res.json({ success: true, message: "Bet added to round", roundId: roundId || "current" });
  } catch (err: any) {
    req.log.error({ err }, "Add live bet error");
    res.status(400).json({ error: err.message || "Internal server error" });
  }
});

/**
 * GET /api/dice/live/history
 * Returns the last N completed rounds (for replay/history)
 */
diceLiveRouter.get("/history", optionalAuth, (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? 10)), 50);
    const history = diceRoundManager.getRoundHistory(limit);

    res.json({
      rounds: history.map(r => ({
        roundId: r.roundId,
        state: r.state,
        startedAt: r.startedAt,
        roll: r.roll,
        betCount: r.bets.length,
        totalBetAmount: r.bets.reduce((sum, b) => sum + b.amount, 0),
        serverSeedHash: r.serverSeedHash, // SHA-256 hash
        bets: r.bets.map(b => ({
          username: b.username,
          amount: b.amount,
          target: b.target,
          mode: b.mode,
          won: b.won,
          payout: b.payout,
        })),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get round history error");
    res.status(500).json({ error: "Internal server error" });
  }
});
