import { Router } from "express";
import { db, usersTable, transactionsTable, referralsTable, userBalancesTable, creatorBankTxnsTable } from "@workspace/db";
import { eq, desc, and, ne, sql, count, gte } from "drizzle-orm";
import {
  InitiateDepositBody,
  RequestWithdrawalBody,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { getPlatformSettings } from "../lib/platform-settings.js";
import { sendPlisioPayout } from "../lib/plisio-payout.js";
import { v4 as uuidv4 } from "uuid";
import { recordLedger } from "../services/ledger.js";
import { evaluateWithdrawal } from "../services/fraud.js";
import { getCryptoPrice } from "../lib/price-service.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";

export const transactionsRouter = Router();

const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
const PLISIO_API = "https://api.plisio.net/api/v1";

const WAGER_MULTIPLIER = 1.0;

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

// GET /api/transactions/coin-balances
transactionsRouter.get("/coin-balances", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        currency: transactionsTable.currency,
        total: sql`COALESCE(SUM(${transactionsTable.amount}::numeric), 0)`,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, req.user!.userId),
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "completed"),
        ),
      )
      .groupBy(transactionsTable.currency);

    const balances: Record<string, number> = {};
    for (const row of rows) {
      balances[row.currency] = parseFloat(String(row.total));
    }
    res.json({ balances });
  } catch (err) {
    req.log.error({ err }, "Coin balances error");
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
    // API_URL must point to the Render service URL (e.g. https://dgc-arcade-v2.onrender.com)
    // so Plisio callbacks reach the API, not the Netlify frontend at SITE_URL.
    const apiUrl  = process.env.API_URL ?? process.env.SITE_URL ?? "";
    const siteUrl = process.env.SITE_URL ?? apiUrl;
    const params = new URLSearchParams({
      api_key: PLISIO_SECRET_KEY,
      currency: plisioCurrency,
      source_amount: String(amount),
      order_number: orderId,
      order_name: "DGC Arcade Deposit",
      source_currency: "USD",
      callback_url: `${apiUrl}/api/transactions/deposit/callback`,
      success_url: `${siteUrl}/profile`,
      fail_url: `${siteUrl}/profile`,
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
      metadata: JSON.stringify({
        source_amount: String(amount),
        source_currency: "USD",
        expected_crypto: data.data.invoice_total_sum,
        created_at: new Date().toISOString()
      })
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

// ── Plisio IPN / Webhook ──────────────────────────────────────────────────────
// POST /api/transactions/deposit/callback
//
// Plisio calls this URL for BOTH deposit invoices AND withdrawal payouts.
//
// Security model:
//   • HMAC-SHA1 is the hard gate — reject if hash is wrong.
//   • IP allowlist is SOFT (warn-only). Hard-blocking on IP would silently drop
//     legitimate callbacks if Plisio ever rotates IPs, leaving deposits stuck
//     as "pending" forever. HMAC is sufficient protection.
//
// Handler forks on transaction type:
//   deposit    → credit user balance
//   withdrawal → update payout status; auto-refund on permanent failure
//
const PLISIO_IPS = new Set([
  "65.21.19.51", "65.21.19.52", "65.21.19.53",
  "65.21.19.54", "65.21.19.55", "138.201.43.212",
]);

function plisioHtmlEntityDecode(input: string): string {
  return input
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'").replace(/&apos;/g, "'")
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
    const clientIp = (req.ip ?? "").replace(/^::ffff:/, "").trim();
    const forwarded = req.headers["x-forwarded-for"];
    const socketIp = req.socket.remoteAddress ?? "";

    req.log.info({
      clientIp, socketIp, xForwardedFor: forwarded,
      bodyKeys: Object.keys(req.body as Record<string, unknown> ?? {}).sort(),
      status: (req.body as any)?.status,
      txn_id: (req.body as any)?.txn_id,
      hasVerifyHash: !!(req.body as any)?.verify_hash,
      ipKnown: PLISIO_IPS.has(clientIp),
    }, "Plisio IPN — incoming");

    // IP check: SOFT — log warning but never block. HMAC is the real gate.
    if (clientIp && !PLISIO_IPS.has(clientIp)) {
      req.log.warn({ clientIp, xForwardedFor: forwarded }, "Plisio IPN: IP not in known list — proceeding to HMAC check");
    }

    const {
      txn_id, status, source_amount, received_amount,
      invoice_total_sum, verify_hash, tx_urls,
    } = req.body as {
      txn_id?: string; status?: string;
      source_amount?: string | number; received_amount?: string | number;
      invoice_total_sum?: string | number; verify_hash?: string; tx_urls?: string;
    };

    // HMAC-SHA1 — hard gate
    if (PLISIO_SECRET_KEY) {
      if (!verify_hash) {
        req.log.warn({ txn_id }, "Plisio IPN rejected: missing verify_hash");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      const crypto = await import("crypto");
      const serialized = plisioSerialize(req.body as Record<string, unknown>);
      const expectedHash = crypto.createHmac("sha1", PLISIO_SECRET_KEY).update(serialized).digest("hex");
      const want = Buffer.from(expectedHash, "utf8");
      const got  = Buffer.from(String(verify_hash), "utf8");
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        req.log.warn({
          txn_id,
          serializedLen: Buffer.byteLength(serialized, "utf8"),
          serializedPreview: serialized.slice(0, 500),
          expectedHashPrefix: expectedHash.slice(0, 8),
          receivedHash: String(verify_hash),
        }, "Plisio IPN rejected: hash mismatch");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      req.log.info({ txn_id }, "Plisio IPN: signature verified ✓");
    } else {
      req.log.warn("Plisio IPN: HMAC check skipped — Plisio API key not set (check PLISIO_SECRET_KEY, PLISIO_API_KEY, or API_KEY) (dev only)");
    }

    if (!txn_id || !status) {
      res.json({ success: true });
      return;
    }

    // Look up transaction by Plisio track ID (works for both deposits and payouts —
    // payouts store their txn_id in plisioTrackId when sendPlisioPayout runs)
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.plisioTrackId, txn_id))
      .limit(1);

    if (!tx) {
      req.log.warn({ txn_id, status }, "Plisio IPN: no transaction for txn_id — ack");
      res.json({ success: true });
      return;
    }

    req.log.info({ txn_id, status, txType: tx.type, txStatus: tx.status, txId: tx.id }, "Plisio IPN: matched transaction");

    // ── WITHDRAWAL payout IPN ─────────────────────────────────────────────────
    if (tx.type === "withdrawal") {
      if (status === "completed") {
        const onChainHash = tx_urls
          ? (() => { try { const p = JSON.parse(plisioHtmlEntityDecode(tx_urls)); return Array.isArray(p) ? String(p[0]) : null; } catch { return null; } })()
          : null;
        await db.update(transactionsTable)
          .set({ status: "completed", ...(onChainHash ? { txHash: onChainHash } : {}) })
          .where(eq(transactionsTable.id, tx.id));
        req.log.info({ txn_id, txId: tx.id, onChainHash }, "Plisio IPN: payout confirmed on-chain ✓");
        sendNtfy(process.env.NTFY_TOPIC, {
          title: "DGC Arcade — Payout Confirmed",
          priority: "default",
          tags: "white_check_mark",
          body: `$${parseFloat(tx.amount).toFixed(2)} ${tx.currency ?? ""} confirmed on-chain\nTxn: ${txn_id}\nUser: ${tx.userId}`,
        });
      } else if (status === "error") {
        const amount = parseFloat(tx.amount);
        await db.transaction(async (txn) => {
          const flipped = await txn.update(transactionsTable)
            .set({ status: "failed" })
            .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "failed")))
            .returning({ id: transactionsTable.id });
          if (flipped.length === 0) return;
          await txn.update(usersTable)
            .set({ balance: sql`balance + ${amount}` })
            .where(eq(usersTable.id, tx.userId));
        });
        req.log.warn({ txn_id, txId: tx.id, amount, userId: tx.userId }, "Plisio IPN: payout failed — user refunded ✓");
        sendNtfy(process.env.NTFY_TOPIC, {
          title: "DGC Arcade — Payout FAILED",
          priority: "urgent",
          tags: "warning",
          body: `FAILED: $${parseFloat(tx.amount).toFixed(2)} ${tx.currency ?? ""} payout\nTxn: ${txn_id}\nUser: ${tx.userId}\nAuto-refunded.`,
        });
      } else {
        req.log.info({ txn_id, status, txId: tx.id }, "Plisio IPN: payout in-flight — no action");
      }
      res.json({ success: true });
      return;
    }

    // ── DEPOSIT IPN ───────────────────────────────────────────────────────────
    if (tx.status === "completed") {
      req.log.info({ txn_id, txId: tx.id }, "Plisio IPN: deposit already credited — idempotent ack");
      res.json({ success: true });
      return;
    }

    const pStatus = String(status).toLowerCase();
    const creditStatuses = new Set(["completed", "mismatch", "overpaid", "finished"]);
    if (!creditStatuses.has(pStatus)) {
      req.log.info({ txn_id, status: pStatus }, "Plisio IPN: non-credit deposit status — ack");
      res.json({ success: true });
      return;
    }

    const requestedUsd   = parseFloat(tx.amount);
    
    // ROBUST AMOUNT EXTRACTION: Check every possible field Plisio might use for different coins/statuses
    const sourceUsd       = parseFloat(String(source_amount || req.body.invoice_amount || req.body.source_amount_usd || tx.amount));
    
    // IMPORTANT: Distinguish between RECEIVED and EXPECTED amounts.
    // 'amount' in Plisio IPN is often the EXPECTED amount, not what was actually received.
    const receivedCrypto  = parseFloat(String(received_amount || req.body.received_sum || "0"));
    const invoicedCrypto  = parseFloat(String(invoice_total_sum || req.body.total_sum || req.body.amount || req.body.invoice_amount || "0"));
    
    // Prioritize direct USD net received value (after fees)
    const receivedUsdValue = parseFloat(String(req.body.received_amount_usd || req.body.received_sum_usd || "0"));

    let creditAmount: number;
    let ratioUsed: number;
    
    // REAL AMOUNT CALCULATION: Credit the real received amount after fees.
    if (receivedUsdValue > 0) {
      // Best case: Plisio tells us exactly how much USD was received (net)
      creditAmount = Math.round(receivedUsdValue * 1e8) / 1e8;
      ratioUsed = sourceUsd > 0 ? (creditAmount / sourceUsd) : 1;
      req.log.info({ txn_id, receivedUsdValue, creditAmount, sourceUsd }, "Plisio IPN: Crediting based on direct USD received value");
    } else if (receivedCrypto > 0 && invoicedCrypto > 0 && sourceUsd > 0) {
      // Ratio case: Calculate USD value based on the ratio of crypto received vs invoiced
      ratioUsed = receivedCrypto / invoicedCrypto;
      creditAmount = Math.round(sourceUsd * ratioUsed * 1e8) / 1e8;
      req.log.info({ 
        txn_id, 
        receivedCrypto, 
        invoicedCrypto, 
        sourceUsd, 
        ratio: ratioUsed, 
        creditAmount 
      }, "Plisio IPN: Calculated credit from actual received crypto ratio");
    } else if (sourceUsd > 0) {
      // FIX: fallback applies to ALL credit statuses (completed, finished, mismatch, overpaid)
      // Plisio uses "finished" for many coin types — previously this blocked crediting for those.
      ratioUsed = 1;
      creditAmount = Math.round(sourceUsd * 1e8) / 1e8;
      req.log.warn({ txn_id, pStatus, receivedCrypto, invoicedCrypto, sourceUsd, creditAmount }, 
        "Plisio IPN: Missing received data — crediting invoice amount as fallback");
    } else {
      req.log.error({ txn_id, pStatus, receivedCrypto, invoicedCrypto, sourceUsd }, "Plisio IPN: CRITICAL - No amount data at all for paid transaction.");
      res.status(400).json({ error: "Missing payment amount data" });
      return;
    }

    if (creditAmount <= 0) {
      req.log.warn({ txn_id, receivedCrypto, invoicedCrypto, sourceUsd, creditAmount }, "Plisio IPN: calculated credit is zero or negative, skipping");
      res.json({ success: true });
      return;
    }

    req.log.info({ txn_id, creditAmount, sourceUsd, receivedCrypto, invoicedCrypto, requestedUsd, status },
      "Plisio IPN: deposit credit calculation");

    await db.transaction(async (txn) => {
      const flipped = await txn
        .update(transactionsTable)
        .set({ 
          status: "completed", 
          amount: String(creditAmount),
          metadata: JSON.stringify({
            received_amount: String(received_amount || "0"),
            invoice_total_sum: String(invoice_total_sum || "0"),
            source_amount: String(source_amount || "0"),
            ratio: ratioUsed,
            credit_amount_usd: creditAmount,
            paid_at: new Date().toISOString()
          })
        })
        .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
        .returning({ id: transactionsTable.id });
      if (flipped.length === 0) return;

      // Credit Crypto-Native Balance (only if we have a real received crypto amount)
      const cryptoCurrency = tx.currency || "ETH";
      const cryptoAmountReceived = parseFloat(String(received_amount || "0"));
      
      if (cryptoAmountReceived > 0) {
        await txn
          .insert(userBalancesTable)
          .values({
            userId: tx.userId,
            currency: cryptoCurrency,
            amount: String(cryptoAmountReceived),
          })
          .onConflictDoUpdate({
            target: [userBalancesTable.userId, userBalancesTable.currency],
            set: { amount: sql`user_balances.amount + ${String(cryptoAmountReceived)}` },
          });
      }

      // Credit USD balance (this is the real amount after fees, always credited)
      const [updatedUser] = await txn.update(usersTable).set({
        balance: sql`balance + ${creditAmount}`,
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
        wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmount * WAGER_MULTIPLIER}`,
      }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });
      if (updatedUser) {
        const balanceAfter = parseFloat(updatedUser.balance);
        await recordLedger(txn, {
          userId: tx.userId,
          amount: creditAmount,
          balanceBefore: balanceAfter - creditAmount,
          balanceAfter,
          reason: "deposit",
          referenceId: tx.id,
          referenceType: "transaction",
          note: `Credited $${creditAmount} USD (${cryptoAmountReceived > 0 ? cryptoAmountReceived + " " + cryptoCurrency : "invoice amount"})`,
        });
      }
    });

    req.log.info({ txn_id, creditAmount, userId: tx.userId, status }, "Plisio IPN: deposit credited ✓");

    // Referral commission — fire-and-forget, never reverses deposit on failure
    try {
      const [depositor] = await db
        .select({ referredBy: usersTable.referredBy })
        .from(usersTable)
        .where(eq(usersTable.id, tx.userId))
        .limit(1);
      if (depositor?.referredBy) {
        const referrerId = depositor.referredBy;
        const [activeRow] = await db.select({ n: count() })
          .from(referralsTable)
          .where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
        const active = activeRow?.n ?? 0;
        const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
        const commission = Math.round(creditAmount * commissionRate * 1e8) / 1e8;
        if (commission > 0) {
          await db.update(usersTable)
            .set({ balance: sql`balance + ${commission}` })
            .where(eq(usersTable.id, referrerId));
          await db.update(referralsTable)
            .set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` })
            .where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
          
          // Also record in creator bank for owner tracking
          await db.insert(creatorBankTxnsTable).values({
            creatorId: referrerId,
            type: "referral_commission",
            amount: String(commission),
            toUserId: tx.userId,
            description: `Commission from deposit ${tx.plisioTrackId || tx.id} (Received: ${received_amount} ${tx.currency})`
          });
          
          req.log.info({ referrerId, commission, commissionRate, creditAmount, active }, "Plisio IPN: referral commission credited");
        }
      }
    } catch (commErr) {
      req.log.warn({ commErr }, "Referral commission failed — deposit already credited, non-critical");
    }

    sendNtfy(process.env.NTFY_TOPIC, {
      title: "DGC Arcade — New Deposit",
      priority: "high",
      tags: "money_with_wings",
      body: `+${creditAmount.toFixed(2)} USD (${tx.currency ?? "?"})\nTxn: ${txn_id}\nUser: ${tx.userId}`,
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Plisio IPN callback error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function sendNtfy(topic: string | undefined, opts: { title: string; priority: string; tags: string; body: string }) {
  if (!topic) return;
  fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      "Title": opts.title,
      "Priority": opts.priority,
      "Tags": opts.tags,
      "Content-Type": "text/plain",
    },
    body: opts.body,
  }).catch(() => {});
}

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

    if (user.withdrawalsEnabled === false) {
      res.status(403).json({
        error: "Withdrawals are not available for this account type.",
        detail: "This account uses promotional credits. Contact DGC Arcade support."
      });
      return;
    }

    if (!user.locationVerified) {
      res.status(403).json({ error: "Location verification required before withdrawing. Please enable location access and refresh." });
      return;
    }

    const totalWageredAmount = parseFloat(user.totalWageredAmount ?? "0");
    const requiredWager = parseFloat(user.wagerRequirement ?? "0");
    
    // Strict enforcement: totalWageredAmount must meet the total accumulated wagerRequirement
    // (This includes 100% of signup bonus, daily bonuses, and deposits)
    if (totalWageredAmount < (requiredWager - 0.01)) { // 1 cent buffer for rounding
      const remaining = (requiredWager - totalWageredAmount).toFixed(2);
      res.status(403).json({
        error: `Wagering requirement not met. You must wager $${remaining} more before withdrawing.`,
        detail: "All bonuses and deposits require 100% rollover (wagering) before withdrawal.",
        required: requiredWager,
        wagered: totalWageredAmount,
        remaining: parseFloat(remaining),
      });
      return;
    }

    // Standardized balance retrieval (live prices)
    const { totalBalance, cryptoBalances } = await getUserBalance(user.id);
    const cryptoBalance = cryptoBalances.find(b => b.currency === currency);
    const cryptoPrice = await getCryptoPrice(currency);
    const effectiveBalance = totalBalance;

    const totalDeposited = parseFloat(user.totalDeposited || "0");
    const withdrawRatio = amount / (totalDeposited || 1);
    const timeSinceCreated = Date.now() - new Date(user.createdAt).getTime();
    const accountAgeHours = timeSinceCreated / (1000 * 60 * 60);
    const flagReasons: string[] = [];
    if (withdrawRatio > 0.90 && accountAgeHours < 2) flagReasons.push("Immediate high-value withdrawal on new account");
    if (withdrawRatio > 0.95 && totalWageredAmount < totalDeposited * WAGER_MULTIPLIER) flagReasons.push("Withdrawal exceeds 95% of deposit with minimal play");
    if (accountAgeHours < 1 && amount > 100) flagReasons.push("Large withdrawal within 1 hour of account creation");
    
    // REAL-TIME BALANCE ENFORCEMENT: Users can only withdraw what their crypto is worth NOW.
    if (amount > (effectiveBalance + 0.01)) { // Small buffer for price fluctuations
      res.status(400).json({ 
        error: "Insufficient balance", 
        detail: `Your current holdings are worth $${effectiveBalance.toFixed(2)} USD. The market price of ${currency} may have changed.`
      });
      return;
    }

    if (amount < 1) { res.status(400).json({ error: "Minimum withdrawal is $1.00" }); return; }
    if (amount > 100_000_000) { res.status(400).json({ error: "Maximum single withdrawal is $100,000,000" }); return; }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [dailyRow] = await db
      .select({ total: sql`COALESCE(SUM(${transactionsTable.amount}::numeric), 0)` })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.userId, user.id),
        eq(transactionsTable.type, "withdrawal"),
        ne(transactionsTable.status, "declined"),
        gte(transactionsTable.createdAt, oneDayAgo),
      ));
    const dailyTotal = parseFloat(String(dailyRow?.total ?? 0));
    const DAILY_LIMIT = 1_000_000_000;
    if (dailyTotal + amount > DAILY_LIMIT) {
      res.status(400).json({ error: `Daily withdrawal limit is $1,000,000,000. You have ${(DAILY_LIMIT - dailyTotal).toFixed(2)} remaining today.` });
      return;
    }

    const settings = await getPlatformSettings();
    const fraudResult = await evaluateWithdrawal({ userId: user.id, amount });
    const { score: fraudScore, flags: fraudFlags, decision: fraudDecision } = fraudResult;
    const allFlags = [...new Set([...flagReasons, ...fraudFlags])];

    if (fraudDecision === "blocked") {
      await db.insert(transactionsTable).values({
        userId: user.id, type: "withdrawal", amount: String(amount), currency,
        status: "declined", address,
        metadata: JSON.stringify({ fraudFlags: allFlags, fraudScore, decision: "blocked", autoDeclined: true }),
      });
      res.status(403).json({ error: "Withdrawal declined. Please contact support if you believe this is an error." });
      return;
    }

    const AUTO_APPROVE_THRESHOLD = 10000;
    const autoApprove = amount < AUTO_APPROVE_THRESHOLD && fraudDecision !== "blocked";
    const flaggedForReview = !autoApprove;
    const txStatus = "pending" as const;

    let insertedTxId = 0;
    const cryptoAmountToDeduct = amount / cryptoPrice;
    
    const deducted = await db.transaction(async (txn) => {
      let balanceBefore = effectiveBalance;
      let balanceAfter: number;

      try {
        balanceAfter = await deductBalance(user.id, amount, txn);
      } catch (err) {
        return [];
      }

      const [inserted] = await txn.insert(transactionsTable).values({
        userId: user.id, type: "withdrawal", amount: String(amount),
        currency, status: txStatus, address,
        metadata: JSON.stringify({
          fraudFlags: allFlags, fraudScore, fraudDecision, flaggedForReview,
          autoApproved: autoApprove,
          thresholds: { aiSensitivity: settings.aiSensitivity, autoApproveUnder: settings.autoApproveUnder, requireManualOver: settings.requireManualOver },
        }),
      }).returning({ id: transactionsTable.id });
      insertedTxId = inserted.id;

      await recordLedger(txn, {
        userId: user.id, amount: -amount,
        balanceBefore, balanceAfter,
        reason: "withdrawal", referenceId: inserted.id, referenceType: "transaction",
      });
      return [{ success: true }];
    });
    if (deducted.length === 0) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    if (autoApprove && insertedTxId) {
      const result = await sendPlisioPayout(insertedTxId, req.log);
      switch (result.outcome) {
        case "completed":
          res.json({ success: true, message: "Withdrawal sent. Funds are on their way.", status: "completed" });
          break;
        case "needs_review":
          res.json({ success: true, message: "Withdrawal submitted. There was a temporary issue sending automatically — our team will process it shortly.", status: "needs_review" });
          break;
        case "reverted_pending":
          res.json({ success: true, message: "Withdrawal submitted and under review.", status: "pending" });
          break;
        default:
          res.json({ success: true, message: "Withdrawal submitted and under review.", status: "pending" });
      }
      return;
    }

    const msg = flaggedForReview
      ? "Withdrawal requires manual review. Our team will process it within 24 hours."
      : "Withdrawal request submitted. Under review.";
    res.json({ success: true, message: msg, status: txStatus });
  } catch (err) {
    req.log.error({ err }, "Withdraw error");
    res.status(500).json({ error: "Internal server error" });
  }
});
