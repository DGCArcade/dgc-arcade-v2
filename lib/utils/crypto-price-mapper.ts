/**
 * Crypto Price Mapper
 * 
 * Integrates with the live crypto price feed to convert between crypto amounts and USD.
 * Ensures all betting operations use real-time prices at the exact moment of bet placement.
 * Prevents price exploit variations during match payouts or slot spins.
 */

export interface CryptoPriceSnapshot {
  [cryptoType: string]: {
    usdPrice: number;
    timestamp: number; // milliseconds
    source: string; // e.g., "binance", "coingecko"
  };
}

/**
 * Global crypto price cache — updated in real-time by the system
 * This is populated by your existing live crypto price feed
 */
let cryptoPriceCache: CryptoPriceSnapshot = {};

/**
 * Initialize the crypto price cache from your live feed
 * Call this on app startup and whenever prices update
 */
export function initializeCryptoPrices(prices: CryptoPriceSnapshot) {
  cryptoPriceCache = prices;
}

/**
 * Update a single crypto price (called by your real-time price feed)
 */
export function updateCryptoPrice(cryptoType: string, usdPrice: number, source: string = "system") {
  cryptoPriceCache[cryptoType] = {
    usdPrice,
    timestamp: Date.now(),
    source,
  };
}

/**
 * Get current USD price for a crypto type
 * Returns null if crypto is not in the price feed
 */
export function getCryptoPrice(cryptoType: string): number | null {
  return cryptoPriceCache[cryptoType]?.usdPrice ?? null;
}

/**
 * Convert crypto amount to USD using real-time price
 * @param cryptoAmount Amount in crypto (e.g., 0.05 BTC)
 * @param cryptoType Crypto symbol (e.g., "BTC", "ETH", "USDT")
 * @returns USD equivalent or null if price unavailable
 */
export function cryptoToUsd(cryptoAmount: number, cryptoType: string): number | null {
  const price = getCryptoPrice(cryptoType);
  if (!price) return null;
  return cryptoAmount * price;
}

/**
 * Convert USD amount to crypto using real-time price
 * @param usdAmount Amount in USD (e.g., 100)
 * @param cryptoType Crypto symbol (e.g., "BTC", "ETH", "USDT")
 * @returns Crypto equivalent or null if price unavailable
 */
export function usdToCrypto(usdAmount: number, cryptoType: string): number | null {
  const price = getCryptoPrice(cryptoType);
  if (!price) return null;
  return usdAmount / price;
}

/**
 * Get a snapshot of all current crypto prices
 * Used for displaying the user's balance in multiple formats
 */
export function getAllCryptoPrices(): CryptoPriceSnapshot {
  return { ...cryptoPriceCache };
}

/**
 * Format a crypto balance as USD with the price snapshot at bet time
 * @param cryptoAmount The actual crypto balance
 * @param cryptoType The crypto type
 * @param priceAtTime The USD price at the moment of bet (for audit trail)
 * @returns Formatted USD string
 */
export function formatCryptoAsUsd(
  cryptoAmount: number,
  cryptoType: string,
  priceAtTime?: number
): string {
  const price = priceAtTime ?? getCryptoPrice(cryptoType);
  if (!price) return "N/A";
  const usdValue = cryptoAmount * price;
  return `$${usdValue.toFixed(2)} USD`;
}

/**
 * Validate that a bet amount is within user's balance
 * Accounts for real-time crypto price fluctuations
 * @param userCryptoBalance User's actual crypto balance
 * @param betAmountUsd The USD amount they want to bet
 * @param cryptoType The crypto type of their balance
 * @returns true if they have sufficient balance, false otherwise
 */
export function validateBetAmount(
  userCryptoBalance: number,
  betAmountUsd: number,
  cryptoType: string
): boolean {
  const cryptoNeeded = usdToCrypto(betAmountUsd, cryptoType);
  if (cryptoNeeded === null) return false;
  return userCryptoBalance >= cryptoNeeded;
}

/**
 * Get the supported crypto types from the price feed
 */
export function getSupportedCryptos(): string[] {
  return Object.keys(cryptoPriceCache);
}

/**
 * Check if a crypto type is supported
 */
export function isCryptoSupported(cryptoType: string): boolean {
  return cryptoType in cryptoPriceCache;
}
