import { Router } from "express";
import { db, usersTable, gamesTable, betsTable } from "@workspace/db";
import { eq, desc, gte, sql, and } from "drizzle-orm";
import { BetBody, ListBetsQueryParams } from "@workspace/api-zod";
import { requireAuth, optionalAuth } from "../middlewares/auth.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { recordTournamentWager } from "../lib/tournament-tracker.js";
import { recordLedgerStandalone } from "../services/ledger.js";

export const betsRouter = Router();

// ─── Game Logic ───────────────────────────────────────────────────────────────

function generateServerSeed(): string {
  return uuidv4().replace(/-/g, "");
}

function getOutcome(serverSeed: string, clientSeed: string, gameSlug: string): number {
  const combined = `${serverSeed}:${clientSeed}:${gameSlug}`;
  const hash = createHash("sha256").update(combined).digest("hex");
  const num = parseInt(hash.slice(0, 8), 16);
  return num / 0xffffffff;
}

function getOutcomeN(serverSeed: string, clientSeed: string, gameSlug: string, nonce: number): number {
  const combined = `${serverSeed}:${clientSeed}:${gameSlug}:${nonce}`;
  const hash = createHash("sha256").update(combined).digest("hex");
  const num = parseInt(hash.slice(0, 8), 16);
  return num / 0xffffffff;
}

interface BetResolution {
  won: boolean;
  multiplier: number;
  payout: number;
  resultMeta?: Record<string, unknown>;
}

