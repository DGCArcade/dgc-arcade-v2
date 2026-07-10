import { db, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { notifyWithdrawalStatus } from "../services/withdrawal-notify.js";

const PLISIO_PAYOUT_MAP: Record<string, string> = {
  BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
  BCH: "BCH", TRX: "TRX", TON: "TON", XMR: "XMR", DASH: "DASH",
  USDT: "USDT_TRX", USDT_TRX: "USDT_TRX", USDT_TON: "USDT_TON",
  USDC: "USDC",
};

// Coinbase base symbols — their public /v2/prices/{BASE}-USD/spot endpoint
const COINBASE_SYMBOL_MAP: Record<string, string> = {
  BTC:  "BTC",  ETH:  "ETH",  LTC: "LTC",  DOGE: "DOGE",
  SOL:  "SOL",  BCH:  "BCH",  TRX: "TRX",  XMR:  "XMR",
  DASH: "DASH", TON:  "TON", USDC: "USDC",
};

// CoinGecko IDs (free API, used as secondary fallback)
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC:  "bitcoin",       ETH:  "ethereum",        LTC:  "litecoin",
  DOGE: "dogecoin",      SOL:  "solana",           BCH:  "bitcoin-cash",
  TRX:  "tron",          XMR:  "monero",           DASH: "dash",
  TON:  "the-open-network", USDC: "usd-coin",
};

// Stablecoins — always worth exactly $1 USD, no API call needed
const STABLECOINS = new Set(["USDT_TRX", "USDT_TON", "USDC", "DAI"]);

interface MinLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export type PayoutOutcome =
  | { outcome: "completed";         id: number; txHash: string | null; amount: number }
  | { outcome: "needs_review";      message: string }
  | { outcome: "reverted_pending";  message: string }
  | {
      outcome: "provider_insufficient_funds";
      message: string;
      currency: string;
      requiredCrypto: number;
      availableCrypto: number | null;
      requiredUsd: number;
    }
  | { outcome: "already_processing" }
  | { outcome: "no_key" }
  | { outcome: "no_address" };

export type PayoutReadiness =
  | {
      ok: true;
      currency: string;
      cryptoAmount: string;
      rate: number;
      availableCrypto: number | null;
    }
  | {
      ok: false;
      reason: "conversion_failed";
      message: string;
      currency: string;
      requiredUsd: number;
    }
  | {
      ok: false;
      reason: "insufficient_provider_funds";
      message: string;
      currency: string;
      requiredCrypto: number;
      availableCrypto: number | null;
      requiredUsd: number;
    };

function parseNumeric(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeCoinKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractBalanceFromEntry(entry: unknown): number | null {
  if (typeof entry === "string" || typeof entry === "number") return parseNumeric(entry);
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;
  return (
    parseNumeric(obj.balance) ??
    parseNumeric(obj.available) ??
    parseNumeric(obj.available_balance) ??
    parseNumeric(obj.amount)
  );
}

async function fetchPlisioProviderBalance(apiKey: string, currency: string, log: MinLogger): Promise<number | null> {
  const targetKey = normalizeCoinKey(currency);

  try {
    const params = new URLSearchParams({ api_key: apiKey });
    const resp = await fetch(
      `https://api.plisio.net/api/v1/balances?${params.toString()}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const data = await resp.json() as {
      status?: string;
      data?: Record<string, unknown>;
    };
    if (data.status === "success" && data.data) {
      for (const [key, entry] of Object.entries(data.data)) {
        if (normalizeCoinKey(key) === targetKey) {
          const balance = extractBalanceFromEntry(entry);
          if (balance !== null) return balance;
        }
      }
    }
  } catch (err) {
    log.error({ err, currency }, "Plisio /balances preflight failed");
  }

  try {
    const params = new URLSearchParams({ api_key: apiKey });
    const resp = await fetch(
      `https://api.plisio.net/api/v1/currencies/${currency}?${params.toString()}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const data = await resp.json() as {
      status?: string;
      data?: Record<string, unknown>;
    };
    if (data.status === "success" && data.data) {
      return extractBalanceFromEntry(data.data);
    }
  } catch (err) {
    log.error({ err, currency }, "Plisio currency balance preflight failed");
  }

  return null;
}

export function extractPlisioErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload ?? "Unknown Plisio error");
  const obj = payload as Record<string, unknown>;
  const data = obj.data && typeof obj.data === "object" ? obj.data as Record<string, unknown> : undefined;
  const rawMessage = data?.message ?? obj.message ?? obj.error ?? JSON.stringify(payload).slice(0, 200);
  if (typeof rawMessage !== "string") return String(rawMessage);

  try {
    const parsed = JSON.parse(rawMessage) as unknown;
    if (parsed && typeof parsed === "object") {
      const parts = Object.entries(parsed as Record<string, unknown>).flatMap(([field, value]) => {
        if (Array.isArray(value)) return value.map((v) => `${field}: ${String(v)}`);
        return [`${field}: ${String(value)}`];
      });
      if (parts.length > 0) return parts.join("; ");
    }
  } catch {
    // Plain text is already useful.
  }

  return rawMessage;
}

