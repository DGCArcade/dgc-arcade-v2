import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let getPlisioPayoutReadiness: typeof import("./plisio-payout.js").getPlisioPayoutReadiness;
let extractPlisioErrorMessage: typeof import("./plisio-payout.js").extractPlisioErrorMessage;
let isProviderInsufficientFundsMessage: typeof import("./plisio-payout.js").isProviderInsufficientFundsMessage;

const log = {
  info: vi.fn(),
  error: vi.fn(),
};

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  const mod = await import("./plisio-payout.js");
  getPlisioPayoutReadiness = mod.getPlisioPayoutReadiness;
  extractPlisioErrorMessage = mod.extractPlisioErrorMessage;
  isProviderInsufficientFundsMessage = mod.isProviderInsufficientFundsMessage;
});

afterEach(() => {
  vi.restoreAllMocks();
  log.info.mockClear();
  log.error.mockClear();
});

describe("Plisio payout readiness", () => {
  it("blocks approval when provider balance is below required crypto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: {
        USDT_TRX: { balance: "4.5" },
      },
    }))));

    const result = await getPlisioPayoutReadiness(10, "USDT_TRX", "test-key", log);

    expect(result).toMatchObject({
      ok: false,
      reason: "insufficient_provider_funds",
      currency: "USDT_TRX",
      requiredCrypto: 10,
      availableCrypto: 4.5,
      requiredUsd: 10,
    });
  });

  it("allows approval when provider balance is enough", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "success",
      data: {
        USDT_TRX: { balance: "25" },
      },
    }))));

    const result = await getPlisioPayoutReadiness(10, "USDT_TRX", "test-key", log);

    expect(result).toMatchObject({
      ok: true,
      currency: "USDT_TRX",
      cryptoAmount: "10.00000000",
      availableCrypto: 25,
    });
  });
});

describe("Plisio error classification", () => {
  it("extracts nested balance errors from Plisio responses", () => {
    const message = extractPlisioErrorMessage({
      status: "error",
      data: {
        message: '{"balance":["Insufficient funds on balance"]}',
      },
    });

    expect(message).toBe("balance: Insufficient funds on balance");
    expect(isProviderInsufficientFundsMessage(message)).toBe(true);
  });
});
