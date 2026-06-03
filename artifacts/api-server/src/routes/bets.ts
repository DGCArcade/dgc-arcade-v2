import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, transactionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { BetBody, ListBetsQueryParams } from "@workspace/api-zod";
import { requireAuth, optionalAuth } from "../middlewares/auth.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export const betsRouter = Router();

// ─── Game Logic ───────────────────────────────────────────────────────────────

function generateServerSeed(): string {
  return uuidv4().replace(/-/g, "");
}

function getOutcome(serverSeed: string, clientSeed: string, gameSlug: string): number {
  const combined = `${serverSeed}:${clientSeed}:${gameSlug}`;
  const hash = createHash("sha256").update(combined).digest("hex");
  // Use first 8 hex chars for a number 0-4294967295 → normalized to 0-1
  const num = parseInt(hash.slice(0, 8), 16);
  return num / 0xffffffff;
}

interface BetResolution {
  won: boolean;
  multiplier: number;
  payout: number;
  resultMeta?: Record<string, unknown>;
}

function resolveBet(
  gameSlug: string,
  amount: number,
  houseEdge: number,
  seed: number,
  meta: Record<string, unknown> | null
): BetResolution {
  switch (gameSlug) {
    case "coinflip": {
      const outcome = seed < 0.5 ? "heads" : "tails";
      const choice = (meta?.choice as string) ?? "heads";
      const won = outcome === choice;
      const multiplier = won ? 2 * (1 - houseEdge) : 0;
      return { won, multiplier, payout: won ? amount * multiplier : 0, resultMeta: { outcome } };
    }
    case "slots": {
      const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
      const reels = [
        symbols[Math.floor(seed * symbols.length)],
        symbols[Math.floor(((seed * 7919) % 1) * symbols.length)],
        symbols[Math.floor(((seed * 3571) % 1) * symbols.length)],
      ];
      const won = reels[0] === reels[1] && reels[1] === reels[2];
      const multiplier = won
        ? reels[0] === "7️⃣"
          ? 20
          : reels[0] === "💎"
          ? 10
          : 3
        : 0;
      return {
        won,
        multiplier: multiplier * (1 - houseEdge),
        payout: won ? amount * multiplier * (1 - houseEdge) : 0,
        resultMeta: { reels },
      };
    }
    case "crash": {
      // Crash point: e^(log(1/(1-seed))) with house edge baked in
      // Minimum crash at 1.0, weighted toward lower values
      const crashPoint = Math.max(1.0, 1 / (1 - seed * (1 - houseEdge)));
      const cashoutAt = (meta?.cashoutAt as number) ?? 1.5;
      const won = cashoutAt <= crashPoint;
      const multiplier = won ? cashoutAt : 0;
      return { won, multiplier, payout: won ? amount * cashoutAt : 0, resultMeta: { crashPoint } };
    }
    default: {
      // Generic 50/50 game with 2x payout
      const won = seed < 0.5 * (1 - houseEdge);
      return { won, multiplier: won ? 2 : 0, payout: won ? amount * 2 : 0 };
    }
  }
}

// POST /api/bets
betsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = BetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { gameId, amount, clientSeed, meta } = parsed.data;

  try {
    // Load user and game
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, gameId))
      .limit(1);

    if (!game || !game.active) {
      res.status(404).json({ error: "Game not found or inactive" });
      return;
    }

    const minBet = parseFloat(game.minBet);
    const maxBet = parseFloat(game.maxBet);
    const balance = parseFloat(user.balance);
    const houseEdge = parseFloat(game.houseEdge);

    if (amount < minBet || amount > maxBet) {
      res.status(400).json({ error: `Bet must be between ${minBet} and ${maxBet}` });
      return;
    }

    if (balance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Resolve bet
    const serverSeed = generateServerSeed();
    const seedStr = clientSeed ?? uuidv4();
    const seedValue = getOutcome(serverSeed, seedStr, game.slug);
    const { won, multiplier, payout, resultMeta } = resolveBet(
      game.slug,
      amount,
      houseEdge,
      seedValue,
      (meta as Record<string, unknown>) ?? null
    );

    // Update balance & stats atomically
    const newBalance = balance - amount + payout;
    const newTotalBets = user.totalBets + 1;
    const newTotalWon = parseFloat(user.totalWon) + (won ? payout : 0);

    await db
      .update(usersTable)
      .set({
        balance: String(newBalance),
        totalBets: newTotalBets,
        totalWon: String(newTotalWon),
      })
      .where(eq(usersTable.id, user.id));

    // Save bet record
    const [bet] = await db
      .insert(betsTable)
      .values({
        userId: user.id,
        gameId: game.id,
        amount: String(amount),
        payout: String(payout),
        won,
        multiplier: String(multiplier),
        serverSeed,
        clientSeed: seedStr,
        meta: { ...resultMeta, userMeta: meta },
      })
      .returning();

    res.json({
      bet: {
        id: bet.id,
        userId: bet.userId,
        username: user.username,
        gameId: bet.gameId,
        gameName: game.name,
        amount: parseFloat(bet.amount),
        payout: parseFloat(bet.payout),
        won: bet.won,
        multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
        serverSeed: bet.serverSeed,
        clientSeed: bet.clientSeed,
        meta: bet.meta,
        createdAt: bet.createdAt.toISOString(),
      },
      newBalance,
      won,
      payout,
      multiplier,
    });
  } catch (err) {
    req.log.error({ err }, "Place bet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bets  (current user's history)
betsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = ListBetsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;

  try {
    const rows = await db
      .select({
        bet: betsTable,
        username: usersTable.username,
        gameName: gamesTable.name,
      })
      .from(betsTable)
      .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
      .innerJoin(gamesTable, eq(betsTable.gameId, gamesTable.id))
      .where(eq(betsTable.userId, req.user!.userId))
      .orderBy(desc(betsTable.createdAt))
      .limit(limit);

    res.json(
      rows.map(({ bet, username, gameName }) => ({
        id: bet.id,
        userId: bet.userId,
        username,
        gameId: bet.gameId,
        gameName,
        amount: parseFloat(bet.amount),
        payout: parseFloat(bet.payout),
        won: bet.won,
        multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
        serverSeed: bet.serverSeed,
        clientSeed: bet.clientSeed,
        meta: bet.meta,
        createdAt: bet.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List bets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bets/recent-all  (public feed)
betsRouter.get("/recent-all", optionalAuth, async (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "30"), 10) || 30;

  try {
    const rows = await db
      .select({
        bet: betsTable,
        username: usersTable.username,
        gameName: gamesTable.name,
      })
      .from(betsTable)
      .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
      .innerJoin(gamesTable, eq(betsTable.gameId, gamesTable.id))
      .orderBy(desc(betsTable.createdAt))
      .limit(limit);

    res.json(
      rows.map(({ bet, username, gameName }) => ({
        id: bet.id,
        userId: bet.userId,
        username,
        gameId: bet.gameId,
        gameName,
        amount: parseFloat(bet.amount),
        payout: parseFloat(bet.payout),
        won: bet.won,
        multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
        serverSeed: null,
        clientSeed: null,
        meta: null,
        createdAt: bet.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Recent bets error");
    res.status(500).json({ error: "Internal server error" });
  }
});