export function isProviderInsufficientFundsMessage(message: string): boolean {
  return /insufficient\s+funds|insufficient.*balance|balance.*insufficient/i.test(message);
}

export async function getPlisioPayoutReadiness(
  usdAmount: number,
  currency: string,
  apiKey: string,
  log: MinLogger,
): Promise<PayoutReadiness> {
  const payoutCurrency = PLISIO_PAYOUT_MAP[currency] ?? currency;
  const conversion = await usdToCrypto(usdAmount, payoutCurrency, apiKey, log);
  if (!conversion) {
    return {
      ok: false,
      reason: "conversion_failed",
      message: "Could not fetch exchange rate to convert USD to crypto. Funds were NOT sent — will retry.",
      currency: payoutCurrency,
      requiredUsd: usdAmount,
    };
  }

  const requiredCrypto = parseFloat(conversion.cryptoAmount);
  const availableCrypto = await fetchPlisioProviderBalance(apiKey, payoutCurrency, log);
  if (availableCrypto !== null && availableCrypto + 1e-12 < requiredCrypto) {
    return {
      ok: false,
      reason: "insufficient_provider_funds",
      message: `Plisio provider balance is too low for ${payoutCurrency}: need ${requiredCrypto}, available ${availableCrypto}. Add funds to Plisio or choose a funded coin before approving.`,
      currency: payoutCurrency,
      requiredCrypto,
      availableCrypto,
      requiredUsd: usdAmount,
    };
  }

  return {
    ok: true,
    currency: payoutCurrency,
    cryptoAmount: conversion.cryptoAmount,
    rate: conversion.rate,
    availableCrypto,
  };
}

/**
 * Converts a USD amount to crypto using live exchange rates.
 * Rate source priority:
 *   1. Hardcoded $1.00 for stablecoins (instant, no network call)
 *   2. Coinbase public API (no key, reliable, production-grade)
 *   3. CoinGecko free API (backup)
 *   4. Plisio currency endpoint (last resort)
 */
async function usdToCrypto(
  usdAmount: number,
  currency: string,
  apiKey: string,
  log: MinLogger,
): Promise<{ cryptoAmount: string; rate: number } | null> {

  // ── 1. Stablecoins: $1.00 always ─────────────────────────────────────────
  if (STABLECOINS.has(currency)) {
    const cryptoAmount = usdAmount.toFixed(8);
    log.info({ currency, rateUsd: 1, usdAmount, cryptoAmount, source: "hardcoded_stablecoin" }, "Stablecoin rate: $1.00");
    return { cryptoAmount, rate: 1 };
  }

  // ── 2. Coinbase public API (primary — no key, no rate limit issues) ──────
  const coinbaseSymbol = COINBASE_SYMBOL_MAP[currency];
  if (coinbaseSymbol) {
    try {
      const resp = await fetch(
        `https://api.coinbase.com/v2/prices/${coinbaseSymbol}-USD/spot`,
        { signal: AbortSignal.timeout(8_000), headers: { "Accept": "application/json" } },
      );
      if (resp.ok) {
        const data = await resp.json() as { data?: { amount?: string } };
        const rateUsd = parseFloat(data.data?.amount ?? "0");
        if (rateUsd > 0) {
          // Use 8 decimal places for crypto amounts. Plisio often fails with "Transaction cannot be computed"
          // if the precision is too high or slightly mismatches their internal rate.
          const cryptoAmount = (usdAmount / rateUsd).toFixed(8);
          log.info({ currency, rateUsd, usdAmount, cryptoAmount, source: "coinbase" }, "Rate fetched from Coinbase");
          return { cryptoAmount, rate: rateUsd };
        }
      }
    } catch (err) {
      log.error({ err, currency }, "Coinbase rate fetch failed, trying CoinGecko");
    }
  }

  // ── 3. CoinGecko free API (secondary fallback) ────────────────────────────
  const geckoId = COINGECKO_ID_MAP[currency];
  if (geckoId) {
    try {
      const geckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(geckoId)}&vs_currencies=usd`;
      const geckoResp = await fetch(geckoUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "Accept": "application/json" },
      });
      if (geckoResp.ok) {
        const geckoData = await geckoResp.json() as Record<string, { usd?: number }>;
        const rateUsd = geckoData[geckoId]?.usd;
        if (rateUsd && rateUsd > 0) {
          const cryptoAmount = (usdAmount / rateUsd).toFixed(8);
          log.info({ currency, rateUsd, usdAmount, cryptoAmount, source: "coingecko" }, "Rate fetched from CoinGecko");
          return { cryptoAmount, rate: rateUsd };
        }
      }
    } catch (geckoErr) {
      log.error({ geckoErr, currency }, "CoinGecko rate fetch failed, trying Plisio");
    }
  }

  // ── 4. Plisio /currencies/{currency} (last resort) ───────────────────────
  try {
    const params = new URLSearchParams({ api_key: apiKey });
    const resp = await fetch(
      `https://api.plisio.net/api/v1/currencies/${currency}?${params.toString()}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const data = await resp.json() as {
      status?: string;
      data?: { rate_usd?: string; price_usd?: string; fiat_rate?: string };
    };
    if (data.status === "success" && data.data) {
      const rateUsd = parseFloat(
        data.data.rate_usd ?? data.data.price_usd ?? data.data.fiat_rate ?? "0"
      );
      if (rateUsd > 0) {
        const cryptoAmount = (usdAmount / rateUsd).toFixed(8);
        log.info({ currency, rateUsd, usdAmount, cryptoAmount, source: "plisio" }, "Rate fetched from Plisio");
        return { cryptoAmount, rate: rateUsd };
      }
    }
    log.error({ currency, data }, "Plisio rate: bad response or zero rate");
  } catch (err) {
    log.error({ err, currency }, "Plisio rate fetch failed");
  }

  log.error({ currency, usdAmount }, "All rate sources exhausted — cannot convert USD to crypto");
  return null;
}

