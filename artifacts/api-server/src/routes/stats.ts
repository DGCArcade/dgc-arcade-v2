import { Router, type Request } from "express";
import { db, usersTable, betsTable, visitorsTable } from "@workspace/db";
import { count, eq, sum, sql } from "drizzle-orm";

export const statsRouter = Router();

const ONLINE_WINDOW_MS = 45_000;
const HEARTBEAT_DB_FLUSH_MS = 60_000;
const PLATFORM_STATS_CACHE_MS = 10_000;
const RECENT_WAGERS_CACHE_MS = 10_000;

const onlinePresence = new Map<string, number>();
const heartbeatDbFlushes = new Map<string, number>();

let platformStatsCache:
  | { expiresAt: number; value: { totalPlayers: number; totalBets: number; totalWagered: number; biggestWin: number } }
  | null = null;
let recentWagersCache: { expiresAt: number; value: number } | null = null;

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
  return (forwarded || req.ip || "unknown").replace(/^::ffff:/, "");
}

function getDeviceType(userAgent: string): string {
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function pruneAndCountOnline(now = Date.now()): number {
  for (const [key, lastSeen] of onlinePresence) {
    if (now - lastSeen > ONLINE_WINDOW_MS) onlinePresence.delete(key);
  }
  return onlinePresence.size;
}

async function getPlatformStats() {
  const now = Date.now();
  if (platformStatsCache && platformStatsCache.expiresAt > now) return platformStatsCache.value;

  const [playerCount] = await db.select({ count: count() }).from(usersTable);
  const [betStats] = await db
    .select({
      totalBets:    count(),
      totalWagered: sum(betsTable.amount),
      biggestWin:   sql<string>`COALESCE(MAX(CAST(${betsTable.payout} AS DECIMAL)), 0)`,
    })
    .from(betsTable);

  const value = {
    totalPlayers:  playerCount.count,
    totalBets:     betStats.totalBets,
    totalWagered:  parseFloat(betStats.totalWagered ?? "0"),
    biggestWin:    parseFloat(betStats.biggestWin ?? "0"),
  };

  platformStatsCache = { value, expiresAt: now + PLATFORM_STATS_CACHE_MS };
  return value;
}

async function getRecentWagersHour(): Promise<number> {
  const now = Date.now();
  if (recentWagersCache && recentWagersCache.expiresAt > now) return recentWagersCache.value;

  const [recentWagers] = await db
    .select({ total: sum(betsTable.amount) })
    .from(betsTable)
    .where(sql`${betsTable.createdAt} > NOW() - INTERVAL '1 hour'`);
  const value = parseFloat(recentWagers.total ?? "0");

  recentWagersCache = { value, expiresAt: now + RECENT_WAGERS_CACHE_MS };
  return value;
}

async function persistHeartbeat(args: {
  fingerprint?: string;
  ip: string;
  userAgent: string;
  lastPage: string;
}) {
  const { fingerprint, ip, userAgent, lastPage } = args;
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
}

// GET /api/stats
statsRouter.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
    res.json(await getPlatformStats());
  } catch (err) {
    req.log.error({ err }, "Stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/stats/live — public endpoint for real-time platform stats
statsRouter.get("/live", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      onlineNow:    pruneAndCountOnline(),
      wageredHour:  await getRecentWagersHour(),
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
    const presenceKey = fingerprint || ip;
    const now = Date.now();

    onlinePresence.set(presenceKey, now);

    const lastFlush = heartbeatDbFlushes.get(presenceKey) ?? 0;
    if (now - lastFlush > HEARTBEAT_DB_FLUSH_MS) {
      heartbeatDbFlushes.set(presenceKey, now);
      persistHeartbeat({ fingerprint, ip, userAgent, lastPage })
        .catch((err) => req.log.warn({ err }, "Visitor heartbeat persistence failed"));
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, onlineNow: pruneAndCountOnline(now) });
  } catch (err) {
    req.log.error({ err }, "Online heartbeat error");
    res.status(500).json({ error: "Internal server error" });
  }
});
