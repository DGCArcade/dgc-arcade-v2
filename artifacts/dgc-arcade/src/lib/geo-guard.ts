/** Haversine distance in km between two lat/lon points. */
export function geoDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Reject browser GPS when it diverges sharply from IP geolocation (e.g. Chrome DevTools Sensors).
 * Jurisdiction is always decided from server-side IP lookup — never from client GPS.
 */
export function gpsConsistentWithIpGeo(
  gpsLat: number,
  gpsLon: number,
  ipLat?: number | null,
  ipLon?: number | null,
  maxKm = 200,
): boolean {
  if (ipLat == null || ipLon == null || Number.isNaN(ipLat) || Number.isNaN(ipLon)) {
    return true;
  }
  return geoDistanceKm(gpsLat, gpsLon, ipLat, ipLon) <= maxKm;
}
