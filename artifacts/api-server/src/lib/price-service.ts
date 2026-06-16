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

const STABLECOINS = new Set(["USDT_TRX", "USDT_TON", "USDC", "DAI"]);

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const CACHE_TTL = 5 * 1000; // 5 seconds for real-time market reflection

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
          return price;
        }
      }
    } catch (e) { logger.debug({ currency, err: e }, "Plisio price fetch failed"); }
  }

  return priceCache[currency]?.price || 0;
}
