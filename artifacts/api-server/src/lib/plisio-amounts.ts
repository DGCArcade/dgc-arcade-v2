/**
 * Extract the real received crypto/USD from Plisio IPN bodies or operations API
 * responses. Never prefer invoice / source amounts when sum_actual is present.
 *
 * Security: underpaid "Completed Auto" invoices must credit actual_sum only —
 * never invoice_total_sum, amount, or received_amount_usd (those can reflect expected).
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
  return list.reduce<number>((sum, t) => {
    if (!t || typeof t !== "object") return sum;
    const row = t as Record<string, unknown>;
    return (
      sum +
      parseNum(
        row.amount ?? row.received ?? row.crypto_amount ?? row.value ?? row.sum ?? row.incoming,
      )
    );
  }, 0);
}

/** Crypto amount that actually landed on-chain (sum actual), not the invoice total. */
export function extractPlisioReceivedCrypto(data: Record<string, unknown>): number {
  const fromTxs = sumFromTxs(data);
  if (fromTxs > 0) return fromTxs;

  // Authoritative Plisio fields only — do NOT fall back to received_amount or amount.
  return parseNum(data.sum_actual ?? data.actual_sum);
}

export function extractPlisioInvoicedCrypto(data: Record<string, unknown>): number {
  return parseNum(
    data.invoice_total_sum ?? data.total_sum ?? data.invoice_amount ?? data.sum_expected,
  );
}

/** USD value of sum actual — only trust Plisio's actual_sum_usd fields. */
export function extractPlisioReceivedUsd(data: Record<string, unknown>): number {
  return parseNum(data.sum_actual_usd ?? data.actual_sum_usd);
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

const UNDERPAY_EPSILON = 0.001;

function isUnderpayment(cryptoReceived: number, cryptoInvoiced: number): boolean {
  return cryptoInvoiced > 0 && cryptoReceived > 0 && cryptoReceived < cryptoInvoiced * (1 - UNDERPAY_EPSILON);
}

function capCreditToUnderpaymentRatio(
  creditUsd: number,
  cryptoReceived: number,
  cryptoInvoiced: number,
  sourceUsd: number,
): number {
  if (sourceUsd <= 0 || cryptoInvoiced <= 0 || cryptoReceived <= 0) return creditUsd;
  if (!isUnderpayment(cryptoReceived, cryptoInvoiced)) return creditUsd;
  const maxCredit = Math.round(sourceUsd * (cryptoReceived / cryptoInvoiced) * 1e8) / 1e8;
  return creditUsd > maxCredit ? maxCredit : creditUsd;
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
      let creditUsd = Math.round(cryptoReceived * price * 1e8) / 1e8;
      creditUsd = capCreditToUnderpaymentRatio(
        creditUsd,
        cryptoReceived,
        base.cryptoInvoiced,
        base.sourceUsd,
      );
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

  // Underpayment: ratio from actual_sum / invoice_total_sum is authoritative.
  // received_amount_usd often reflects sum expected, not sum actual.
  if (cryptoReceived > 0 && cryptoInvoiced > 0 && sourceUsd > 0) {
    const ratio = cryptoReceived / cryptoInvoiced;
    creditUsd = Math.round(sourceUsd * ratio * 1e8) / 1e8;
    creditMethod = "ratio_sum_actual_over_expected";
    exchangeRate =
      cryptoReceived > 0 ? Math.round((creditUsd / cryptoReceived) * 1e8) / 1e8 : null;

    if (!isUnderpayment(cryptoReceived, cryptoInvoiced) && receivedUsd > 0) {
      // Full pay or overpay — prefer Plisio's actual_sum_usd when available.
      creditUsd = Math.round(receivedUsd * 1e8) / 1e8;
      creditMethod = "plisio_usd_direct";
      exchangeRate = Math.round((creditUsd / cryptoReceived) * 1e8) / 1e8;
    }
  } else if (receivedUsd > 0) {
    creditUsd = Math.round(receivedUsd * 1e8) / 1e8;
    creditMethod = "plisio_usd_direct";
    if (cryptoReceived > 0) {
      exchangeRate = Math.round((receivedUsd / cryptoReceived) * 1e8) / 1e8;
    }
  } else if (cryptoReceived > 0 && sourceUsd > 0 && cryptoInvoiced <= 0) {
    creditMethod = "live_price_lookup_pending";
  }

  creditUsd = capCreditToUnderpaymentRatio(creditUsd, cryptoReceived, cryptoInvoiced, sourceUsd);

  // Never credit more than requested invoice USD unless clearly overpaid on-chain.
  if (
    sourceUsd > 0 &&
    creditUsd > sourceUsd * 1.05 &&
    !(cryptoInvoiced > 0 && cryptoReceived > cryptoInvoiced * 1.001)
  ) {
    creditUsd = Math.round(sourceUsd * 1e8) / 1e8;
    creditMethod += "_capped_to_invoice";
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

/** Whether Plisio data contains enough sum_actual to safely credit a deposit. */
export function canCreditFromPlisioData(data: Record<string, unknown>): boolean {
  return extractPlisioReceivedCrypto(data) > 0 || extractPlisioReceivedUsd(data) > 0;
}
