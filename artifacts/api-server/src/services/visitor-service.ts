import { db, visitorsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Request } from "express";

export async function logVisitor(req: Request) {
  const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  const fingerprint = req.headers["x-visitor-fingerprint"]?.toString();
  const path = req.url;

  // Basic device detection from user agent
  let deviceType = "desktop";
  if (/mobile/i.test(userAgent)) deviceType = "mobile";
  else if (/tablet/i.test(userAgent)) deviceType = "tablet";

  try {
    // We use fingerprint if available, otherwise fallback to IP
    const identifier = fingerprint || ip;
    
    // Check if visitor exists
    const [existing] = await db
      .select()
      .from(visitorsTable)
      .where(fingerprint ? eq(visitorsTable.fingerprint, fingerprint) : eq(visitorsTable.ip, ip))
      .limit(1);

    if (existing) {
      await db
        .update(visitorsTable)
        .set({
          lastPage: path,
          visitCount: sql`${visitorsTable.visitCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(visitorsTable.id, existing.id));
    } else {
      await db.insert(visitorsTable).values({
        fingerprint,
        ip,
        userAgent,
        deviceType,
        lastPage: path,
      });
    }
  } catch (err) {
    // Silent fail for logging to not block request
    console.error("Visitor logging failed:", err);
  }
}
