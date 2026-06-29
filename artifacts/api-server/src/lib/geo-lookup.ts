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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(clean)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "DGC-Arcade/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    if (!data.country_code || data.error) return null;
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
  } catch {
    return null;
  }
}
