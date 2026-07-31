import { useState } from "react";

export interface CurrencyMeta {
  value: string;
  name: string;
  symbol: string;
  color: string;
  network: string;
  /** Short label shown next to USDT variants (TRC-20 / TON). */
  shortLabel?: string;
}

// Single source of truth for supported crypto currencies + their brand colors.
// USDT uses the same Tether mark on every chain — network badges distinguish variants.
export const CURRENCIES: CurrencyMeta[] = [
  { value: "BTC",      name: "Bitcoin",           symbol: "₿", color: "#F7931A", network: "" },
  { value: "ETH",      name: "Ethereum",          symbol: "Ξ", color: "#627EEA", network: "" },
  { value: "LTC",      name: "Litecoin",          symbol: "Ł", color: "#345D9D", network: "" },
  { value: "USDT_TRX", name: "Tether USDT",       symbol: "₮", color: "#26A17B", network: "TRC-20", shortLabel: "USDT" },
  { value: "USDT_TON", name: "Tether USDT",       symbol: "₮", color: "#26A17B", network: "TON",    shortLabel: "USDT" },
  { value: "SOL",      name: "Solana",            symbol: "◎", color: "#9945FF", network: "" },
  { value: "DOGE",     name: "Dogecoin",          symbol: "Ð", color: "#C2A633", network: "" },
  { value: "TRX",      name: "Tron",              symbol: "T", color: "#EF0027", network: "" },
  { value: "TON",      name: "Toncoin",           symbol: "◆", color: "#0098EA", network: "" },
  { value: "BCH",      name: "Bitcoin Cash",      symbol: "Ƀ", color: "#0AC18E", network: "" },
  { value: "XMR",      name: "Monero",            symbol: "ɱ", color: "#FF6600", network: "" },
  { value: "DASH",     name: "Dash",              symbol: "D", color: "#008CE7", network: "" },
];

/** Network badge colors — Tron red / TON blue (real brand colors). */
const NETWORK_BADGE: Record<string, { bg: string; label: string; title: string }> = {
  USDT_TRX: { bg: "#EF0027", label: "TRX", title: "USDT on Tron (TRC-20)" },
  USDT_TON: { bg: "#0098EA", label: "TON", title: "USDT on TON" },
};

export function getCurrencyMeta(value: string): CurrencyMeta {
  return (
    CURRENCIES.find((c) => c.value === value) ??
    CURRENCIES.find((c) => c.value.split("_")[0] === value) ??
    CURRENCIES[0]
  );
}

export function getCurrencyDisplayLabel(value: string): string {
  const meta = getCurrencyMeta(value);
  if (meta.network) return `USDT · ${meta.network}`;
  return meta.shortLabel ?? meta.value.split("_")[0];
}

// "icon" set — just the coin logo/symbol on a transparent background,
// colored in each coin's brand color. No disc or circle background.
const CDN = "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/icon";

const LOGO_URL: Record<string, string> = {
  BTC:      `${CDN}/btc.svg`,
  ETH:      `${CDN}/eth.svg`,
  LTC:      `${CDN}/ltc.svg`,
  USDT_TRX: `${CDN}/usdt.svg`,
  USDT_TON: `${CDN}/usdt.svg`,
  USDT:     `${CDN}/usdt.svg`,
  SOL:      `${CDN}/sol.svg`,
  DOGE:     `${CDN}/doge.svg`,
  TRX:      `${CDN}/trx.svg`,
  TON:      `${CDN}/ton.svg`,
  BCH:      `${CDN}/bch.svg`,
  XMR:      `${CDN}/xmr.svg`,
  DASH:     `${CDN}/dash.svg`,
};

export function CoinIcon({
  currency,
  size = 18,
  className,
  showNetworkBadge = true,
}: {
  currency: string;
  size?: number;
  className?: string;
  /** Corner badge for USDT TRC-20 (Tron red) / USDT TON (TON blue). Default on. */
  showNetworkBadge?: boolean;
}) {
  const c = getCurrencyMeta(currency);
  const src = LOGO_URL[currency] ?? LOGO_URL[currency.split("_")[0]];
  const [imgError, setImgError] = useState(false);
  const badge = showNetworkBadge ? NETWORK_BADGE[currency] ?? NETWORK_BADGE[c.value] : undefined;
  const badgeSize = Math.max(10, Math.round(size * 0.48));

  const logo = src && !imgError ? (
    <img
      src={src}
      width={size}
      height={size}
      alt={badge?.title ?? c.name}
      title={badge?.title ?? c.name}
      onError={() => setImgError(true)}
      style={{ flexShrink: 0, display: "block", width: size, height: size }}
      className={badge ? undefined : className}
    />
  ) : (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-label={badge?.title ?? c.name}
      role="img"
      style={{ flexShrink: 0, display: "block" }}
    >
      <circle cx="16" cy="16" r="16" fill={c.color} />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="17"
        fontWeight={700}
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        {c.symbol}
      </text>
    </svg>
  );

  if (!badge) {
    return <span className={className} style={{ display: "inline-flex", flexShrink: 0 }}>{logo}</span>;
  }

  return (
    <span
      className={className}
      title={badge.title}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
        width: size,
        height: size,
      }}
    >
      {logo}
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          width: badgeSize,
          height: badgeSize,
          borderRadius: "9999px",
          background: badge.bg,
          color: "#fff",
          fontSize: Math.max(6, Math.round(badgeSize * 0.42)),
          fontWeight: 800,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid rgba(0,0,0,0.45)",
          letterSpacing: "-0.02em",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        {badge.label === "TRX" ? "T" : "◆"}
      </span>
    </span>
  );
}
