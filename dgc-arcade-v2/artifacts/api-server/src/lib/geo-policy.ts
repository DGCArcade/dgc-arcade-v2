import type { ServerGeoResult } from "./geo-lookup.js";

/** Jurisdictions where DGC Arcade is not licensed to operate (political / regulatory). */
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

/**
 * Consumer networks we never block — Starlink, cell towers, home ISPs.
 * VPN/datacenter/Tor are allowed in permitted jurisdictions.
 */
const CONSUMER_NETWORK_WHITELIST = [
  "spacex", "starlink", "verizon", "at&t", "att mobility", "t-mobile", "tmobile",
  "sprint", "comcast", "xfinity", "charter", "spectrum", "cox", "frontier",
  "centurylink", "lumen", "vodafone", "orange", "telefonica", "deutsche telekom",
  "telstra", "bell canada", "rogers", "telus", "t-mobile usa", "cellco",
  "cricket", "metro pcs", "boost mobile", "us cellular", "google fiber",
  "starlink customer", "spacex services",
];

/** State / government backbone indicators — blocked only in non-licensed jurisdictions. */
const STATE_ACTOR_KEYWORDS = [
  "government", "gov network", "gov.", "ministry", "minister", "federal network",
  "military", "defence network", "defense network", "armed forces", "navy network",
  "army network", "air force", "intelligence", "national security", "state security",
  "interior ministry", "cabinet office", "parliament", "presidency", "gchq",
  "administration network", "public sector", "civil service",
];

export type IpAccessCode =
  | "JURISDICTION_BLOCKED"
  | "GEO_LOOKUP_FAILED"
  | "STATE_NETWORK_BLOCKED";

export interface IpAccessEvaluation {
  allowed: boolean;
  code?: IpAccessCode;
  reason?: string;
  jurisdictionAllowed: boolean;
  vpn: boolean;
  datacenter: boolean;
  tor: boolean;
  stateActor: boolean;
  consumerNetwork: boolean;
  signals: string[];
}

export function isConsumerNetwork(org?: string | null): boolean {
  if (!org) return false;
  const orgLower = org.toLowerCase();
  return CONSUMER_NETWORK_WHITELIST.some(k => orgLower.includes(k));
}

export function isStateActorNetwork(org?: string | null): boolean {
  if (!org) return false;
  const orgLower = org.toLowerCase();
  if (isConsumerNetwork(org)) return false;
  return STATE_ACTOR_KEYWORDS.some(k => orgLower.includes(k));
}

/** Legacy classify — advisory signals only (not used to block play). */
export function classifyIpRisk(geo: Pick<ServerGeoResult, "org" | "asn">): {
  vpn: boolean;
  datacenter: boolean;
  tor: boolean;
  signals: string[];
} {
  const orgLower = (geo.org ?? "").toLowerCase();
  const signals: string[] = [];
  const vpnKeywords = ["vpn", "nordvpn", "mullvad", "protonvpn", "surfshark"];
  const vpn = vpnKeywords.some(k => orgLower.includes(k));
  if (vpn) signals.push("vpn_provider");
  const datacenter = ["amazon", "aws", "google cloud", "digitalocean", "hetzner"].some(k => orgLower.includes(k));
  if (datacenter) signals.push("datacenter_ip");
  const tor = orgLower.includes("tor ") || orgLower.includes("torproject");
  if (tor) signals.push("tor_exit");
  return { vpn, datacenter, tor, signals };
}

/**
 * Political-level geo policy:
 * - Block non-licensed countries
 * - In blocked jurisdictions, also block obvious state/government backbone hosts
 * - Allow VPN, Starlink, cellular, and residential ISPs in permitted regions (e.g. US)
 */
export function evaluateIpAccess(geo: ServerGeoResult | null): IpAccessEvaluation {
  if (!geo?.country_code) {
    return {
      allowed: false,
      code: "GEO_LOOKUP_FAILED",
      reason: "Unable to verify your location from server IP.",
      jurisdictionAllowed: false,
      vpn: false,
      datacenter: false,
      tor: false,
      stateActor: false,
      consumerNetwork: false,
      signals: ["geo_lookup_failed"],
    };
  }

  const cc = geo.country_code.toUpperCase();
  const jurisdictionAllowed = isJurisdictionAllowed(cc, geo.region);
  const advisory = classifyIpRisk(geo);
  const consumerNetwork = isConsumerNetwork(geo.org);
  const stateActor = isStateActorNetwork(geo.org);

  if (!jurisdictionAllowed) {
    if (stateActor && !consumerNetwork) {
      return {
        allowed: false,
        code: "STATE_NETWORK_BLOCKED",
        reason: "Government network access is not permitted from this region.",
        jurisdictionAllowed: false,
        vpn: advisory.vpn,
        datacenter: advisory.datacenter,
        tor: advisory.tor,
        stateActor: true,
        consumerNetwork,
        signals: [...advisory.signals, "state_actor_blocked_region"],
      };
    }
    return {
      allowed: false,
      code: "JURISDICTION_BLOCKED",
      reason: "DGC Arcade is not available in your region.",
      jurisdictionAllowed: false,
      vpn: advisory.vpn,
      datacenter: advisory.datacenter,
      tor: advisory.tor,
      stateActor,
      consumerNetwork,
      signals: [...advisory.signals, "jurisdiction_blocked"],
    };
  }

  return {
    allowed: true,
    jurisdictionAllowed: true,
    vpn: advisory.vpn,
    datacenter: advisory.datacenter,
    tor: advisory.tor,
    stateActor,
    consumerNetwork,
    signals: advisory.signals,
  };
}
