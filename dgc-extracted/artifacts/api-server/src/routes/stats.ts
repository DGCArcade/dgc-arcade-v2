import { Router } from "express";
import { db, usersTable, betsTable } from "@workspace/db";
import { count, sum, sql } from "drizzle-orm";

export const statsRouter = Router();

// GET /api/stats
statsRouter.get("/", async (req, res) => {
  try {
    const [playerCount] = await db.select({ count: count() }).from(usersTable);
    const [betStats] = await db
      .select({
        totalBets: count(),
        totalWagered: sum(betsTable.amount),
        biggestWin: sql<string>`COALESCE(MAX(CAST(${betsTable.payout} AS DECIMAL)), 0)`,
      })
      .from(betsTable);

    res.json({
      totalPlayers: playerCount.count,
      totalBets: betStats.totalBets,
      totalWagered: parseFloat(betStats.totalWagered ?? "0"),
      biggestWin: parseFloat(betStats.biggestWin ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "Stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});
