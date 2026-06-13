import { Router } from "express";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, ne, sql } from "drizzle-orm";
import {
  InitiateDepositBody,
  RequestWithdrawalBody,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { getPlatformSettings } from "../lib/platform-settings.js";
import { v4 as uuidv4 } from "uuid";

export const transactionsRouter = Router();

const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? "";
const PLISIO_API = "https://api.plisio.net/api/v1";

// Wager (playthrough) requirement as a multiple of total deposits a user must
// bet before withdrawing. Centralized so the deposit-credit and withdraw checks
// can never drift. 1.0 = must wager 100% of deposits before cashing out.
const WAGER_MULTIPLIER = 1.0;

// Map our currency codes to Plisio's exact currency codes
const PLISIO_CURRENCY_MAP: Record<string, string> = {
  BTC:      "BTC",
  ETH:      "ETH",
  LTC:      "LTC",
  DOGE:     "DOGE",
  SOL:      "SOL",
  BCH:      "BCH",
  TRX:      "TRX",
  XMR:      "XMR",
  DASH:     "DASH",
  TON:      "TON",
  USDT_TON: "USDT_TON",
  USDT_TRX: "USDT_TRX",
};

// GET /api/transactions
transactionsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, req.user!.userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit);
    res.json(
      rows.map((t) => ({
        id: t.id,
        userId: t.userId,
        type: t.type,
        amount: parseFloat(t.amount),
        currency: t.currency,
        status: t.status,
        txHash: t.txHash,
        address: t.address,
        createdAt: t.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List transactions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/transactions/deposit/initiate
transactionsRouter.post("/deposit/initiate", requireAuth, async (req, res) => {
  const parsed = InitiateDepositBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { amount, currency } = parsed.data;
  const orderId = uuidv4();
  try {
    if (!PLISIO_SECRET_KEY) {
      res.status(500).json({ error: "Payment gateway not configured" });
      return;
    }
    const plisioCurrency = PLISIO_CURRENCY_MAP[currency.toUpperCase()] ?? currency.toUpperCase();
    const params = new URLSearchParams({
      api_key: PLISIO_SECRET_KEY,
      currency: plisioCurrency,
      source_amount: String(amount),
      order_number: orderId,
      order_name: "DGC Arcade Deposit",
      source_currency: "USD",
      callback_url: `${process.env.SITE_URL ?? ""}/api/transactions/deposit/callback`,
      success_url: `${process.env.SITE_URL ?? ""}/profile`,
      fail_url: `${process.env.SITE_URL ?? ""}/profile`,
    });
    const response = await fetch(`${PLISIO_API}/invoices/new?${params.toString()}`);
    const data = await response.json() as {
      status: string;
      data?: {
        txn_id: string;
        invoice_url: string;
        invoice_total_sum: string;
        wallet_hash?: string;
        qr_code?: string;
        qr_code_link?: string;
        psys_cid?: string;
        source_amount?: string;
      };
      message?: string;
    };
    req.log.info({ plisio_response: JSON.stringify(data) }, "Plisio raw response");
    if (data.status !== "success" || !data.data) {
      req.log.error({ data }, "Plisio deposit error");
      const errMsg = (data.data as any)?.message ?? data.message ?? (typeof data.data === "string" ? data.data : "Unknown error");
      req.log.error({ plisio_full: JSON.stringify(data) }, "Plisio deposit full error");
      res.status(500).json({ error: "Payment gateway error: " + errMsg });
      return;
    }
    // Read wallet address + QR directly from the invoice creation response
    // (removed second /operations fetch — it races Plisio processing and always returns empty)
    const walletAddress = data.data.wallet_hash ?? "";
    const qrCodeUrl = data.data.qr_code ?? data.data.qr_code_link ?? "";
    req.log.info({
      walletAddress: walletAddress ? "present" : "MISSING",
      qrCode: qrCodeUrl ? "present" : "MISSING",
      currency: plisioCurrency,
      txn_id: data.data.txn_id,
    }, "Plisio invoice created");

    await db.insert(transactionsTable).values({
      userId: req.user!.userId,
      type: "deposit",
      amount: String(amount),
      currency,
      status: "pending",
      plisioTrackId: data.data.txn_id,
      orderId,
      address: walletAddress,
    });
    res.json({
      paymentUrl: data.data.invoice_url,
      trackId: data.data.txn_id,
      address: walletAddress,
      qrCode: qrCodeUrl,
      cryptoAmount: data.data.invoice_total_sum,
    });
  } catch (err) {
    req.log.error({ err }, "Initiate deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/transactions/deposit/callback (Plisio IPN)
// Plisio sends callbacks from these IPs only
const PLISIO_IPS = new Set([
  "65.21.19.51",
  "65.21.19.52",
  "65.21.19.53",
  "65.21.19.54",
  "65.21.19.55",
  "138.201.43.212",
]);

// ── Plisio IPN signature helpers ─────────────────────────────────────────────
// Plisio computes verify_hash as hmac_sha1(serialize($post), secret_key), where $post is the
// callback payload (minus verify_hash) after PHP ksort(), with every value treated as a string,
// expire_utc cast to string, and tx_urls HTML-entity-decoded. PHP serialize of an associative
// string array is: a:<n>:{s:<klen>:"k";s:<vlen>:"v";...} using UTF-8 BYTE lengths. A plain
// "k=v&..." query string (the old implementation) would never match and would reject every
// genuine callback once the secret is configured.
function plisioHtmlEntityDecode(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

export function plisioSerialize(body: Record<string, unknown>): string {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "verify_hash") continue;
    params[k] = v == null ? "" : String(v);
  }
  if (typeof params.tx_urls === "string") params.tx_urls = plisioHtmlEntityDecode(params.tx_urls);
  const keys = Object.keys(params).sort();
  let out = `a:${keys.length}:{`;
  for (const k of keys) {
    out += `s:${Buffer.byteLength(k, "utf8")}:"${k}";s:${Buffer.byteLength(params[k], "utf8")}:"${params[k]}";`;
  }
  return out + "}";
}

transactionsRouter.post("/deposit/callback", async (req, res) => {
  try {
    // ── Diagnostic: log every incoming IPN hit before any checks ──────────────
    // These appear in Render logs and let us identify IP / body issues quickly.
    const forwarded = req.headers["x-forwarded-for"];
    const socketIp = req.socket.remoteAddress ?? "";
    const clientIp = (typeof forwarded === "string" ? forwarded.split(",")[0] : socketIp).trim();
    req.log.info({
      clientIp,
      socketIp,
      xForwardedFor: forwarded,
      bodyKeys: Object.keys(req.body as Record<string, unknown> ?? {}).sort(),
      status: (req.body as any)?.status,
      txn_id: (req.body as any)?.txn_id,
      hasVerifyHash: !!(req.body as any)?.verify_hash,
      ipAllowed: PLISIO_IPS.has(clientIp),
    }, "Plisio IPN deposit callback — incoming");
    // ── IP allowlist check — reject anything not from Plisio's known servers ──
    if (clientIp && !PLISIO_IPS.has(clientIp)) {
      req.log.warn({ clientIp, xForwardedFor: forwarded, socketIp }, "Deposit callback rejected: IP not in Plisio allowlist");
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { txn_id, status, source_amount, verify_hash } = req.body as {
      txn_id?: string;
      status?: string;
      source_amount?: string;
      verify_hash?: string;
    };
    // HMAC signature is the PRIMARY authenticity control (the IP allowlist above is a
    // secondary best-effort check). When the secret is configured (production), a VALID
    // verify_hash is REQUIRED — reject any callback that is missing or fails the signature.
    if (PLISIO_SECRET_KEY) {
      // NOTE: this path can only be confirmed end-to-end against the LIVE Plisio service (dev
      // has no key, and the IP allowlist above 403s localhost before we reach here). The
      // diagnostics below make the FIRST real production callback conclusive: on any failure we
      // log the sorted field names, the serialized length/preview, and both hex digests. None of
      // these is the secret — the secret is PLISIO_SECRET_KEY, which is never logged.
      const bodyKeys = Object.keys(req.body as Record<string, unknown>)
        .filter((k) => k !== "verify_hash")
        .sort();
      if (!verify_hash) {
        req.log.warn({ txn_id, bodyKeys }, "Plisio callback rejected: missing verify_hash");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      const crypto = await import("crypto");
      // Reconstruct Plisio's exact signed string (see plisioSerialize) and compare in
      // constant time. Mismatched lengths are treated as invalid (timingSafeEqual throws on them).
      const serialized = plisioSerialize(req.body as Record<string, unknown>);
      const expectedHash = crypto.createHmac("sha1", PLISIO_SECRET_KEY).update(serialized).digest("hex");
      const want = Buffer.from(expectedHash, "utf8");
      const got = Buffer.from(String(verify_hash), "utf8");
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        // Loud, secret-free diagnostics: a genuine callback failing here is almost always a
        // serialization-format mismatch — these fields pinpoint it in a single real callback.
        // Do NOT log the full server-computed HMAC: for this exact (attacker-controllable) body
        // it IS a valid verify_hash, so a full value would turn the logs into a signing/replay
        // oracle. An 8-char prefix is enough to eyeball "did my computation even run" without
        // leaking a usable authenticator (the remaining 128 bits are unknown). The receivedHash
        // is attacker-supplied (already wrong) so it is safe to log in full.
        req.log.warn(
          {
            txn_id,
            bodyKeys,
            serializedLen: Buffer.byteLength(serialized, "utf8"),
            serializedPreview: serialized.slice(0, 500),
            expectedHashPrefix: expectedHash.slice(0, 8),
            receivedHash: String(verify_hash),
          },
          "Plisio callback hash mismatch",
        );
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      req.log.info({ txn_id }, "Plisio callback signature verified");
    } else {
      req.log.warn("Plisio callback HMAC check skipped: PLISIO_SECRET_KEY not set (dev only)");
    }
    if (!txn_id || !status) {
      res.json({ success: true });
      return;
    }
    if (status !== "completed") {
      res.json({ success: true });
      return;
    }
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.plisioTrackId, txn_id)).limit(1);
    if (!tx || tx.status === "completed") {
      res.json({ success: true });
      return;
    }
    const creditAmount = source_amount ? parseFloat(source_amount) : parseFloat(tx.amount);
    // Idempotent + transactional credit. The guarded status flip (-> completed) is the
    // single source of truth: concurrent duplicate/retried Plisio callbacks block on the
    // transactions row lock, and only the one that actually flips the status credits the
    // user. This prevents a duplicated webhook from double-crediting real money. The
    // balance arithmetic runs in Postgres NUMERIC (no JS float drift).
    await db.transaction(async (txn) => {
      const flipped = await txn
        .update(transactionsTable)
        .set({ status: "completed", amount: String(creditAmount) })
        .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
        .returning({ id: transactionsTable.id });
      if (flipped.length === 0) return; // already credited by a concurrent callback
      await txn.update(usersTable).set({
        balance: sql`balance + ${creditAmount}`,
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
        wagerRequirement: sql`(coalesce(total_deposited, 0) + ${creditAmount}) * ${WAGER_MULTIPLIER}`,
      }).where(eq(usersTable.id, tx.userId));
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Plisio callback error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/transactions/withdraw
transactionsRouter.post("/withdraw", requireAuth, async (req, res) => {
  const parsed = RequestWithdrawalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { amount, currency, address } = parsed.data;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    // Block withdrawals for creator and tester accounts — enforced at backend level
    if (user.withdrawalsEnabled === false) {
      res.status(403).json({
        error: "Withdrawals are not available for this account type.",
        detail: "This account uses promotional credits. Contact DGC Arcade support."
      });
      return;
    }

    // ── FRAUD CHECK 1: Location must be verified ──────────────────
    if (!user.locationVerified) {
      res.status(403).json({ error: "Location verification required before withdrawing. Please enable location access and refresh." });
      return;
    }

    // ── FRAUD CHECK 2: 100% wagering requirement (WAGER_MULTIPLIER) ──
    const totalDeposited = parseFloat(user.totalDeposited ?? "0");
    const totalWageredAmount = parseFloat(user.totalWageredAmount ?? "0");
    const requiredWager = totalDeposited * WAGER_MULTIPLIER;
    if (totalDeposited > 0 && totalWageredAmount < requiredWager) {
      const remaining = (requiredWager - totalWageredAmount).toFixed(2);
      res.status(403).json({
        error: `Wagering requirement not met. You must wager ${remaining} more before withdrawing.`,
        required: requiredWager,
        wagered: totalWageredAmount,
        remaining: parseFloat(remaining),
      });
      return;
    }

    // ── FRAUD CHECK 3: AI pattern detection ───────────────────────
    const balance = parseFloat(user.balance);
    const withdrawRatio = amount / (totalDeposited || 1);
    const timeSinceCreated = Date.now() - new Date(user.createdAt).getTime();
    const accountAgeHours = timeSinceCreated / (1000 * 60 * 60);
    const flagReasons: string[] = [];
    // Instant cashout: withdraw >90% of deposit within 2 hours
    if (withdrawRatio > 0.90 && accountAgeHours < 2) {
      flagReasons.push("Immediate high-value withdrawal on new account");
    }
    // Withdraw almost entire balance right after depositing
    if (withdrawRatio > 0.95 && totalWageredAmount < totalDeposited * WAGER_MULTIPLIER) {
      flagReasons.push("Withdrawal exceeds 95% of deposit with minimal play");
    }
    // New account large withdrawal
    if (accountAgeHours < 1 && amount > 100) {
      flagReasons.push("Large withdrawal within 1 hour of account creation");
    }
    // Withdrawal larger than balance
    if (amount > balance) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    const fraudScore = flagReasons.length;

    // ── Owner-tunable fraud knobs (DGC Bank → AI Fraud Settings) ──
    // aiSensitivity scales the raw flag count by 0.5x–1.5x so the owner can make
    // the engine more or less aggressive. autoApproveUnder / requireManualOver
    // set the dollar bands that bypass or force manual review.
    const settings = await getPlatformSettings();
    const sensitivityMultiplier = 0.5 + settings.aiSensitivity / 100;
    const effectiveScore = fraudScore * sensitivityMultiplier;

    const autoDecline = effectiveScore >= 2 || (withdrawRatio > 0.95 && accountAgeHours < 1);
    if (autoDecline) {
      // Log the declined attempt but do NOT touch the balance
      await db.insert(transactionsTable).values({
        userId: user.id,
        type: "withdrawal",
        amount: String(amount),
        currency,
        status: "declined",
        address,
        metadata: JSON.stringify({ fraudFlags: flagReasons, fraudScore, effectiveScore, autoDeclined: true }),
      });
      res.status(403).json({ error: "Withdrawal declined. Please contact support if you believe this is an error." });
      return;
    }
    // ── PASSED ALL CHECKS: process withdrawal ─────────────────────
    // ATOMIC balance deduct -- prevents race conditions
    // Check and deduct in one SQL statement so two simultaneous
    // withdrawal requests can never both pass on the same balance.
    //
    // Every non-declined withdrawal goes to the manual-review queue as "pending"
    // so it surfaces in the DGC Bank queue / fraud-alerts and stays approvable
    // via PATCH /admin/transactions/:id. The fraud signals that would otherwise
    // mark it are preserved in metadata (flaggedForReview) and independently
    // re-scored by /bank/fraud-alerts for the owner.
    const flaggedForReview = amount >= settings.requireManualOver || effectiveScore >= 1;
    const status = "pending" as const;
    // Deduct balance and record the withdrawal atomically. If the transaction
    // insert fails, the balance deduction rolls back, so a user can never lose
    // funds without a corresponding (refundable) withdrawal row.
    const deducted = await db.transaction(async (tx) => {
      const d = await tx.update(usersTable)
        .set({ balance: sql`${usersTable.balance} - ${amount}` })
        .where(and(eq(usersTable.id, user.id), sql`${usersTable.balance} >= ${amount}`))
        .returning({ balance: usersTable.balance });
      if (d.length === 0) return d;
      await tx.insert(transactionsTable).values({
        userId: user.id,
        type: "withdrawal",
        amount: String(amount),
        currency,
        status,
        address,
        metadata: JSON.stringify({
          fraudFlags: flagReasons,
          fraudScore,
          effectiveScore,
          flaggedForReview,
          autoApproved: amount <= settings.autoApproveUnder && effectiveScore < 1,
          thresholds: {
            aiSensitivity: settings.aiSensitivity,
            autoApproveUnder: settings.autoApproveUnder,
            requireManualOver: settings.requireManualOver,
          },
        }),
      });
      return d;
    });
    if (deducted.length === 0) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const msg = flaggedForReview
      ? "Withdrawal flagged for manual review. Our team will process it within 24 hours."
      : "Withdrawal request submitted. Under review.";
    res.json({ success: true, message: msg, status });
  } catch (err) {
    req.log.error({ err }, "Withdraw error");
    res.status(500).json({ error: "Internal server error" });
  }
});
