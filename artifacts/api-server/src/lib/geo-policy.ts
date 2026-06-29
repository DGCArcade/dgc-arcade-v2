/** Jurisdictions where DGC Arcade is not licensed to operate. */
export const BLOCKED_COUNTRIES = [
  "GB", "FR", "NL", "AU", "BE", "DK", "DE", "IT", "RO", "ES", "SE", "CH", "CZ",
] as const;

/** The entire United States is allowed — no per-state restriction. */
export function isJurisdictionAllowed(countryCode: string, _region?: string | null): boolean {
  const cc = countryCode.trim().toUpperCase();
  if (!cc) return false;
  if ((BLOCKED_COUNTRIES as readonly string[]).includes(cc)) return false;
  return true;
}
