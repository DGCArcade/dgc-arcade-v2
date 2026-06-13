import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, minesSessionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export const minesRouter = Router();

function genMines(serverSeed: string, count: number, total = 25): number[] {
  const positions: number[] = [];
  for (let i = 0; positions.length < count; i++) {
    const combined = `${serverSeed}:mines:${i}`;
    const h = createHash("sha256").update(combined).digest("hex");
    const pos = parseInt(h.slice(0, 8), 16) % total;
    if (!positions.includes(pos)) positions.push(pos);
  }
  return positions;
}

function calcMultiplier(revealed: number, mineCount: number, total = 25): number {
  if (revealed === 0) return 1;
  let prob = 1;
  for (let i = 0; i < revealed; i++) {
    prob *= (total - mineCount - i) / (total - i);
  }
  return Math.max(0.01, 0.97 / prob);
}

// POST /api/mines/start
minesRouter.post("/start", requireAuth, async (req, res) => {
  const { gameId, amount, mineCount = 5 } = req.body;
  if (!gameId || !amount || amount <= 0) {
    res.status(400).json({ error: "gameId and amount required" });
    return;
  }
  if (mineCount < 1 || mineCount > 24) {
    res.status(400).json({ error: "mineCount must be 1-24" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    if (parseFloat(user.balance) < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const existing = await db.select().from(minesSessionsTable)
      .where(and(eq(minesSessionsTable.userId, req.user!.userId), eq(minesSessionsTable.status, "active")))
      .limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "Active session exists. Cashout or bust first.", sessionId: existing[0].id });
      return;
    }

    // ATOMIC balance deduct + wager tracking -- prevents race conditions
    // and ensures Mines bets count toward the withdrawal wager requirement
    const deducted = await db.update(usersTable)
      .set({
        balance: sql`CAST((CAST(balance AS NUMERIC) - ${amount}) AS TEXT)`,
        totalWageredAmount: sql`CAST((CAST(coalesce(total_wagered_amount, '0') AS NUMERIC) + ${amount}) AS TEXT)`,
      })
      .where(and(eq(usersTable.id, user.id), sql`CAST(balance AS NUMERIC) >= ${amount}`))
      .returning({ balance: usersTable.balance });
    if (deducted.length === 0) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const serverSeed = uuidv4().replace(/-/g, "");
    const mines = genMines(serverSeed, mineCount);

    const [session] = await db.insert(minesSessionsTable).values({
      userId: user.id,
      gameId,
      bet: String(amount),
      serverSeed,
      mineCount,
      minePositions: JSON.stringify(mines),
      revealed: "[]",
      status: "active",
      currentMultiplier: "1",
    }).returning();

    res.json({
      sessionId: session.id,
      mineCount,
      bet: amount,
      balance: parseFloat(deducted[0].balance),
      nextMultiplier: calcMultiplier(1, mineCount),
    });
  } catch (err) {
    req.log.error({ err }, "Mines start error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mines/reveal
minesRouter.post("/reveal", requireAuth, async (req, res) => {
  const { sessionId, cell } = req.body;
  if (sessionId == null || cell == null) {
    res.status(400).json({ error: "sessionId and cell required" });
    return;
  }

  try {
    const [session] = await db.select().from(minesSessionsTable)
      .where(and(eq(minesSessionsTable.id, sessionId), eq(minesSessionsTable.userId, req.user!.userId)))
      .limit(1);
    if (!session || session.status !== "active") {
      res.status(400).json({ error: "No active session found" });
      return;
    }

    const mines: number[] = JSON.parse(session.minePositions);
    const revealed: number[] = JSON.parse(session.revealed);

    if (revealed.includes(cell)) {
      res.status(400).json({ error: "Cell already revealed" });
      return;
    }

    const hitMine = mines.includes(cell);
    const newRevealed = [...revealed, cell];
    const newMultiplier = calcMultiplier(newRevealed.length, session.mineCount);

    if (hitMine) {
      await db.update(minesSessionsTable).set({
        revealed: JSON.stringify(newRevealed),
        status: "busted",
      }).where(eq(minesSessionsTable.id, session.id));

      await db.update(usersTable).set({ totalBets: sql`total_bets + 1` }).where(eq(usersTable.id, req.user!.userId));
      await db.insert(betsTable).values({
        userId: session.userId, gameId: session.gameId,
        amount: session.bet, payout: "0",
        won: false, multiplier: "0",
        serverSeed: session.serverSeed, clientSeed: "mines",
        meta: { minePositions: mines, revealed: newRevealed, result: "busted" },
      });

      res.json({ hit: true, minePositions: mines, revealed: newRevealed, status: "busted", payout: 0 });
      return;
    }

    await db.update(minesSessionsTable).set({
      revealed: JSON.stringify(newRevealed),
      currentMultiplier: String(newMultiplier),
    }).where(eq(minesSessionsTable.id, session.id));

    const safeLeft = 25 - session.mineCount - newRevealed.length;
    res.json({
      hit: false, cell, revealed: newRevealed, status: "active",
      currentMultiplier: newMultiplier,
      nextMultiplier: calcMultiplier(newRevealed.length + 1, session.mineCount),
      safeLeft,
    });
  } catch (err) {
    req.log.error({ err }, "Mines reveal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/mines/cashout
minesRouter.post("/cashout", requireAuth, async (req, res) => {
  const { sessionId } = req.body;
  try {
    const [session] = await db.select().from(minesSessionsTable)
      .where(and(eq(minesSessionsTable.id, sessionId), eq(minesSessionsTable.userId, req.user!.userId)))
      .limit(1);
    if (!session || session.status !== "active") {
      res.status(400).json({ error: "No active session found" });
      return;
    }

    const revealed: number[] = JSON.parse(session.revealed);
    if (revealed.length === 0) {
      res.status(400).json({ error: "Reveal at least one cell before cashing out" });
      return;
    }

    const multiplier = parseFloat(session.currentMultiplier);
    const bet = parseFloat(session.bet);
    const payout = bet * multiplier;

    const [updated] = await db.update(usersTable).set({
      balance: sql`CAST((CAST(balance AS NUMERIC) + ${payout}) AS TEXT)`,
      totalBets: sql`total_bets + 1`,
      totalWon: sql`CAST((CAST(coalesce(total_won, '0') AS NUMERIC) + ${payout}) AS TEXT)`,
    }).where(eq(usersTable.id, req.user!.userId)).returning();
    const newBalance = parseFloat(updated.balance);

    const mines: number[] = JSON.parse(session.minePositions);
    await db.update(minesSessionsTable).set({ status: "won" }).where(eq(minesSessionsTable.id, session.id));

    await db.insert(betsTable).values({
      userId: session.userId, gameId: session.gameId,
      amount: session.bet, payout: String(payout),
      won: true, multiplier: String(multiplier),
      serverSeed: session.serverSeed, clientSeed: "mines",
      meta: { minePositions: mines, revealed, result: "cashed_out", multiplier },
    });

    res.json({ payout, multiplier, balance: newBalance, minePositions: mines, status: "won" });
  } catch (err) {
    req.log.error({ err }, "Mines cashout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/mines/current
minesRouter.get("/current", requireAuth, async (req, res) => {
  try {
    const [session] = await db.select().from(minesSessionsTable)
      .where(and(eq(minesSessionsTable.userId, req.user!.userId), eq(minesSessionsTable.status, "active")))
      .limit(1);
    if (!session) { res.json(null); return; }

    const revealed: number[] = JSON.parse(session.revealed);
    const multiplier = parseFloat(session.currentMultiplier);
    res.json({
      sessionId: session.id,
      mineCount: session.mineCount,
      revealed,
      bet: parseFloat(session.bet),
      currentMultiplier: multiplier,
      nextMultiplier: calcMultiplier(revealed.length + 1, session.mineCount),
    });
  } catch (err) {
    req.log.error({ err }, "Mines current error");
    res.status(500).json({ error: "Internal server error" });
  }
});
