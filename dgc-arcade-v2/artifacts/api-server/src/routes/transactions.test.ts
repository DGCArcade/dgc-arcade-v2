import { beforeAll, describe, expect, it } from "vitest";

let normalizePlisioCallbackBody: typeof import("./transactions.js").normalizePlisioCallbackBody;
let plisioSerialize: typeof import("./transactions.js").plisioSerialize;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  process.env.JWT_SECRET ??= "test-jwt-secret-that-is-long-enough-for-unit-tests";
  const mod = await import("./transactions.js");
  normalizePlisioCallbackBody = mod.normalizePlisioCallbackBody;
  plisioSerialize = mod.plisioSerialize;
});

describe("normalizePlisioCallbackBody", () => {
  it("rejects empty, missing, and array bodies before route destructuring", () => {
    expect(normalizePlisioCallbackBody(undefined)).toBeNull();
    expect(normalizePlisioCallbackBody(null)).toBeNull();
    expect(normalizePlisioCallbackBody("   ")).toBeNull();
    expect(normalizePlisioCallbackBody([])).toBeNull();
  });

  it("accepts parsed JSON/form objects", () => {
    expect(normalizePlisioCallbackBody({ txn_id: "abc", status: "completed" })).toEqual({
      txn_id: "abc",
      status: "completed",
    });
  });

  it("accepts URL-encoded callback bodies when content type parsing fails", () => {
    expect(normalizePlisioCallbackBody("txn_id=abc&status=completed&source_amount=25")).toEqual({
      txn_id: "abc",
      status: "completed",
      source_amount: "25",
    });
  });

  it("accepts raw JSON callback bodies", () => {
    expect(normalizePlisioCallbackBody('{"txn_id":"abc","status":"mismatch"}')).toEqual({
      txn_id: "abc",
      status: "mismatch",
    });
  });
});

describe("plisioSerialize", () => {
  it("omits verify_hash and sorts fields for HMAC verification", () => {
    expect(plisioSerialize({ status: "completed", txn_id: "abc", verify_hash: "ignored" })).toBe(
      'a:2:{s:6:"status";s:9:"completed";s:6:"txn_id";s:3:"abc";}',
    );
  });
});
