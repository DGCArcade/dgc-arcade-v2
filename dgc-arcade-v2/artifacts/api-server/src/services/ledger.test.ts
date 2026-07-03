import { beforeAll, describe, expect, it, vi } from "vitest";

let recordLedger: typeof import("./ledger.js").recordLedger;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  const mod = await import("./ledger.js");
  recordLedger = mod.recordLedger;
});

describe("recordLedger", () => {
  it("serializes money values and nullable references consistently", async () => {
    const values = vi.fn();
    const txn = {
      insert: vi.fn(() => ({ values })),
    };

    await recordLedger(txn, {
      userId: 42,
      amount: -12.34,
      balanceBefore: 50,
      balanceAfter: 37.66,
      reason: "withdrawal",
      referenceId: 99,
      referenceType: "transaction",
      note: "test ledger entry",
    });

    expect(values).toHaveBeenCalledWith({
      userId: 42,
      amount: "-12.34",
      balanceBefore: "50",
      balanceAfter: "37.66",
      reason: "withdrawal",
      referenceId: 99,
      referenceType: "transaction",
      note: "test ledger entry",
    });
  });

  it("stores omitted optional fields as null", async () => {
    const values = vi.fn();
    const txn = {
      insert: vi.fn(() => ({ values })),
    };

    await recordLedger(txn, {
      userId: 7,
      amount: 5,
      balanceBefore: 10,
      balanceAfter: 15,
      reason: "deposit",
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      referenceId: null,
      referenceType: null,
      note: null,
    }));
  });
});