// Roulette red numbers
const ROULETTE_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function resolveBet(
  gameSlug: string,
  amount: number,
  houseEdge: number,
  seed: number,
  serverSeed: string,
  clientSeedStr: string,
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
      const symbols = ["CHERRY", "LEMON", "BELL", "SEVEN", "BAR", "DIAMOND", "WILD"];
      const weights =  [30,       20,      15,     5,       10,    8,          12];
      function weightedPick(s: number): string {
        const total = weights.reduce((a, b) => a + b, 0);
        let pick = s * total;
        for (let i = 0; i < weights.length; i++) {
          pick -= weights[i];
          if (pick <= 0) return symbols[i];
        }
        return symbols[symbols.length - 1];
      }
      const reels = [
        weightedPick(getOutcomeN(serverSeed, clientSeedStr, "slots", 0)),
        weightedPick(getOutcomeN(serverSeed, clientSeedStr, "slots", 1)),
        weightedPick(getOutcomeN(serverSeed, clientSeedStr, "slots", 2)),
      ];
      const won = reels[0] === reels[1] && reels[1] === reels[2];
      const baseMultiplier = won
        ? reels[0] === "SEVEN" ? 20
        : reels[0] === "DIAMOND" ? 10
        : reels[0] === "WILD" ? 15
        : reels[0] === "BAR" ? 5
        : reels[0] === "BELL" ? 4
        : 3
        : 0;
      const multiplier = won ? baseMultiplier * (1 - houseEdge) : 0;
      return { won, multiplier, payout: won ? amount * multiplier : 0, resultMeta: { reels } };
    }

    case "crash": {
      const crashPoint = Math.max(1.0, 1 / (1 - seed * (1 - houseEdge)));
      const cashoutAt = (meta?.cashoutAt as number) ?? 1.5;
      const won = cashoutAt <= crashPoint;
      const multiplier = won ? cashoutAt : 0;
      return { won, multiplier, payout: won ? amount * cashoutAt : 0, resultMeta: { crashPoint } };
    }

    case "roulette": {
      const pocket = Math.floor(seed * 37); // 0-36
      const betType = (meta?.betType as string) ?? "color";
      const betValue = meta?.betValue;
      let won = false;
      let multiplier = 0;
      if (betType === "number") {
        won = pocket === Number(betValue);
        multiplier = won ? 35 * (1 - houseEdge) : 0;
      } else if (betType === "color") {
        if (betValue === "green") { won = pocket === 0; multiplier = won ? 14 * (1 - houseEdge) : 0; }
        else if (betValue === "red") { won = pocket !== 0 && ROULETTE_RED.has(pocket); multiplier = won ? 2 * (1 - houseEdge) : 0; }
        else { won = pocket !== 0 && !ROULETTE_RED.has(pocket); multiplier = won ? 2 * (1 - houseEdge) : 0; }
      } else if (betType === "evenodd") {
        if (pocket === 0) { won = false; }
        else { won = betValue === "even" ? pocket % 2 === 0 : pocket % 2 !== 0; }
        multiplier = won ? 2 * (1 - houseEdge) : 0;
      } else if (betType === "dozen") {
        const dozen = Math.ceil(pocket / 12);
        won = pocket !== 0 && dozen === Number(betValue);
        multiplier = won ? 3 * (1 - houseEdge) : 0;
      } else if (betType === "half") {
        won = pocket !== 0 && (betValue === "low" ? pocket <= 18 : pocket >= 19);
        multiplier = won ? 2 * (1 - houseEdge) : 0;
      }
      return { won, multiplier, payout: won ? amount * multiplier : 0, resultMeta: { pocket, betType, betValue } };
    }

    case "plinko": {
      const rows = Math.min(16, Math.max(8, Number(meta?.rows ?? 12)));
      const risk = (meta?.risk as string) ?? "medium";
      // Simulate ball falling through rows
      let position = 0;
      for (let i = 0; i < rows; i++) {
        position += getOutcomeN(serverSeed, clientSeedStr, "plinko", i) < 0.5 ? 0 : 1;
      }
      // Multiplier table based on risk and position (center = low, edges = high)
      const mid = rows / 2;
      const dist = Math.abs(position - mid) / mid; // 0-1, 1 = edge
      let multiplier: number;
      if (risk === "low") {
        multiplier = 0.2 + dist * 3.8; // 0.2x - 4x
      } else if (risk === "high") {
        multiplier = dist < 0.3 ? 0 : dist * 12; // 0 or up to 12x
      } else {
        multiplier = dist < 0.1 ? 0.3 : dist * 7; // 0.3x - 7x
      }
      multiplier *= (1 - houseEdge);
      const won = multiplier > 1;
      return { won, multiplier, payout: amount * multiplier, resultMeta: { position, rows, risk, dist } };
    }

    case "hilo": {
      // A card is drawn (1-13), player guesses higher/lower than a threshold
      const card = Math.floor(seed * 13) + 1;
      const guess = (meta?.guess as string) ?? "higher";
      const threshold = Number(meta?.threshold ?? 7);
      let won = false;
      if (guess === "higher") { won = card > threshold; }
      else if (guess === "lower") { won = card < threshold; }
      else { won = card === threshold; } // exact = 13x
      const winChance = guess === "exact" ? 1/13 : guess === "higher" ? (13 - threshold) / 13 : (threshold - 1) / 13;
      const multiplier = won ? Math.max(1.01, (1 - houseEdge) / Math.max(0.01, winChance)) : 0;
      return { won, multiplier, payout: won ? amount * multiplier : 0, resultMeta: { card, guess, threshold } };
    }

    case "keno": {
      // Player picks 1-10 numbers from 1-80, 20 drawn
      const picks = (meta?.picks as number[]) ?? [];
      // Draw 20 unique numbers
      const drawn: number[] = [];
      for (let i = 0; drawn.length < 20; i++) {
        const n = Math.floor(getOutcomeN(serverSeed, clientSeedStr, "keno", i) * 80) + 1;
        if (!drawn.includes(n)) drawn.push(n);
      }
      const matches = picks.filter(p => drawn.includes(p)).length;
      // Keno payout table (matches / picks → multiplier)
      const kenoTable: Record<number, number[]> = {
        1: [0, 3],
        2: [0, 0, 6],
        3: [0, 0, 2, 10],
        4: [0, 0, 1, 4, 15],
        5: [0, 0, 0, 2, 6, 25],
        6: [0, 0, 0, 1, 3, 10, 50],
        7: [0, 0, 0, 0, 2, 5, 20, 100],
        8: [0, 0, 0, 0, 1, 3, 10, 40, 200],
        9: [0, 0, 0, 0, 0, 2, 6, 20, 100, 500],
        10: [0, 0, 0, 0, 0, 1, 4, 12, 50, 200, 1000],
      };
      const pickCount = Math.min(10, Math.max(1, picks.length));
      const table = kenoTable[pickCount] ?? [0, 3];
      const baseMultiplier = table[Math.min(matches, table.length - 1)] ?? 0;
      const multiplier = baseMultiplier * (1 - houseEdge);
      const won = multiplier > 0;
      return { won, multiplier, payout: won ? amount * multiplier : 0, resultMeta: { drawn, matches, picks } };
    }

    case "dice": {
      // Player sets a target (2-98) and chooses over/under
      const roll = Math.floor(seed * 100) + 1; // 1-100
      const target = Number(meta?.target ?? 50);
      const over = meta?.over !== false; // default over
      const won = over ? roll > target : roll < target;
      const winChance = over ? (100 - target) / 100 : (target - 1) / 100;
      const multiplier = won ? Math.max(1.01, (1 - houseEdge) / Math.max(0.01, winChance)) : 0;
      return { won, multiplier, payout: won ? amount * multiplier : 0, resultMeta: { roll, target, over } };
    }

    case "mines": {
      // Resolved as a single call with random mine grid
      const mineCount = Number(meta?.mineCount ?? 5);
      const safeClicks = Number(meta?.safeClicks ?? 3);
      const totalCells = 25;
      // Build mine grid
      const positions: number[] = [];
      for (let i = 0; positions.length < mineCount; i++) {
        const pos = Math.floor(getOutcomeN(serverSeed, clientSeedStr, "mines", i) * totalCells);
        if (!positions.includes(pos)) positions.push(pos);
      }
      // Calculate multiplier for N safe clicks in 25 grid with M mines
      let probability = 1;
      for (let i = 0; i < safeClicks; i++) {
        probability *= (totalCells - mineCount - i) / (totalCells - i);
      }
      const multiplier = safeClicks > 0 ? Math.max(0, (1 - houseEdge) / probability) : 1;
      const won = true; // always resolve as win for single-call
      return { won, multiplier, payout: amount * multiplier, resultMeta: { minePositions: positions, safeClicks } };
    }

    default: {
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
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, gameId))
      .limit(1);

    if (!game || !game.active) { res.status(404).json({ error: "Game not found or inactive" }); return; }

    const minBet = parseFloat(game.minBet);
    const maxBet = parseFloat(game.maxBet);
    const houseEdge = parseFloat(game.houseEdge);
    if (amount < minBet || amount > maxBet) {
      res.status(400).json({ error: `Bet must be between ${minBet} and ${maxBet}` });
      return;
    }
    // ATOMIC balance deduct -- prevents race conditions
    // Check and deduct happen in one SQL statement.
    // Two simultaneous bets can never both pass on the same balance.
    const deducted = await db.update(usersTable)
      .set({ balance: sql`balance - ${amount}` })
      .where(and(eq(usersTable.id, user.id), sql`balance >= ${amount}`))
      .returning({ balance: usersTable.balance });
    if (deducted.length === 0) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    const serverSeed = generateServerSeed();
    const clientSeedStr = clientSeed ?? uuidv4();
    const seedValue = getOutcome(serverSeed, clientSeedStr, game.slug);
    const { won, multiplier, payout, resultMeta } = resolveBet(
      game.slug, amount, houseEdge, seedValue, serverSeed, clientSeedStr,
      (meta as Record<string, unknown>) ?? null
    );
    // Atomic stat + payout update — consistent with mines/blackjack, avoids
    // read-modify-write races and JS float drift on real-money columns.
    const [updatedUser] = await db.update(usersTable).set({
      balance: sql`balance + ${payout}`,
      totalBets: sql`coalesce(total_bets, 0) + 1`,
      totalWon: sql`coalesce(total_won, 0) + ${won ? payout : 0}`,
      totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${amount}`,
    }).where(eq(usersTable.id, user.id)).returning({ balance: usersTable.balance });

    const [bet] = await db.insert(betsTable).values({
      userId: user.id,
      gameId: game.id,
      amount: String(amount),
      payout: String(payout),
      won,
      multiplier: String(multiplier),
      serverSeed,
      clientSeed: clientSeedStr,
      meta: { ...resultMeta, userMeta: meta },
    }).returning();

    const newBalance = parseFloat(updatedUser.balance);

    // Fire-and-forget: record ledger entries for this bet
    const balanceAfterDeduct = newBalance - payout + amount; // balance right after deduct, before payout
    recordLedgerStandalone({
      userId: user.id,
      amount: -amount,
      balanceBefore: balanceAfterDeduct + amount,
      balanceAfter: balanceAfterDeduct,
      reason: "bet_loss",
      referenceId: bet.id,
      referenceType: "bet",
      note: `${game.slug} bet`,
    }).catch(() => {});
    if (payout > 0) {
      recordLedgerStandalone({
        userId: user.id,
        amount: payout,
        balanceBefore: balanceAfterDeduct,
        balanceAfter: newBalance,
        reason: "bet_win",
        referenceId: bet.id,
        referenceType: "bet",
        note: `${game.slug} payout x${multiplier}`,
      }).catch(() => {});
    }

    // Fire-and-forget: track wager in any active tournament
    recordTournamentWager(user.id, amount, req.log).catch(() => {});

    res.json({
      bet: {
        id: bet.id, userId: bet.userId, username: user.username,
        gameId: bet.gameId, gameName: game.name,
        amount: parseFloat(bet.amount), payout: parseFloat(bet.payout),
        won: bet.won, multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
        serverSeed: bet.serverSeed, clientSeed: bet.clientSeed,
        meta: bet.meta, createdAt: bet.createdAt.toISOString(),
      },
      newBalance, won, payout, multiplier,
    });
  } catch (err) {
    req.log.error({ err }, "Place bet error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bets
betsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = ListBetsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  try {
    const rows = await db.select({
      bet: betsTable, username: usersTable.username, gameName: gamesTable.name,
    }).from(betsTable)
      .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
      .innerJoin(gamesTable, eq(betsTable.gameId, gamesTable.id))
      .where(eq(betsTable.userId, req.user!.userId))
      .orderBy(desc(betsTable.createdAt))
      .limit(limit);

    res.json(rows.map(({ bet, username, gameName }) => ({
      id: bet.id, userId: bet.userId, username, gameId: bet.gameId, gameName,
      amount: parseFloat(bet.amount), payout: parseFloat(bet.payout), won: bet.won,
      multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
      serverSeed: bet.serverSeed, clientSeed: bet.clientSeed, meta: bet.meta,
      createdAt: bet.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "List bets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bets/recent-all
betsRouter.get("/recent-all", optionalAuth, async (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "30"), 10) || 30;
  try {
    const rows = await db.select({
      bet: betsTable, username: usersTable.username, gameName: gamesTable.name,
    }).from(betsTable)
      .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
      .innerJoin(gamesTable, eq(betsTable.gameId, gamesTable.id))
      .orderBy(desc(betsTable.createdAt))
      .limit(limit);

    res.json(rows.map(({ bet, username, gameName }) => ({
      id: bet.id, userId: bet.userId, username, gameId: bet.gameId, gameName,
      amount: parseFloat(bet.amount), payout: parseFloat(bet.payout), won: bet.won,
      multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
      serverSeed: null, clientSeed: null, meta: null,
      createdAt: bet.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Recent bets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/bets/high-rollers — top bets by amount
betsRouter.get("/high-rollers", optionalAuth, async (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  try {
    const rows = await db.select({
      bet: betsTable, username: usersTable.username, gameName: gamesTable.name,
    }).from(betsTable)
      .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
      .innerJoin(gamesTable, eq(betsTable.gameId, gamesTable.id))
      .orderBy(desc(sql`CAST(${betsTable.amount} AS NUMERIC)`))
      .limit(limit);

    res.json(rows.map(({ bet, username, gameName }) => ({
      id: bet.id, userId: bet.userId, username, gameId: bet.gameId, gameName,
      amount: parseFloat(bet.amount), payout: parseFloat(bet.payout), won: bet.won,
      multiplier: bet.multiplier ? parseFloat(bet.multiplier) : null,
      serverSeed: null, clientSeed: null, meta: null,
      createdAt: bet.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "High rollers error");
    res.status(500).json({ error: "Internal server error" });
  }
});
