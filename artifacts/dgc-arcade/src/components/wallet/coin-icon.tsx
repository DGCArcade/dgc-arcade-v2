import { useState } from "react";

export interface CurrencyMeta {
  value: string;
  name: string;
  symbol: string;
  color: string;
  network: string;
  shortLabel?: string;
}

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

/** Real brand colors: Tron red / TON blue. */
const NETWORK_BADGE: Record<string, { bg: string; ring: string; title: string; kind: "trx" | "ton" }> = {
  USDT_TRX: { bg: "#EF0027", ring: "#EF0027", title: "USDT on Tron (TRC-20)", kind: "trx" },
  USDT_TON: { bg: "#0098EA", ring: "#0098EA", title: "USDT on TON", kind: "ton" },
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
  // ton.svg is not in cryptocurrency-icons@0.18.1 — use glyph fallback
  BCH:      `${CDN}/bch.svg`,
  XMR:      `${CDN}/xmr.svg`,
  DASH:     `${CDN}/dash.svg`,
};

/** Inline network marks — always render (no CDN dependency). */
function NetworkGlyph({ kind, size }: { kind: "trx" | "ton"; size: number }) {
  if (kind === "trx") {
    // Simplified Tron triangle mark
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: "block" }}>
        <path
          d="M8 2.2 L13.5 13.2 H2.5 Z M8 5.2 L5.2 11.2 h5.6 Z"
          fill="#fff"
          fillRule="evenodd"
        />
      </svg>
    );
  }
  // TON diamond
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: "block" }}>
      <path d="M8 1.6 L13.6 8 L8 14.4 L2.4 8 Z" fill="#fff" />
    </svg>
  );
}

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
  showNetworkBadge?: boolean;
}) {
  const c = getCurrencyMeta(currency);
  const src = LOGO_URL[currency] ?? LOGO_URL[currency.split("_")[0]];
  const [imgError, setImgError] = useState(false);
  const badge = showNetworkBadge ? NETWORK_BADGE[currency] ?? NETWORK_BADGE[c.value] : undefined;
  const badgeSize = Math.max(12, Math.round(size * 0.62));
  const box = badge ? Math.ceil(size + badgeSize * 0.4) : size;

  const logo = src && !imgError ? (
    <img
      src={src}
      width={size}
      height={size}
      alt={badge?.title ?? c.name}
      title={badge?.title ?? c.name}
      onError={() => setImgError(true)}
      style={{
        flexShrink: 0,
        display: "block",
        width: size,
        height: size,
        borderRadius: "9999px",
        boxShadow: badge ? `0 0 0 2px ${badge.ring}` : undefined,
      }}
    />
  ) : (
    <span style={{ boxShadow: badge ? `0 0 0 2px ${badge.ring}` : undefined, borderRadius: "9999px", display: "inline-flex" }}>
      <SymbolFallback size={size} color={c.color} symbol={c.symbol} label={badge?.title ?? c.name} />
    </span>
  );

  if (!badge) {
    return (
      <span className={className} style={{ display: "inline-flex", flexShrink: 0, lineHeight: 0 }}>
        {logo}
      </span>
    );
  }

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
        verticalAlign: "middle",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0 }}>{logo}</span>
      <span
        aria-label={badge.title}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: badgeSize,
          height: badgeSize,
          borderRadius: "9999px",
          background: badge.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid #0b0b10",
          boxShadow: "0 1px 4px rgba(0,0,0,0.65)",
          zIndex: 2,
        }}
      >
        <NetworkGlyph kind={badge.kind} size={Math.max(8, Math.round(badgeSize * 0.62))} />
      </span>
    </span>
  );
}
