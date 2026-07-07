/** Server-side IP geolocation — never trust client-reported country codes. */
export interface ServerGeoResult {
  ip: string;
  country_code: string;
  country_name: string;
  region: string;
  city: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  asn?: string;
  org?: string;
}

export async function lookupGeoByIp(ip: string): Promise<ServerGeoResult | null> {
  const clean = ip.replace(/^::ffff:/, "").trim();
  if (!clean || clean === "127.0.0.1" || clean === "::1") return null;

  // Try ipapi.co first (primary)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(clean)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "DGC-Arcade/1.0" },
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json() as Record<string, any>;
      if (data.country_code && !data.error) {
        return {
          ip: String(data.ip ?? clean),
          country_code: String(data.country_code),
          country_name: String(data.country_name ?? ""),
          region: String(data.region ?? data.region_code ?? ""),
          city: String(data.city ?? ""),
          latitude: typeof data.latitude === "number" ? data.latitude : undefined,
          longitude: typeof data.longitude === "number" ? data.longitude : undefined,
          timezone: typeof data.timezone === "string" ? data.timezone : undefined,
          asn: data.asn != null ? String(data.asn) : undefined,
          org: typeof data.org === "string" ? data.org : undefined,
        };
      }
    }
  } catch (err) {
    // Fall through to second provider
  }

  // Fallback to ip-api.com (secondary)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,message,country,countryCode,regionName,city,lat,lon,timezone,as,org,query`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as Record<string, any>;
      if (data.status === "success") {
        return {
          ip: String(data.query ?? clean),
          country_code: String(data.countryCode),
          country_name: String(data.country ?? ""),
          region: String(data.regionName ?? ""),
          city: String(data.city ?? ""),
          latitude: typeof data.lat === "number" ? data.lat : undefined,
          longitude: typeof data.lon === "number" ? data.lon : undefined,
          timezone: typeof data.timezone === "string" ? data.timezone : undefined,
          asn: typeof data.as === "string" ? data.as.split(" ")[0] : undefined,
          org: typeof data.org === "string" ? data.org : undefined,
        };
      }
    }
  } catch (err) {
    // Both failed
  }

  return null;
}
