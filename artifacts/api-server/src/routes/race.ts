import { Router } from "express";
import { db, usersTable, gamesTable, betsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { createHash } from "crypto";

export const raceRouter = Router();

const RACERS = [
  { id: 1, name: "Blaze",    emoji: "🐎", color: "#ef4444" },
  { id: 2, name: "Thunder",  emoji: "🐎", color: "#f59e0b" },
  { id: 3, name: "Shadow",   emoji: "🐎", color: "#8b5cf6" },
  { id: 4, name: "Storm",    emoji: "🐎", color: "#06b6d4" },
  { id: 5, name: "Bolt",     emoji: "🐎", color: "#22c55e" },
  { id: 6, name: "Phantom",  emoji: "🐎", color: "#ec4899" },
];

function seedRandom(seed: string, max: number): number {
  const h = createHash("sha256").update(seed).digest("hex");
  return parseInt(h.slice(0, 8), 16) % max;
}

function generateRacePositions(seed: string): number[] {
  const positions: number[] = [];
  const available = [1, 2, 3, 4, 5, 6];
  let s = seed;
  for (let i = 0; i < 6; i++) {
    const idx = seedRandom(s + i, available.length);
    positions.push(available[idx]);
    available.splice(idx, 1);
    s = createHash("sha256").update(s + i).digest("hex");
  }
  return positions;
}

raceRouter.get("/racers", (_req, res) => {
  res.json(RACERS);
});

raceRouter.post("/run", requireAuth, async (req, res) => {
  const userId = (req as any).userId as number;
  const { betAmount, racerId } = req.body as { betAmount: number; racerId: number };

  if (!betAmount || betAmount <= 0) return res.status(400).json({ error: "Invalid bet amount" });
  if (!racerId || racerId < 1 || racerId > 6) return res.status(400).json({ error: "Invalid racer" });

  const [game] = await db.select().from(gamesTable).where(eq(gamesTable.slug, "race")).limit(1);
  if (!game || !game.isActive) return res.status(400).json({ error: "Race game not available" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (Number(user.balance) < betAmount) return res.status(400).json({ error: "Insufficient balance" });

  const seed = `${userId}:${Date.now()}:${Math.random()}`;
  const finishOrder = generateRacePositions(seed);
  const winnerRacerId = finishOrder[0];
  const playerPlace = finishOrder.indexOf(racerId) + 1;

  const won = playerPlace === 1;
  const multiplier = won ? 5.5 : 0;
  const payout = won ? betAmount * multiplier : 0;
  const profit = payout - betAmount;

  await db.update(usersTable)
    .set({ balance: String(Number(user.balance) - betAmount + payout) })
    .where(eq(usersTable.id, userId));

  await db.insert(betsTable).values({
    userId,
    gameId: game.id,
    amount: String(betAmount),
    payout: String(payout),
    multiplier: String(multiplier),
    won,
    result: JSON.stringify({ racerId, winnerRacerId, finishOrder, playerPlace }),
  });

  return res.json({
    won,
    racerId,
    winnerRacerId,
    finishOrder,
    playerPlace,
    multiplier,
    payout,
    profit,
    newBalance: Number(user.balance) - betAmount + payout,
  });
});
