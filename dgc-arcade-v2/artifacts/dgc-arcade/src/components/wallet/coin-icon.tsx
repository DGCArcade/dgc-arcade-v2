import { useState } from "react";

export interface CurrencyMeta {
  value: string;
  name: string;
  symbol: string;
  color: string;
  network: string;
}

// Single source of truth for supported crypto currencies + their brand colors.
export const CURRENCIES: CurrencyMeta[] = [
  { value: "BTC",      name: "Bitcoin",      symbol: "₿", color: "#F7931A", network: "" },
  { value: "ETH",      name: "Ethereum",     symbol: "Ξ", color: "#627EEA", network: "" },
  { value: "LTC",      name: "Litecoin",     symbol: "Ł", color: "#345D9D", network: "" },
  { value: "USDT_TRX", name: "Tether USDT",  symbol: "₮", color: "#26A17B", network: "TRC-20" },
  { value: "USDT_TON", name: "Tether USDT",  symbol: "₮", color: "#26A17B", network: "TON" },
  { value: "SOL",      name: "Solana",       symbol: "◎", color: "#9945FF", network: "" },
  { value: "DOGE",     name: "Dogecoin",     symbol: "Ð", color: "#C2A633", network: "" },
  { value: "TRX",      name: "Tron",         symbol: "T", color: "#EF0027", network: "" },
  { value: "TON",      name: "Toncoin",      symbol: "◆", color: "#0098EA", network: "" },
  { value: "BCH",      name: "Bitcoin Cash", symbol: "Ƀ", color: "#0AC18E", network: "" },
  { value: "XMR",      name: "Monero",       symbol: "ɱ", color: "#FF6600", network: "" },
  { value: "DASH",     name: "Dash",         symbol: "D", color: "#008CE7", network: "" },
];

export function getCurrencyMeta(value: string): CurrencyMeta {
  return (
    CURRENCIES.find((c) => c.value === value) ??
    CURRENCIES.find((c) => c.value.split("_")[0] === value) ??
    CURRENCIES[0]
  );
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
}: {
  currency: string;
  size?: number;
  className?: string;
}) {
  const c = getCurrencyMeta(currency);
  const src = LOGO_URL[currency] ?? LOGO_URL[currency.split("_")[0]];
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={c.name}
        title={c.name}
        onError={() => setImgError(true)}
        style={{ flexShrink: 0, display: "inline-block" }}
        className={className}
      />
    );
  }

  // Fallback: colored disc + symbol (only if CDN unavailable)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-label={c.name}
      role="img"
      style={{ flexShrink: 0 }}
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
}
