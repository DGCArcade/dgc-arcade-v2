import { Router } from "express";
import { db, usersTable, betsTable } from "@workspace/db";
import { desc, sql, count, sum } from "drizzle-orm";
export const leaderboardRouter = Router();

// GET /api/leaderboard
leaderboardRouter.get("/", async (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "10"), 10) || 10;

  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
        totalWon: usersTable.totalWon,
        totalBets: usersTable.totalBets,
      })
      .from(usersTable)
      .orderBy(desc(sql`CAST(${usersTable.totalWon} AS DECIMAL)`))
      .limit(limit);

    res.json(
      rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        username: r.username,
        avatarUrl: r.avatarUrl,
        totalWon: parseFloat(r.totalWon),
        totalBets: r.totalBets,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Leaderboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats
leaderboardRouter.get("/stats", async (req, res) => {
  try {
    const [playerCount] = await db.select({ count: count() }).from(usersTable);
    const [betStats] = await db
      .select({
        totalBets: count(),
        totalWagered: sum(betsTable.amount),
        biggestWin: sql<string>`MAX(CAST(${betsTable.payout} AS DECIMAL))`,
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
