import { Router } from "express";
import { db, usersTable, gamesTable, betsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { requireLocationVerified } from "../middlewares/location.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { logBetActivity } from "../services/activity-log.js";
import { getRequestContext } from "../lib/request-context.js";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

export const raceRouter = Router();

const RACERS = [
  { id: 1, name: "Blaze", emoji: "🐎", color: "#ef4444" },
  { id: 2, name: "Thunder", emoji: "🐎", color: "#f59e0b" },
  { id: 3, name: "Shadow", emoji: "🐎", color: "#8b5cf6" },
  { id: 4, name: "Storm", emoji: "🐎", color: "#06b6d4" },
  { id: 5, name: "Bolt", emoji: "🐎", color: "#22c55e" },
  { id: 6, name: "Phantom", emoji: "🐎", color: "#ec4899" },
];

function generateServerSeed(): string {
  return uuidv4().replace(/-/g, "");
}

function getOutcome(serverSeed: string, clientSeed: string, gameSlug: string, nonce: number): number {
  const message = `${clientSeed}:${nonce}:${gameSlug}`;
  const hash = createHash("sha256").update(`${serverSeed}:${message}`).digest("hex");
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

function generateRacePositions(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const available = [1, 2, 3, 4, 5, 6];
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(getOutcome(serverSeed, clientSeed, "race", nonce + i) * available.length);
    positions.push(available[idx]);
    available.splice(idx, 1);
  }
  return positions;
}

raceRouter.get("/racers", (_req, res) => {
  res.json(RACERS);
});

raceRouter.post("/run", requireAuth, requireLocationVerified, async (req, res) => {
  const userId = req.user!.userId;
  const { betAmount, racerId, clientSeed } = req.body as {
    betAmount: number;
    racerId: number;
    clientSeed?: string;
  };

  if (!betAmount || betAmount <= 0)
    return res.status(400).json({ error: "Invalid bet amount" });
  if (!racerId || racerId < 1 || racerId > 6)
    return res.status(400).json({ error: "Invalid racer" });

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.slug, "race"))
    .limit(1);
  if (!game || !game.active)
    return res.status(400).json({ error: "Race game not available" });

  const minBet = parseFloat(game.minBet);
  const maxBet = parseFloat(game.maxBet);
  const houseEdge = parseFloat(game.houseEdge);
  if (betAmount < minBet || betAmount > maxBet)
    return res.status(400).json({ error: `Bet must be between ${minBet} and ${maxBet}` });

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  try {
    await deductBalance(userId, betAmount);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Insufficient balance" });
  }

  const serverSeed = generateServerSeed();
  const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
  const clientSeedStr = clientSeed ?? uuidv4();
  const nonce = user.totalBets + 1;

  const finishOrder = generateRacePositions(serverSeed, clientSeedStr, nonce);
  const winnerRacerId = finishOrder[0];
  const playerPlace = finishOrder.indexOf(racerId) + 1;

  const won = playerPlace === 1;
  const rawMultiplier = won ? 5.5 : 0;
  const multiplier = won ? rawMultiplier * (1 - houseEdge) : 0;
  const payout = won ? betAmount * multiplier : 0;
  const profit = payout - betAmount;

  const finalBalance = await creditBalance(userId, payout);
  await db.update(usersTable).set({
    totalBets: sql`coalesce(total_bets, 0) + 1`,
    totalWon: sql`coalesce(total_won, 0) + ${won ? payout : 0}`,
    totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${betAmount}`,
  }).where(eq(usersTable.id, userId));

  const [betRow] = await db.insert(betsTable).values({
    userId,
    gameId: game.id,
    amount: String(betAmount),
    payout: String(payout),
    multiplier: String(multiplier),
    won,
    serverSeed,
    serverSeedHash,
    clientSeed: clientSeedStr,
    nonce,
    meta: { racerId, winnerRacerId, finishOrder, playerPlace, username: user.username },
  }).returning({ id: betsTable.id });

  logBetActivity({
    userId,
    username: user.username,
    ctx: getRequestContext(req),
    betId: betRow.id,
    gameSlug: "race",
    amount: betAmount,
    payout,
    won,
    multiplier,
  });

  return res.json({
    betId: betRow.id,
    won,
    racerId,
    winnerRacerId,
    finishOrder,
    playerPlace,
    multiplier,
    payout,
    profit,
    newBalance: finalBalance,
    serverSeedHash,
    serverSeed,
    clientSeed: clientSeedStr,
    nonce,
  });
});

// GET /api/race/verify/:betId
raceRouter.get("/verify/:betId", async (req, res) => {
  const betId = parseInt(req.params.betId, 10);
  if (isNaN(betId)) return res.status(400).json({ error: "Invalid bet ID" });

  const [bet] = await db.select().from(betsTable).where(eq(betsTable.id, betId)).limit(1);
  if (!bet || !bet.serverSeed) return res.status(404).json({ error: "Bet not found" });

  const meta = bet.meta as Record<string, unknown>;
  const finishOrder = meta.finishOrder as number[] | undefined;
  const recomputed = generateRacePositions(bet.serverSeed, bet.clientSeed ?? "", bet.nonce ?? 1);
  const hashValid =
    !!bet.serverSeedHash &&
    createHash("sha256").update(bet.serverSeed).digest("hex") === bet.serverSeedHash;
  const orderValid =
    Array.isArray(finishOrder) && JSON.stringify(recomputed) === JSON.stringify(finishOrder);

  return res.json({
    verified: hashValid && orderValid,
    hashValid,
    orderValid,
    betId: bet.id,
    serverSeedHash: bet.serverSeedHash,
    serverSeed: bet.serverSeed,
    clientSeed: bet.clientSeed,
    nonce: bet.nonce,
    finishOrder,
    recomputedOrder: recomputed,
    algorithm: "SHA256(serverSeed) → commit hash; SHA256(serverSeed:clientSeed:nonce+i:race) → finish order",
  });
});
