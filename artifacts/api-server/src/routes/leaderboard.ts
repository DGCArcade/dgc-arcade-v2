import { Router } from "express";
import { db, usersTable, betsTable } from "@workspace/db";
import { desc, sql, count, sum, gte, and } from "drizzle-orm";

export const leaderboardRouter = Router();

const LEADERBOARD_CACHE_MS = 30_000;
const LEADERBOARD_STATS_CACHE_MS = 60_000;
const leaderboardCache = new Map<string, { expiresAt: number; value: unknown }>();
let statsCache: { expiresAt: number; value: unknown } | null = null;

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "daily": {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case "weekly": {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // start of week (Sunday)
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    case "monthly": {
      const d = new Date(now);
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }
    default:
      return null; // all-time
  }
}

// GET /api/leaderboard?period=alltime|daily|weekly|monthly&limit=50
leaderboardRouter.get("/", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
  const period = String(req.query.period ?? "alltime");
  const periodStart = getPeriodStart(period);
  const cacheKey = `${period}:${limit}`;
  const now = Date.now();

  const cached = leaderboardCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
    res.json(cached.value);
    return;
  }

  try {
    let rows: Array<{ userId: number; username: string; avatarUrl: string | null; totalWon: string | number; totalBets: number }>;

    if (!periodStart) {
      // All-time: use pre-aggregated columns on users table (fast)
      rows = await db
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
    } else {
      // Period: aggregate from bets table for the window
      const periodRows = await db
        .select({
          userId: betsTable.userId,
          username: usersTable.username,
          avatarUrl: usersTable.avatarUrl,
          totalWon: sql<string>`COALESCE(SUM(CASE WHEN ${betsTable.won} THEN CAST(${betsTable.payout} AS DECIMAL) ELSE 0 END), 0)`,
          totalBets: sql<number>`COUNT(*)`,
        })
        .from(betsTable)
        .innerJoin(usersTable, sql`${betsTable.userId} = ${usersTable.id}`)
        .where(gte(betsTable.createdAt, periodStart))
        .groupBy(betsTable.userId, usersTable.username, usersTable.avatarUrl)
        .orderBy(desc(sql`COALESCE(SUM(CASE WHEN ${betsTable.won} THEN CAST(${betsTable.payout} AS DECIMAL) ELSE 0 END), 0)`))
        .limit(limit);
      rows = periodRows as typeof rows;
    }

    const value = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: r.username,
      avatarUrl: r.avatarUrl,
      totalWon: parseFloat(String(r.totalWon)),
      totalBets: Number(r.totalBets),
    }));

    leaderboardCache.set(cacheKey, { value, expiresAt: now + LEADERBOARD_CACHE_MS });
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/leaderboard/stats
leaderboardRouter.get("/stats", async (_req, res) => {
  const now = Date.now();
  if (statsCache && statsCache.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(statsCache.value);
    return;
  }

  try {
    const [playerCount] = await db.select({ count: count() }).from(usersTable);
    const [betStats] = await db
      .select({
        totalBets: count(),
        totalWagered: sum(betsTable.amount),
        biggestWin: sql<string>`MAX(CAST(${betsTable.payout} AS DECIMAL))`,
      })
      .from(betsTable);

    const value = {
      totalPlayers: playerCount.count,
      totalBets: betStats.totalBets,
      totalWagered: parseFloat(betStats.totalWagered ?? "0"),
      biggestWin: parseFloat(betStats.biggestWin ?? "0"),
    };
    statsCache = { value, expiresAt: now + LEADERBOARD_STATS_CACHE_MS };
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
