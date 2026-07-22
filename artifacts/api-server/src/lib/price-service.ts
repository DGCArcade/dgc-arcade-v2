import { logger } from "./logger.js";

const COINBASE_SYMBOL_MAP: Record<string, string> = {
  BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
  BCH: "BCH", TRX: "TRX", XMR: "XMR", DASH: "DASH", TON: "TON",
};

const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", LTC: "litecoin", DOGE: "dogecoin",
  SOL: "solana", BCH: "bitcoin-cash", TRX: "tron", XMR: "monero",
  DASH: "dash", TON: "the-open-network",
};

const STABLECOINS = new Set(["USDT", "USDT_TRX", "USDT_TON", "USDC", "DAI"]);

// Live price cache — expires after CACHE_TTL to trigger fresh fetches
const priceCache: Record<string, { price: number; timestamp: number }> = {};
// Last-known-good price — never expires; used as fallback when all providers fail
// This prevents the "return 0" bug where a transient API outage zeros out balances
const lastGoodPrice: Record<string, number> = {};

const CACHE_TTL = 15 * 1000; // 15s — balances don't need tick-level prices; cuts external API load

export async function getCryptoPrice(currency: string): Promise<number> {
  if (STABLECOINS.has(currency)) return 1.0;

  const now = Date.now();
  if (priceCache[currency] && (now - priceCache[currency].timestamp) < CACHE_TTL) {
    return priceCache[currency].price;
  }

  // 1. Coinbase
  const cbSymbol = COINBASE_SYMBOL_MAP[currency];
  if (cbSymbol) {
    try {
      const resp = await fetch(`https://api.coinbase.com/v2/prices/${cbSymbol}-USD/spot`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json() as any;
        const price = parseFloat(data.data?.amount || "0");
        if (price > 0) {
          priceCache[currency] = { price, timestamp: now };
          lastGoodPrice[currency] = price;
          return price;
        }
      }
    } catch (e) { logger.debug({ currency, err: e }, "Coinbase price fetch failed"); }
  }

  // 2. CoinGecko
  const geckoId = COINGECKO_ID_MAP[currency];
  if (geckoId) {
    try {
      const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json() as any;
        const price = data[geckoId]?.usd;
        if (price > 0) {
          priceCache[currency] = { price, timestamp: now };
          lastGoodPrice[currency] = price;
          return price;
        }
      }
    } catch (e) { logger.debug({ currency, err: e }, "CoinGecko price fetch failed"); }
  }

  // 3. Plisio (Last resort)
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;
  if (PLISIO_KEY) {
    try {
      const resp = await fetch(`https://api.plisio.net/api/v1/currencies/${currency}?api_key=${PLISIO_KEY}`, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json() as any;
      if (data.status === "success" && data.data) {
        const price = parseFloat(data.data.rate_usd || data.data.price_usd || "0");
        if (price > 0) {
          priceCache[currency] = { price, timestamp: now };
          lastGoodPrice[currency] = price;
          return price;
        }
      }
    } catch (e) { logger.debug({ currency, err: e }, "Plisio price fetch failed"); }
  }

  // All providers failed. Return last known good price to avoid returning 0,
  // which would cause balance miscalculations and potentially allow over-spending.
  if (lastGoodPrice[currency]) {
    logger.warn({ currency }, "All price providers failed — using last known good price");
    return lastGoodPrice[currency];
  }

  // Truly no price ever fetched for this currency — return 0 as final fallback
  logger.error({ currency }, "All price providers failed and no cached price available — returning 0");
  return 0;
}
