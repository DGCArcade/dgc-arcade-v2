import type { ServerGeoResult } from "./geo-lookup.js";

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

const VPN_KEYWORDS = [
  "nordvpn", "expressvpn", "mullvad", "protonvpn", "privateinternetaccess",
  "pia vpn", "ipvanish", "cyberghost", "surfshark", "tunnelbear", "windscribe",
  "hidemyass", " hma ", "purevpn", "hotspot shield", "torguard", "vyprvpn",
  "perfect privacy", "hide.me", "astrill", "ivpn", "airvpn", "private internet access",
];

const DATACENTER_KEYWORDS = [
  "amazon", "aws", "google cloud", "google llc", "digitalocean", "linode", "vultr",
  "hetzner", "ovh", "m247", "leaseweb", "choopa", "as-choopa", "frantech",
  "quadranet", "tzulo", "psychz", "serverius", "hostwinds", "buyvm",
  "microsoft azure", "oracle cloud", "alibaba", "tencent", "contabo",
  "colocrossing", "datacamp", "packet", "equinix", "zenlayer",
];

export type IpAccessCode =
  | "JURISDICTION_BLOCKED"
  | "GEO_LOOKUP_FAILED"
  | "VPN_BLOCKED"
  | "DATACENTER_BLOCKED"
  | "TOR_BLOCKED";

export interface IpAccessEvaluation {
  allowed: boolean;
  code?: IpAccessCode;
  reason?: string;
  jurisdictionAllowed: boolean;
  vpn: boolean;
  datacenter: boolean;
  tor: boolean;
  signals: string[];
}

export function classifyIpRisk(geo: Pick<ServerGeoResult, "org" | "asn">): {
  vpn: boolean;
  datacenter: boolean;
  tor: boolean;
  signals: string[];
} {
  const orgLower = (geo.org ?? "").toLowerCase();
  const signals: string[] = [];

  const vpn = VPN_KEYWORDS.some(k => orgLower.includes(k));
  if (vpn) signals.push("vpn_provider");

  const datacenter = DATACENTER_KEYWORDS.some(k => orgLower.includes(k));
  if (datacenter) signals.push("datacenter_ip");

  const tor =
    orgLower.includes("tor ") ||
    orgLower.includes("tor-") ||
    orgLower.includes("torproject") ||
    orgLower.includes("tor exit");
  if (tor) signals.push("tor_exit");

  return { vpn, datacenter, tor, signals };
}

/** Server-side IP policy — used on every sensitive action (not just the DB flag). */
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
      signals: ["geo_lookup_failed"],
    };
  }

  const cc = geo.country_code.toUpperCase();
  const jurisdictionAllowed = isJurisdictionAllowed(cc, geo.region);
  const { vpn, datacenter, tor, signals } = classifyIpRisk(geo);

  if (!jurisdictionAllowed) {
    return {
      allowed: false,
      code: "JURISDICTION_BLOCKED",
      reason: "DGC Arcade is not available in your region.",
      jurisdictionAllowed: false,
      vpn,
      datacenter,
      tor,
      signals: [...signals, "jurisdiction_blocked"],
    };
  }

  if (tor) {
    return {
      allowed: false,
      code: "TOR_BLOCKED",
      reason: "Tor and anonymized proxy connections cannot be used for play or withdrawals.",
      jurisdictionAllowed: true,
      vpn,
      datacenter,
      tor,
      signals,
    };
  }

  if (vpn) {
    return {
      allowed: false,
      code: "VPN_BLOCKED",
      reason: "VPN and proxy connections cannot be used for play or withdrawals. Disable your VPN and retry.",
      jurisdictionAllowed: true,
      vpn,
      datacenter,
      tor,
      signals,
    };
  }

  if (datacenter) {
    return {
      allowed: false,
      code: "DATACENTER_BLOCKED",
      reason: "Hosting and datacenter IPs cannot be used for play or withdrawals.",
      jurisdictionAllowed: true,
      vpn,
      datacenter,
      tor,
      signals,
    };
  }

  return {
    allowed: true,
    jurisdictionAllowed: true,
    vpn: false,
    datacenter: false,
    tor: false,
    signals,
  };
}
