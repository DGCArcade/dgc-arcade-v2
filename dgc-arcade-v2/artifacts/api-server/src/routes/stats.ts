import { Router, type Request } from "express";
import { db, usersTable, betsTable, visitorsTable } from "@workspace/db";
import { count, eq, sum, sql } from "drizzle-orm";

export const statsRouter = Router();

const ONLINE_WINDOW_MS = 45_000;
const HEARTBEAT_DB_FLUSH_MS = 60_000;
const PLATFORM_STATS_CACHE_MS = 10_000;
const RECENT_WAGERS_CACHE_MS = 10_000;

// Cache for IP geolocation lookups (ip -> geo data, 30 min TTL)
const geoCache = new Map<string, { data: GeoData; expiresAt: number }>();
const GEO_CACHE_TTL_MS = 30 * 60 * 1000;

const onlinePresence = new Map<string, number>();
const heartbeatDbFlushes = new Map<string, number>();

let platformStatsCache:
  | { expiresAt: number; value: { totalPlayers: number; totalBets: number; totalWagered: number; biggestWin: number } }
  | null = null;
let recentWagersCache: { expiresAt: number; value: number } | null = null;

interface GeoData {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  lat?: string;
  lon?: string;
  timezone?: string;
  hostname?: string;
  isp?: string;
  asn?: string;
  isVpn?: boolean;
  vpnProvider?: string;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
  return (forwarded || req.ip || "unknown").replace(/^::ffff:/, "");
}

function getDeviceType(userAgent: string): string {
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function parseOs(userAgent: string): string {
  if (/windows nt 10/i.test(userAgent)) return "Windows 10";
  if (/windows nt 11/i.test(userAgent)) return "Windows 11";
  if (/windows nt/i.test(userAgent)) return "Windows";
  if (/mac os x/i.test(userAgent)) return "macOS";
  if (/iphone os/i.test(userAgent)) return "iOS";
  if (/ipad/i.test(userAgent)) return "iPadOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/linux/i.test(userAgent)) return "Linux";
  if (/cros/i.test(userAgent)) return "ChromeOS";
  return "Unknown";
}

function parseBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return "Opera";
  if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent)) return "Chrome";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/safari\//i.test(userAgent) && !/chrome/i.test(userAgent)) return "Safari";
  if (/msie|trident/i.test(userAgent)) return "Internet Explorer";
  if (/chromium/i.test(userAgent)) return "Chromium";
  return "Unknown";
}

function isBot(userAgent: string): boolean {
  return /bot|crawler|spider|scraper|headless|curl|wget|python-requests|go-http|java\/|php\//i.test(userAgent);
}