/**
 * Sends a Plisio payout for an existing withdrawal transaction row (must be "pending").
 * Handles the full double-pay guard, error/ambiguous-outcome logic, and DB state updates.
 *
 * IMPORTANT: The Plisio /operations/withdraw endpoint requires `amount` in CRYPTO units.
 * It does NOT support source_amount/source_currency (those are deposit/invoice-only params).
 * We convert USD → crypto locally using usdToCrypto() before calling the API.
 *
 * After a successful Plisio payout response, stores the Plisio txn_id in BOTH
 * txHash AND plisioTrackId. This lets the /deposit/callback IPN handler find
 * the withdrawal row when Plisio later confirms the on-chain status.
 */
export async function sendPlisioPayout(
  txId: number,
  log: MinLogger,
): Promise<PayoutOutcome> {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
  if (!PLISIO_KEY) return { outcome: "no_key" };

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txId))
    .limit(1);

  if (!tx?.address) return { outcome: "no_address" };

  const payoutCurrency = PLISIO_PAYOUT_MAP[tx.currency ?? "BTC"] ?? (tx.currency ?? "BTC");
  const usdAmount = parseFloat(tx.amount);

  // ── Convert USD → crypto amount ───────────────────────────────────────────
  // The Plisio withdraw endpoint requires `amount` in crypto units.
  // source_amount/source_currency are NOT supported on the withdraw endpoint
  // (they only work for the invoice/deposit endpoint). Passing them causes
  // Plisio to return {"amount":"Missing required attribute"}.
  const readiness = await getPlisioPayoutReadiness(usdAmount, payoutCurrency, PLISIO_KEY, log);
  if (!readiness.ok && readiness.reason === "conversion_failed") {
    log.error({ txId, usdAmount, currency: payoutCurrency }, "Plisio payout: USD→crypto conversion failed — leaving pending");
    return {
      outcome: "reverted_pending",
      message: readiness.message,
    };
  }
  if (!readiness.ok && readiness.reason === "insufficient_provider_funds") {
    log.error({ txId, usdAmount, currency: payoutCurrency, readiness }, "Plisio payout blocked: insufficient provider balance");
    return {
      outcome: "provider_insufficient_funds",
      message: readiness.message,
      currency: readiness.currency,
      requiredCrypto: readiness.requiredCrypto,
      availableCrypto: readiness.availableCrypto,
      requiredUsd: readiness.requiredUsd,
    };
  }

  const { cryptoAmount, rate } = readiness;

  log.info(
    { txId, usdAmount, cryptoAmount, currency: payoutCurrency, rate, availableCrypto: readiness.availableCrypto },
    "Plisio payout: initiating with crypto amount",
  );

  // Double-pay guard: atomically claim the row by flipping pending → processing.
  const claimed = await db
    .update(transactionsTable)
    .set({ status: "processing" })
    .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "pending")))
    .returning({ id: transactionsTable.id });

  if (claimed.length === 0) return { outcome: "already_processing" };

  notifyWithdrawalStatus(txId, "processing").catch(() => {});

  const revertToPending = () =>
    db.update(transactionsTable)
      .set({ status: "pending" })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "processing")));

  const markNeedsReview = (operationId?: string | null) =>
    db.update(transactionsTable)
      .set({ status: "needs_review", ...(operationId ? { txHash: operationId } : {}) })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "processing")));

  // Use API_URL for callbacks so they reach the Render service, not the Netlify frontend
  const apiUrl = process.env.API_URL ?? process.env.SITE_URL ?? "";

  // ── Build Plisio withdraw request ─────────────────────────────────────────
  // Required fields per Plisio docs:
  //   currency  — crypto symbol (e.g. BTC, ETH, USDT_TRX)
  //   type      — "cash_out" for single withdrawal
  //   to        — destination wallet address
  //   amount    — amount in CRYPTO units (NOT USD)
  //   api_key   — your Plisio secret key
  const params = new URLSearchParams({
    api_key:      PLISIO_KEY,
    currency:     payoutCurrency,
    type:         "cash_out",
    to:           tx.address,
    amount:       cryptoAmount,
    callback_url: `${apiUrl}/api/transactions/deposit/callback`,
  });

  let payoutResponse: Response;
  try {
    payoutResponse = await fetch(
      `https://api.plisio.net/api/v1/operations/withdraw?${params.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(30_000) },
    );
  } catch (fetchErr) {
    log.error({ fetchErr, txId }, "Plisio payout network error / timeout");
    await markNeedsReview();
    return {
      outcome: "needs_review",
      message:
        "Could not reach Plisio to confirm the payout. It may have been sent — check your Plisio dashboard. Left under review.",
    };
  }

  interface PlisioPayoutResponse {
    status: string;
    data?: { txn_id?: string; id?: string; message?: string };
  }

  const rawText = await payoutResponse.text();
  log.info(
    { txId, httpStatus: payoutResponse.status, body: rawText.slice(0, 2000) },
    "Plisio payout response",
  );

  let payoutData: PlisioPayoutResponse;
  try {
    payoutData = JSON.parse(rawText);
  } catch {
    log.error({ txId, rawText: rawText.slice(0, 2000) }, "Plisio returned non-JSON");
    await markNeedsReview();
    return {
      outcome: "needs_review",
      message:
        "Plisio returned an unexpected response. The payout status is unknown — check your Plisio dashboard. Left under review.",
    };
  }

  if (payoutData.status !== "success") {
    const errMsg = extractPlisioErrorMessage(payoutData);
    const refId = payoutData.data?.txn_id ?? payoutData.data?.id;
    if (refId) {
      log.error({ txId, payoutData, errMsg }, "Plisio payout error WITH reference — needs review");
      await markNeedsReview(refId);
      return {
        outcome: "needs_review",
        message: `Plisio reported an error but returned a payout reference (${errMsg}). It may have been sent — check your dashboard. Left under review.`,
      };
    }
    if (isProviderInsufficientFundsMessage(errMsg)) {
      log.error({ txId, payoutData, errMsg }, "Plisio payout rejected: insufficient provider balance");
      await revertToPending();
      return {
        outcome: "provider_insufficient_funds",
        message: `Plisio provider balance is too low. ${errMsg}. Add funds to Plisio or choose a funded coin before retrying.`,
        currency: payoutCurrency,
        requiredCrypto: parseFloat(cryptoAmount),
        availableCrypto: readiness.availableCrypto,
        requiredUsd: usdAmount,
      };
    }
    log.error({ txId, payoutData, errMsg }, "Plisio payout rejected (no reference)");
    await revertToPending();
    return {
      outcome: "reverted_pending",
      message: `Payout failed: ${errMsg}. Funds were NOT sent — you can retry.`,
    };
  }

  const plisioTxId = payoutData.data?.txn_id ?? payoutData.data?.id ?? null;

  // Store plisioTxId in BOTH txHash and plisioTrackId.
  // plisioTrackId is the key the IPN callback handler uses to look up the row —
  // this enables automatic on-chain confirmation and failure refund handling.
  const [updated] = await db
    .update(transactionsTable)
    .set({
      status: "completed",
      txHash: plisioTxId,
      plisioTrackId: plisioTxId,
    })
    .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "processing")))
    .returning();

  if (!updated) {
    log.error({ txId, plisioTxId }, "Plisio payout succeeded but row no longer 'processing'");
    return { outcome: "completed", id: txId, txHash: plisioTxId, amount: parseFloat(tx.amount) };
  }

  notifyWithdrawalStatus(txId, "completed", plisioTxId).catch(() => {});

  return {
    outcome: "completed",
    id: updated.id,
    txHash: updated.txHash,
    amount: parseFloat(updated.amount),
  };
}
