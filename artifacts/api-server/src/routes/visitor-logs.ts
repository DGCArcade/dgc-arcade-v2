import { Router } from "express";
import { db, visitorsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

export const visitorLogsRouter = Router();

visitorLogsRouter.use(requireAdmin);

// GET /api/admin/visitor-logs
visitorLogsRouter.get("/", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const search = typeof req.query.search === "string" ? req.query.search : "";

  try {
    const searchClause = search
      ? sql`${visitorsTable.ip} ILIKE ${`%${search}%`} OR ${visitorsTable.city} ILIKE ${`%${search}%`} OR ${visitorsTable.country} ILIKE ${`%${search}%`} OR ${visitorsTable.deviceType} ILIKE ${`%${search}%`}`
      : undefined;

    const logs = searchClause
      ? await db.select().from(visitorsTable).where(searchClause).orderBy(desc(visitorsTable.updatedAt)).limit(limit).offset(offset)
      : await db.select().from(visitorsTable).orderBy(desc(visitorsTable.updatedAt)).limit(limit).offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(visitorsTable);

    res.json({
      logs: logs.map((log) => ({
        id: log.id,
        fingerprint: log.fingerprint,
        ip: log.ip,
        deviceType: log.deviceType,
        os: log.os,
        browser: log.browser,
        country: log.country,
        countryCode: log.countryCode,
        city: log.city,
        lat: log.lat,
        lon: log.lon,
        isVpn: log.isVpn,
        lastPage: log.lastPage,
        visitCount: log.visitCount,
        createdAt: log.createdAt?.toISOString(),
        updatedAt: log.updatedAt?.toISOString(),
      })),
      total: Number(count),
    });
  } catch (err) {
    req.log.error({ err }, "Visitor logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/visitor-logs/stats
visitorLogsRouter.get("/stats", async (req, res) => {
  try {
    const [totalVisitors] = await db
      .select({ count: sql<number>`count(distinct ${visitorsTable.fingerprint})` })
      .from(visitorsTable);

    const [uniqueIps] = await db
      .select({ count: sql<number>`count(distinct ${visitorsTable.ip})` })
      .from(visitorsTable);

    const [vpnCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(visitorsTable)
      .where(sql`${visitorsTable.isVpn} = true`);

    const [topCountries] = await db
      .select({
        country: visitorsTable.country,
        count: sql<number>`count(*) as cnt`,
      })
      .from(visitorsTable)
      .groupBy(visitorsTable.country)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const [topDevices] = await db
      .select({
        deviceType: visitorsTable.deviceType,
        count: sql<number>`count(*) as cnt`,
      })
      .from(visitorsTable)
      .groupBy(visitorsTable.deviceType)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    res.json({
      totalVisitors: totalVisitors?.count ?? 0,
      uniqueIps: uniqueIps?.count ?? 0,
      vpnDetected: vpnCount?.count ?? 0,
      topCountries: topCountries ?? [],
      topDevices: topDevices ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Visitor stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});