async function fetchGeoData(ip: string): Promise<GeoData> {
  // Skip for private/local IPs
  if (!ip || ip === "unknown" || /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|localhost)/.test(ip)) {
    return {};
  }

  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    // Use ip-api.com (free, no key needed, 45 req/min)
    const resp = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,hosting,proxy,query,reverse`,
      // 'reverse' gives us the hostname/PTR record
      { signal: AbortSignal.timeout(3000) }
    );
    if (!resp.ok) return {};
    const d = await resp.json() as Record<string, unknown>;
    if (d.status !== "success") return {};

    const data: GeoData = {
      country: String(d.country ?? ""),
      countryCode: String(d.countryCode ?? ""),
      region: String(d.regionName ?? ""),
      city: String(d.city ?? ""),
      lat: String(d.lat ?? ""),
      lon: String(d.lon ?? ""),
      timezone: String(d.timezone ?? ""),
      isp: String(d.isp ?? ""),
      asn: String(d.as ?? ""),
      hostname: d.reverse ? String(d.reverse) : undefined,
      isVpn: Boolean(d.proxy) || Boolean(d.hosting),
      vpnProvider: (Boolean(d.proxy) || Boolean(d.hosting)) ? String(d.org ?? "") : undefined,
    };

    geoCache.set(ip, { data, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
    return data;
  } catch {
    return {};
  }
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
  referrer?: string;
  screenResolution?: string;
  language?: string;
  connectionType?: string;
  timeOnSite?: number;
  userId?: number;
}) {
  const { fingerprint, ip, userAgent, lastPage, referrer, screenResolution, language, connectionType, timeOnSite, userId } = args;

  // Enrich with geo data from IP (always, regardless of browser location permission)
  const geo = await fetchGeoData(ip);

  const deviceType = getDeviceType(userAgent);
  const os = parseOs(userAgent);
  const browser = parseBrowser(userAgent);
  const botDetected = isBot(userAgent);

  const [existing] = await db
    .select({ id: visitorsTable.id, pageHistory: visitorsTable.pageHistory, visitCount: visitorsTable.visitCount })
    .from(visitorsTable)
    .where(fingerprint ? eq(visitorsTable.fingerprint, fingerprint) : eq(visitorsTable.ip, ip))
    .limit(1);

  // Build updated page history (keep last 50 pages)
  const currentHistory = (Array.isArray(existing?.pageHistory) ? existing.pageHistory : []) as string[];
  const updatedHistory = [...currentHistory, lastPage].slice(-50);

  if (existing) {
    await db
      .update(visitorsTable)
      .set({
        fingerprint: fingerprint ?? null,
        ip,
        userAgent,
        deviceType,
        os,
        browser,
        lastPage,
        pageHistory: updatedHistory,
        referrer: referrer ?? null,
        screenResolution: screenResolution ?? null,
        language: language ?? null,
        connectionType: connectionType ?? null,
        visitCount: sql`${visitorsTable.visitCount} + 1`,
        totalTimeOnSite: timeOnSite ? sql`${visitorsTable.totalTimeOnSite} + ${timeOnSite}` : visitorsTable.totalTimeOnSite,
        isBot: botDetected,
        userId: userId ?? null,
        // Geo data (always update from IP)
        country: geo.country ?? null,
        countryCode: geo.countryCode ?? null,
        region: geo.region ?? null,
        city: geo.city ?? null,
        lat: geo.lat ?? null,
        lon: geo.lon ?? null,
        timezone: geo.timezone ?? null,
        isp: geo.isp ?? null,
        asn: geo.asn ?? null,
        hostname: geo.hostname ?? null,
        isVpn: geo.isVpn ?? false,
        vpnProvider: geo.vpnProvider ?? null,
        updatedAt: new Date(),
      })
      .where(eq(visitorsTable.id, existing.id));
  } else {
    await db.insert(visitorsTable).values({
      fingerprint: fingerprint ?? null,
      ip,
      userAgent,
      deviceType,
      os,
      browser,
      lastPage,
      pageHistory: [lastPage],
      referrer: referrer ?? null,
      screenResolution: screenResolution ?? null,
      language: language ?? null,
      connectionType: connectionType ?? null,
      visitCount: 1,
      totalTimeOnSite: timeOnSite ?? 0,
      isBot: botDetected,
      userId: userId ?? null,
      // Geo data
      country: geo.country ?? null,
      countryCode: geo.countryCode ?? null,
      region: geo.region ?? null,
      city: geo.city ?? null,
      lat: geo.lat ?? null,
      lon: geo.lon ?? null,
      timezone: geo.timezone ?? null,
      isp: geo.isp ?? null,
      asn: geo.asn ?? null,
      hostname: geo.hostname ?? null,
      isVpn: geo.isVpn ?? false,
      vpnProvider: geo.vpnProvider ?? null,
      firstSeenAt: new Date(),
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
// Collects full visitor data from IP (geo, device, browser) regardless of browser permissions.
statsRouter.post("/heartbeat", async (req, res) => {
  try {
    const body = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
    const fingerprint = typeof body.visitorId === "string" && body.visitorId.trim()
      ? body.visitorId.trim()
      : req.headers["x-visitor-fingerprint"]?.toString();
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"]?.toString() || "unknown";
    const lastPage = typeof body.path === "string" ? body.path.slice(0, 500) : "/";
    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 500) : undefined;
    const screenResolution = typeof body.screenResolution === "string" ? body.screenResolution : undefined;
    const language = typeof body.language === "string" ? body.language : undefined;
    const connectionType = typeof body.connectionType === "string" ? body.connectionType : undefined;
    const timeOnSite = typeof body.timeOnSite === "number" ? Math.min(body.timeOnSite, 86400) : undefined;
    const userId = typeof body.userId === "number" ? body.userId : undefined;

    const presenceKey = fingerprint || ip;
    const now = Date.now();

    onlinePresence.set(presenceKey, now);

    const lastFlush = heartbeatDbFlushes.get(presenceKey) ?? 0;
    if (now - lastFlush > HEARTBEAT_DB_FLUSH_MS) {
      heartbeatDbFlushes.set(presenceKey, now);
      persistHeartbeat({ fingerprint, ip, userAgent, lastPage, referrer, screenResolution, language, connectionType, timeOnSite, userId })
        .catch((err) => req.log.warn({ err }, "Visitor heartbeat persistence failed"));
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, onlineNow: pruneAndCountOnline(now) });
  } catch (err) {
    req.log.error({ err }, "Online heartbeat error");
    res.status(500).json({ error: "Internal server error" });
  }
});
