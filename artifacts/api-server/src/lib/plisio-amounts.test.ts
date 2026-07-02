import { describe, expect, it } from "vitest";
import {
  canCreditFromPlisioData,
  computePlisioCreditUsd,
  extractPlisioReceivedCrypto,
  extractPlisioReceivedUsd,
} from "./plisio-amounts.js";

/** Real underpaid DOGE deposit — Completed Auto on Plisio. */
const UNDERPAID_DOGE: Record<string, unknown> = {
  actual_sum: "61.43843086",
  sum_actual: "61.43843086",
  actual_sum_usd: "4.48",
  invoice_total_sum: "69.64266109",
  sum_expected: "69.64266109",
  source_amount: "5.00",
  source_amount_usd: "5.00",
  // Misleading fields that must NOT drive credit:
  received_amount: "69.64266109",
  received_amount_usd: "5.08",
  amount: "69.64266109",
  status: "completed",
};

describe("plisio-amounts security", () => {
  it("extracts actual_sum crypto, ignoring received_amount invoice total", () => {
    expect(extractPlisioReceivedCrypto(UNDERPAID_DOGE)).toBeCloseTo(61.43843086, 5);
  });

  it("extracts actual_sum_usd only, not received_amount_usd", () => {
    expect(extractPlisioReceivedUsd(UNDERPAID_DOGE)).toBeCloseTo(4.48, 2);
  });

  it("credits ratio-based USD for underpayment, not sum expected USD", async () => {
    const result = await computePlisioCreditUsd(UNDERPAID_DOGE, 5.0, undefined, "DOGE");
    expect(result.cryptoReceived).toBeCloseTo(61.43843086, 5);
    expect(result.creditUsd).toBeLessThan(5.0);
    expect(result.creditUsd).toBeCloseTo(4.41, 1); // 5 * (61.44/69.64)
    expect(result.creditUsd).not.toBeCloseTo(5.08, 2);
  });

  it("rejects crediting when only invoice fields present (no actual_sum)", () => {
    const invoiceOnly = {
      received_amount: "10000",
      invoice_total_sum: "10000",
      source_amount: "10000",
      amount: "10000",
    };
    expect(extractPlisioReceivedCrypto(invoiceOnly)).toBe(0);
    expect(canCreditFromPlisioData(invoiceOnly)).toBe(false);
  });

  it("sums txs array when actual_sum missing", () => {
    const withTxs = {
      invoice_total_sum: "100",
      txs: [{ amount: "2.5" }, { received: "1.5" }],
    };
    expect(extractPlisioReceivedCrypto(withTxs)).toBeCloseTo(4.0, 5);
  });

  it("allows overpayment credit above invoice USD when crypto exceeds invoice", async () => {
    const overpaid = {
      actual_sum: "110",
      invoice_total_sum: "100",
      actual_sum_usd: "11.50",
      source_amount: "10.00",
    };
    const result = await computePlisioCreditUsd(overpaid, 10.0, undefined, "BTC");
    expect(result.creditUsd).toBeGreaterThan(10.0);
  });
});
