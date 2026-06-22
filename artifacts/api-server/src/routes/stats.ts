import { Router, type Request } from "express";
import { db, usersTable, betsTable, visitorsTable } from "@workspace/db";
import { count, eq, sum, sql } from "drizzle-orm";

export const statsRouter = Router();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
  return (forwarded || req.ip || "unknown").replace(/^::ffff:/, "");
}

function getDeviceType(userAgent: string): string {
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

// GET /api/stats
statsRouter.get("/", async (req, res) => {
  try {
    const [playerCount] = await db.select({ count: count() }).from(usersTable);
    const [betStats] = await db
      .select({
        totalBets:    count(),
        totalWagered: sum(betsTable.amount),
        biggestWin:   sql<string>`COALESCE(MAX(CAST(${betsTable.payout} AS DECIMAL)), 0)`,
      })
      .from(betsTable);

    res.json({
      totalPlayers:  playerCount.count,
      totalBets:     betStats.totalBets,
      totalWagered:  parseFloat(betStats.totalWagered ?? "0"),
      biggestWin:    parseFloat(betStats.biggestWin ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "Stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/live — public endpoint for real-time platform stats
statsRouter.get("/live", async (req, res) => {
  try {
    const [online] = await db
      .select({ count: sql<number>`count(distinct coalesce(${visitorsTable.fingerprint}, ${visitorsTable.ip}))` })
      .from(visitorsTable)
      .where(sql`${visitorsTable.updatedAt} > NOW() - INTERVAL '45 seconds'`);
    const [recentWagers] = await db
      .select({ total: sum(betsTable.amount) })
      .from(betsTable)
      .where(sql`${betsTable.createdAt} > NOW() - INTERVAL '1 hour'`);
    res.json({
      onlineNow:    Number(online.count ?? 0),
      wageredHour:  parseFloat(recentWagers.total ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "Live stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/stats/heartbeat — marks the current browser as online immediately.
// The frontend pings this often, so /stats/live reflects real users instead of
// waiting for server-rendered page requests that never hit the API on a static site.
statsRouter.post("/heartbeat", async (req, res) => {
  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
    const fingerprint = typeof body.visitorId === "string" && body.visitorId.trim()
      ? body.visitorId.trim()
      : req.headers["x-visitor-fingerprint"]?.toString();
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"]?.toString() || "unknown";
    const lastPage = typeof body.path === "string" ? body.path.slice(0, 500) : "/";

    const [existing] = await db
      .select({ id: visitorsTable.id })
      .from(visitorsTable)
      .where(fingerprint ? eq(visitorsTable.fingerprint, fingerprint) : eq(visitorsTable.ip, ip))
      .limit(1);

    if (existing) {
      await db
        .update(visitorsTable)
        .set({
          fingerprint: fingerprint ?? null,
          ip,
          userAgent,
          deviceType: getDeviceType(userAgent),
          lastPage,
          visitCount: sql`${visitorsTable.visitCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(visitorsTable.id, existing.id));
    } else {
      await db.insert(visitorsTable).values({
        fingerprint: fingerprint ?? null,
        ip,
        userAgent,
        deviceType: getDeviceType(userAgent),
        lastPage,
      });
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Online heartbeat error");
    res.status(500).json({ error: "Internal server error" });
  }
});
