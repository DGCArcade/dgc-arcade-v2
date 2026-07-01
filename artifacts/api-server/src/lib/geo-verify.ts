import { eq } from "drizzle-orm";
import type { Request } from "express";
import { db, usersTable } from "@workspace/db";
import { lookupGeoByIp } from "./geo-lookup.js";
import { evaluateIpAccess } from "./geo-policy.js";
import { getRequestContext } from "./request-context.js";
import { logActivity } from "../services/activity-log.js";

export type GeoVerifyResult =
  | { ok: true; countryCode: string; vpn: boolean }
  | { ok: false; status: number; error: string; code: string };

/** Fresh server-IP geo check + user record update. Never trusts client-reported country. */
export async function verifyRequestGeo(req: Request, userId: number): Promise<GeoVerifyResult> {
  const ctx = getRequestContext(req);
  const serverGeo = await lookupGeoByIp(ctx.ip);

  if (!serverGeo?.country_code) {
    await db
      .update(usersTable)
      .set({ locationVerified: false })
      .where(eq(usersTable.id, userId));

    logActivity({
      userId,
      action: "geo_denied",
      ctx,
      metadata: { reason: "lookup_failed", ip: ctx.ip },
    });

    return {
      ok: false,
      status: 403,
      error: "Unable to verify location from server IP. Try again without VPN or proxy.",
      code: "GEO_LOOKUP_FAILED",
    };
  }

  const access = evaluateIpAccess(serverGeo);

  const updates = {
    geoCountry: serverGeo.country_name,
    geoCountryCode: serverGeo.country_code.toUpperCase(),
    geoRegion: serverGeo.region,
    geoCity: serverGeo.city,
    geoIp: serverGeo.ip,
    geoAsn: serverGeo.asn,
    geoIsp: serverGeo.org,
    geoLat: serverGeo.latitude != null ? String(serverGeo.latitude) : undefined,
    geoLon: serverGeo.longitude != null ? String(serverGeo.longitude) : undefined,
    geoTimezone: serverGeo.timezone,
    vpnDetected: access.vpn || access.datacenter || access.tor,
    vpnProvider: access.vpn ? (serverGeo.org ?? "VPN") : access.datacenter ? "Datacenter" : access.tor ? "Tor" : undefined,
    locationVerified: access.allowed,
  };

  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

  if (!access.allowed) {
    logActivity({
      userId,
      action: "geo_denied",
      ctx,
      metadata: {
        code: access.code,
        countryCode: serverGeo.country_code,
        signals: access.signals,
        org: serverGeo.org,
      },
    });

    return {
      ok: false,
      status: 403,
      error: access.reason ?? "Location verification failed.",
      code: access.code ?? "GEO_DENIED",
    };
  }

  logActivity({
    userId,
    action: "geo_verified",
    ctx,
    metadata: {
      countryCode: serverGeo.country_code,
      city: serverGeo.city,
      freshCheck: true,
    },
  });

  return {
    ok: true,
    countryCode: serverGeo.country_code,
    vpn: false,
  };
}
