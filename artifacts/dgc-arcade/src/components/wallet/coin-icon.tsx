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
  { value: "BTC",      name: "Bitcoin",      symbol: "₿", color: "#F7931A", network: "" },
  { value: "ETH",      name: "Ethereum",     symbol: "Ξ", color: "#627EEA", network: "" },
  { value: "LTC",      name: "Litecoin",     symbol: "Ł", color: "#345D9D", network: "" },
  { value: "USDT_TRX", name: "Tether USDT",  symbol: "₮", color: "#26A17B", network: "TRC-20", shortLabel: "USDT" },
  { value: "USDT_TON", name: "Tether USDT",  symbol: "₮", color: "#26A17B", network: "TON",    shortLabel: "USDT" },
  { value: "SOL",      name: "Solana",       symbol: "◎", color: "#9945FF", network: "" },
  { value: "DOGE",     name: "Dogecoin",     symbol: "Ð", color: "#C2A633", network: "" },
  { value: "TRX",      name: "Tron",         symbol: "T", color: "#EF0027", network: "" },
  { value: "TON",      name: "Toncoin",      symbol: "◆", color: "#0098EA", network: "" },
  { value: "BCH",      name: "Bitcoin Cash", symbol: "Ƀ", color: "#0AC18E", network: "" },
  { value: "XMR",      name: "Monero",       symbol: "ɱ", color: "#FF6600", network: "" },
  { value: "DASH",     name: "Dash",         symbol: "D", color: "#008CE7", network: "" },
];

/**
 * Network overlays for USDT variants.
 * Official Tether uses one logo across chains; exchanges distinguish with
 * Tron (red) / TON (blue) network marks — those brand colors are real.
 */
const NETWORK_BADGE: Record<string, { networkIcon: string; bg: string; title: string; fallback: string }> = {
  USDT_TRX: {
    networkIcon: "TRX",
    bg: "#EF0027",
    title: "USDT on Tron (TRC-20)",
    fallback: "T",
  },
  USDT_TON: {
    networkIcon: "TON",
    bg: "#0098EA",
    title: "USDT on TON",
    fallback: "◆",
  },
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

function SymbolFallback({
  size,
  color,
  symbol,
  label,
}: {
  size: number;
  color: string;
  symbol: string;
  label: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-label={label}
      role="img"
      style={{ flexShrink: 0, display: "block" }}
    >
      <circle cx="16" cy="16" r="16" fill={color} />
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
        {symbol}
      </text>
    </svg>
  );
}

export function CoinIcon({
  currency,
  size = 18,
  className,
  showNetworkBadge = true,
}: {
  currency: string;
  size?: number;
  className?: string;
  /** Corner badge for USDT TRC-20 (Tron) / USDT TON. Default on. */
  showNetworkBadge?: boolean;
}) {
  const c = getCurrencyMeta(currency);
  const src = LOGO_URL[currency] ?? LOGO_URL[currency.split("_")[0]];
  const [imgError, setImgError] = useState(false);
  const [badgeImgError, setBadgeImgError] = useState(false);
  const badge = showNetworkBadge ? NETWORK_BADGE[currency] ?? NETWORK_BADGE[c.value] : undefined;
  // Keep badge large enough to read at small sizes (wallet chip icons are ~16px)
  const badgeSize = Math.max(11, Math.round(size * 0.55));
  const box = badge ? size + Math.ceil(badgeSize * 0.35) : size;

  const logo = src && !imgError ? (
    <img
      src={src}
      width={size}
      height={size}
      alt={badge?.title ?? c.name}
      title={badge?.title ?? c.name}
      onError={() => setImgError(true)}
      style={{ flexShrink: 0, display: "block", width: size, height: size }}
    />
  ) : (
    <SymbolFallback size={size} color={c.color} symbol={c.symbol} label={badge?.title ?? c.name} />
  );

  if (!badge) {
    return (
      <span className={className} style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}>
        {logo}
      </span>
    );
  }

  const networkSrc = LOGO_URL[badge.networkIcon];

  return (
    <span
      className={className}
      title={badge.title}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
        width: box,
        height: box,
        lineHeight: 0,
        overflow: "visible",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, width: size, height: size }}>{logo}</span>
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: badgeSize,
          height: badgeSize,
          borderRadius: "9999px",
          background: badge.bg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid rgba(10,10,14,0.85)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {networkSrc && !badgeImgError ? (
          <img
            src={networkSrc}
            alt=""
            width={Math.round(badgeSize * 0.72)}
            height={Math.round(badgeSize * 0.72)}
            onError={() => setBadgeImgError(true)}
            style={{
              display: "block",
              width: Math.round(badgeSize * 0.72),
              height: Math.round(badgeSize * 0.72),
              // Keep TRX/TON glyphs readable on solid brand badges
              filter: "brightness(0) invert(1)",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: Math.max(7, Math.round(badgeSize * 0.5)),
              fontWeight: 800,
              lineHeight: 1,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {badge.fallback}
          </span>
        )}
      </span>
    </span>
  );
}
