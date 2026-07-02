/**
 * Extract the real received crypto/USD from Plisio IPN bodies or operations API
 * responses. Never prefer invoice / source amounts when sum_actual is present.
 */

function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function txsList(data: Record<string, unknown>): unknown[] {
  const raw = data.txs ?? data.transactions ?? data.tx_list;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw as object);
  return [];
}

function sumFromTxs(data: Record<string, unknown>): number {
  const list = txsList(data);
  if (list.length === 0) return 0;
  return list.reduce((sum: number, t: unknown) => {
    if (!t || typeof t !== "object") return sum;
    const row = t as Record<string, unknown>;
    return sum + parseNum(
      row.amount ??
        row.received ??
        row.crypto_amount ??
        row.source_amount ??
        row.value ??
        row.sum ??
        row.received_amount ??
        row.incoming,
    );
  }, 0);
}

/** Crypto amount that actually landed (sum actual), not the invoice total. */
export function extractPlisioReceivedCrypto(data: Record<string, unknown>): number {
  const fromTxs = sumFromTxs(data);
  if (fromTxs > 0) return fromTxs;

  return parseNum(
    data.sum_actual ??
      data.actual_sum ??
      data.actual_commission_sum ??
      data.received_amount ??
      data.received_sum ??
      data.sum_received ??
      data.paid_amount ??
      data.amount_received ??
      data.actual_amount,
  );
}

export function extractPlisioInvoicedCrypto(data: Record<string, unknown>): number {
  return parseNum(
    data.invoice_total_sum ??
      data.total_sum ??
      data.invoice_amount ??
      data.sum_expected ??
      data.amount,
  );
}

export function extractPlisioReceivedUsd(data: Record<string, unknown>): number {
  return parseNum(
    data.sum_actual_usd ??
      data.actual_sum_usd ??
      data.received_amount_usd ??
      data.received_sum_usd ??
      data.amount_usd,
  );
}

export function extractPlisioSourceUsd(data: Record<string, unknown>, fallback = 0): number {
  return parseNum(data.source_amount_usd ?? data.source_amount) || fallback;
}

export interface PlisioCreditAmounts {
  cryptoReceived: number;
  cryptoInvoiced: number;
  receivedUsd: number;
  sourceUsd: number;
  creditUsd: number;
  creditMethod: string;
  exchangeRate: number | null;
}

/**
 * Compute USD credit from Plisio data. Uses sum_actual USD when present; otherwise
 * ratio of received/invoiced crypto × requested USD. Never credits full invoice
 * when received crypto is lower (Completed Auto / partial pay).
 */
export function computePlisioCreditUsd(
  data: Record<string, unknown>,
  sourceUsdFallback: number,
  livePriceLookup?: (currency: string) => Promise<number>,
  currency = "ETH",
): Promise<PlisioCreditAmounts> {
  return computePlisioCreditUsdSync(data, sourceUsdFallback, currency).then(async (base) => {
    if (base.creditUsd > 0) return base;
    const cryptoReceived = base.cryptoReceived;
    if (cryptoReceived > 0 && livePriceLookup) {
      const price = await livePriceLookup(currency);
      const creditUsd = Math.round(cryptoReceived * price * 1e8) / 1e8;
      return {
        ...base,
        creditUsd,
        creditMethod: "live_price_lookup",
        exchangeRate: price,
      };
    }
    return base;
  });
}

function computePlisioCreditUsdSync(
  data: Record<string, unknown>,
  sourceUsdFallback: number,
  currency: string,
): Promise<PlisioCreditAmounts> {
  const cryptoReceived = extractPlisioReceivedCrypto(data);
  const cryptoInvoiced = extractPlisioInvoicedCrypto(data);
  const receivedUsd = extractPlisioReceivedUsd(data);
  const sourceUsd = extractPlisioSourceUsd(data, sourceUsdFallback);

  let creditUsd = 0;
  let creditMethod = "none";
  let exchangeRate: number | null = null;

  if (receivedUsd > 0) {
    creditUsd = Math.round(receivedUsd * 1e8) / 1e8;
    creditMethod = "plisio_usd_direct";
    if (cryptoReceived > 0) {
      exchangeRate = Math.round((receivedUsd / cryptoReceived) * 1e8) / 1e8;
    }
  } else if (cryptoReceived > 0 && cryptoInvoiced > 0 && sourceUsd > 0) {
    const ratio = cryptoReceived / cryptoInvoiced;
    creditUsd = Math.round(sourceUsd * ratio * 1e8) / 1e8;
    creditMethod = "ratio_sum_actual_over_expected";
    exchangeRate =
      cryptoReceived > 0 ? Math.round((creditUsd / cryptoReceived) * 1e8) / 1e8 : null;
  } else if (cryptoReceived > 0 && sourceUsd > 0 && cryptoInvoiced <= 0) {
    // No invoice total — defer to live price in async wrapper
    creditMethod = "live_price_lookup_pending";
  }

  void currency;
  return Promise.resolve({
    cryptoReceived,
    cryptoInvoiced,
    receivedUsd,
    sourceUsd,
    creditUsd,
    creditMethod,
    exchangeRate,
  });
}
