import { db, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const PLISIO_PAYOUT_MAP: Record<string, string> = {
  BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
  BCH: "BCH", TRX: "TRX", TON: "TON", XMR: "XMR", DASH: "DASH",
  USDT_TRX: "USDT_TRX", USDT_TON: "USDT_TON",
};

// CoinGecko IDs for each supported currency (free API, no key required)
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC:      "bitcoin",
  ETH:      "ethereum",
  LTC:      "litecoin",
  DOGE:     "dogecoin",
  SOL:      "solana",
  BCH:      "bitcoin-cash",
  TRX:      "tron",
  XMR:      "monero",
  DASH:     "dash",
  TON:      "the-open-network",
  USDT_TRX: "tether",
  USDT_TON: "tether",
};

interface MinLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export type PayoutOutcome =
  | { outcome: "completed";         id: number; txHash: string | null; amount: number }
  | { outcome: "needs_review";      message: string }
  | { outcome: "reverted_pending";  message: string }
  | { outcome: "already_processing" }
  | { outcome: "no_key" }
  | { outcome: "no_address" };

/**
 * Fetches the current USD exchange rate via CoinGecko (primary, free, no key).
 * Falls back to Plisio's currency endpoint if CoinGecko is unavailable.
 * Returns the crypto amount equivalent to the given USD value.
 */
async function usdToCrypto(
  usdAmount: number,
  currency: string,
  apiKey: string,
  log: MinLogger,
): Promise<{ cryptoAmount: string; rate: number } | null> {
  // ── Primary: CoinGecko free API ──────────────────────────────────────────
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
      log.error({ geckoErr, currency }, "CoinGecko rate fetch failed, trying Plisio fallback");
    }
  }

  // ── Fallback: Plisio /currencies/{currency} ───────────────────────────────
  try {
    const params = new URLSearchParams({ api_key: apiKey });
    const resp = await fetch(
      `https://api.plisio.net/api/v1/currencies/${currency}?${params.toString()}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const data = await resp.json() as {
      status?: string;
      data?: { rate_usd?: string; price_usd?: string; fiat_rate?: string };
    };
    if (data.status !== "success" || !data.data) {
      log.error({ currency, data }, "Plisio fallback: bad response");
      return null;
    }
    const rateUsd = parseFloat(
      data.data.rate_usd ?? data.data.price_usd ?? data.data.fiat_rate ?? "0"
    );
    if (!rateUsd || rateUsd <= 0) {
      log.error({ currency, data }, "Plisio fallback: invalid rate");
      return null;
    }
    const cryptoAmount = (usdAmount / rateUsd).toFixed(8);
    log.info({ currency, rateUsd, usdAmount, cryptoAmount, source: "plisio" }, "Rate fetched from Plisio fallback");
    return { cryptoAmount, rate: rateUsd };
  } catch (err) {
    log.error({ err, currency }, "Both CoinGecko and Plisio rate fetch failed");
    return null;
  }
}

/**
 * Sends a Plisio payout for an existing withdrawal transaction row (must be "pending").
 * Handles the full double-pay guard, error/ambiguous-outcome logic, and DB state updates.
 * Safe to call from both the admin approval path and the automatic-approval path.
 *
 * The Plisio withdraw API requires `amount` in cryptocurrency (not USD).
 * We first convert the USD amount to crypto using current exchange rates,
 * then send the payout with the crypto amount.
 */
export async function sendPlisioPayout(
  txId: number,
  log: MinLogger,
): Promise<PayoutOutcome> {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
  if (!PLISIO_KEY) return { outcome: "no_key" };

  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txId))
    .limit(1);

  if (!tx?.address) return { outcome: "no_address" };

  const payoutCurrency = PLISIO_PAYOUT_MAP[tx.currency ?? "BTC"] ?? (tx.currency ?? "BTC");
  const usdAmount = parseFloat(tx.amount);

  // Convert USD to crypto amount using current exchange rate
  const conversion = await usdToCrypto(usdAmount, payoutCurrency, PLISIO_KEY, log);
  if (!conversion) {
    return {
      outcome: "reverted_pending",
      message: `Could not fetch exchange rate for ${payoutCurrency}. Payout NOT sent — you can retry.`,
    };
  }

  log.info(
    { txId, usdAmount, cryptoAmount: conversion.cryptoAmount, rate: conversion.rate, currency: payoutCurrency },
    "Plisio payout: USD to crypto conversion",
  );

  // Double-pay guard: atomically claim the row by flipping pending → processing.
  const claimed = await db
    .update(transactionsTable)
    .set({ status: "processing" })
    .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "pending")))
    .returning({ id: transactionsTable.id });

  if (claimed.length === 0) return { outcome: "already_processing" };

  const revertToPending = () =>
    db.update(transactionsTable)
      .set({ status: "pending" })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "processing")));

  const markNeedsReview = (operationId?: string | null) =>
    db.update(transactionsTable)
      .set({ status: "needs_review", ...(operationId ? { txHash: operationId } : {}) })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "processing")));

  const params = new URLSearchParams({
    api_key: PLISIO_KEY,
    currency: payoutCurrency,
    to: tx.address,
    amount: conversion.cryptoAmount,
    type: "cash_out",
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
        "Plisio returned an unexpected response, so the payout could NOT be confirmed. It may have been sent — check your Plisio dashboard. Left under review.",
    };
  }

  if (payoutData.status !== "success") {
    const errMsg = payoutData.data?.message ?? JSON.stringify(payoutData).slice(0, 200);
    const refId = payoutData.data?.txn_id ?? payoutData.data?.id;
    if (refId) {
      log.error({ txId, payoutData, errMsg }, "Plisio payout error WITH reference — needs review");
      await markNeedsReview(refId);
      return {
        outcome: "needs_review",
        message: `Plisio reported an error but returned a payout reference (${errMsg}). It may have been sent — check your dashboard. Left under review.`,
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
  const [updated] = await db
    .update(transactionsTable)
    .set({ status: "completed", txHash: plisioTxId })
    .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "processing")))
    .returning();

  if (!updated) {
    log.error({ txId, plisioTxId }, "Plisio payout succeeded but row no longer 'processing'");
    return { outcome: "completed", id: txId, txHash: plisioTxId, amount: parseFloat(tx.amount) };
  }

  return {
    outcome: "completed",
    id: updated.id,
    txHash: updated.txHash,
    amount: parseFloat(updated.amount),
  };
}
