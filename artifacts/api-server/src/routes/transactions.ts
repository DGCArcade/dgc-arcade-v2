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
import { getUserBalance, deductBalance, creditBalance, creditCryptoBalance } from "../lib/balance-service.js";

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
    const {
      txn_id, status, source_amount, received_amount,
      invoice_total_sum, verify_hash, tx_urls, currency: pCurrency,
      received_amount_usd, source_amount_usd
    } = req.body as {
      txn_id?: string; status?: string;
      source_amount?: string | number; received_amount?: string | number;
      invoice_total_sum?: string | number; verify_hash?: string; tx_urls?: string;
      currency?: string; received_amount_usd?: string | number; source_amount_usd?: string | number;
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
        req.log.warn({ txn_id }, "Plisio IPN rejected: hash mismatch");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    }

    if (!txn_id || !status) {
      res.json({ success: true });
      return;
    }

    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.plisioTrackId, txn_id)).limit(1);
    if (!tx) {
      res.json({ success: true });
      return;
    }

    if (tx.type === "withdrawal") {
      if (status === "completed") {
        const onChainHash = tx_urls
          ? (() => { try { const p = JSON.parse(plisioHtmlEntityDecode(tx_urls)); return Array.isArray(p) ? String(p[0]) : null; } catch { return null; } })()
          : null;
        await db.update(transactionsTable).set({ status: "completed", ...(onChainHash ? { txHash: onChainHash } : {}) }).where(eq(transactionsTable.id, tx.id));
      } else if (status === "error") {
        const amount = parseFloat(tx.amount);
        await db.transaction(async (txn) => {
          const flipped = await txn.update(transactionsTable).set({ status: "failed" }).where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "failed"))).returning({ id: transactionsTable.id });
          if (flipped.length === 0) return;
          await txn.update(usersTable).set({ balance: sql`balance + ${amount}` }).where(eq(usersTable.id, tx.userId));
        });
      }
      res.json({ success: true });
      return;
    }

    // ── DEPOSIT IPN ───────────────────────────────────────────────────────────
    if (tx.status === "completed") {
      res.json({ success: true });
      return;
    }

    const pStatus = String(status).toLowerCase();
    const creditStatuses = new Set(["completed", "mismatch", "overpaid", "finished"]);
    if (!creditStatuses.has(pStatus)) {
      res.json({ success: true });
      return;
    }

    // REAL AMOUNT EXTRACTION: We want the actual received crypto amount
    const cryptoCurrency = tx.currency || pCurrency || "ETH";
    const cryptoAmountReceived = parseFloat(String(received_amount || "0"));
    const cryptoAmountInvoiced = parseFloat(String(invoice_total_sum || "0"));
    
    // USD valuation at time of deposit (for logging/stats)
    const receivedUsdValue = parseFloat(String(received_amount_usd || "0"));
    const sourceUsd = parseFloat(String(source_amount_usd || source_amount || tx.amount));
    
    // Calculate the USD "credit amount" for legacy stats/totalDeposited
    // This doesn't affect their live balance anymore, but we track it for loyalty/stats.
    let creditAmountUsd: number;
    if (receivedUsdValue > 0) {
      creditAmountUsd = Math.round(receivedUsdValue * 1e8) / 1e8;
    } else if (cryptoAmountReceived > 0 && cryptoAmountInvoiced > 0 && sourceUsd > 0) {
      const ratio = cryptoAmountReceived / cryptoAmountInvoiced;
      creditAmountUsd = Math.round(sourceUsd * ratio * 1e8) / 1e8;
    } else {
      creditAmountUsd = sourceUsd; // Fallback
    }

    await db.transaction(async (txn) => {
      const flipped = await txn
        .update(transactionsTable)
        .set({ 
          status: "completed", 
          amount: String(creditAmountUsd), // Track the USD value at time of deposit
          metadata: JSON.stringify({
            received_amount: String(cryptoAmountReceived),
            invoice_total_sum: String(cryptoAmountInvoiced),
            source_amount_usd: String(sourceUsd),
            credit_amount_usd: creditAmountUsd,
            paid_at: new Date().toISOString()
          })
        })
        .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
        .returning({ id: transactionsTable.id });

      if (flipped.length === 0) return;

      // 1. Credit Crypto-Native Balance (this makes it LIVE)
      if (cryptoAmountReceived > 0) {
        await creditCryptoBalance(tx.userId, cryptoCurrency, cryptoAmountReceived, txn);
      } else {
        // If we have no crypto data (fallback), credit the USD amount to static balance
        await txn.update(usersTable).set({ balance: sql`balance + ${creditAmountUsd}` }).where(eq(usersTable.id, tx.userId));
      }

      // 2. Update Stats (totalDeposited and wagerRequirement)
      await txn.update(usersTable).set({
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmountUsd}`,
        wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmountUsd * WAGER_MULTIPLIER}`,
      }).where(eq(usersTable.id, tx.userId));

      // 3. Record Ledger
      await recordLedger(txn, {
        userId: tx.userId,
        amount: creditAmountUsd,
        balanceBefore: 0, // Simplified for ledger
        balanceAfter: creditAmountUsd,
        reason: "deposit",
        referenceId: tx.id,
        referenceType: "transaction",
        note: `Credited ${cryptoAmountReceived > 0 ? cryptoAmountReceived + " " + cryptoCurrency : "$" + creditAmountUsd + " USD"} (Live Balance)`,
      });
      
      // 4. Referral commission
      try {
        const [depositor] = await txn.select({ referredBy: usersTable.referredBy }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
        if (depositor?.referredBy) {
          const referrerId = depositor.referredBy;
          const [activeRow] = await txn.select({ n: count() }).from(referralsTable).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
          const active = activeRow?.n ?? 0;
          const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
          const commission = Math.round(creditAmountUsd * commissionRate * 1e8) / 1e8;
          if (commission > 0) {
            // Commission is always credited to static USD balance (bonus)
            await txn.update(usersTable).set({ balance: sql`balance + ${commission}` }).where(eq(usersTable.id, referrerId));
            await txn.update(referralsTable).set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` }).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
            await txn.insert(creatorBankTxnsTable).values({
              creatorId: referrerId,
              type: "referral_commission",
              amount: String(commission),
              toUserId: tx.userId,
              description: `Commission from deposit ${tx.plisioTrackId || tx.id}`
            });
          }
        }
      } catch (commErr) { req.log.warn({ commErr }, "Referral commission failed"); }
    });

    sendNtfy(process.env.NTFY_TOPIC, {
      title: "DGC Arcade — New Deposit",
      priority: "high",
      tags: "money_with_wings",
      body: `+${cryptoAmountReceived} ${cryptoCurrency} (~$${creditAmountUsd.toFixed(2)})\nTxn: ${txn_id}\nUser: ${tx.userId}`,
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
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const { totalBalance } = await getUserBalance(user.id);
    if (totalBalance < amount) { res.status(400).json({ error: "Insufficient balance" }); return; }

    const settings = await getPlatformSettings();
    if (amount < settings.minWithdrawal) { res.status(400).json({ error: `Minimum withdrawal is $${settings.minWithdrawal}` }); return; }

    const isFraudulent = await evaluateWithdrawal(user.id, amount, address);
    const status = isFraudulent ? "pending" : "pending"; // All manual for now

    const [tx] = await db.insert(transactionsTable).values({
      userId: user.id,
      type: "withdrawal",
      amount: String(amount),
      currency,
      address,
      status,
    }).returning();

    await deductBalance(user.id, amount);

    await recordLedger(db, {
      userId: user.id,
      amount: -amount,
      balanceBefore: totalBalance,
      balanceAfter: totalBalance - amount,
      reason: "withdrawal",
      referenceId: tx.id,
      referenceType: "transaction",
      note: `Withdrawal request for $${amount} ${currency}`,
    });

    res.json({ success: true, transactionId: tx.id, status: tx.status });
  } catch (err) {
    req.log.error({ err }, "Withdrawal error");
    res.status(500).json({ error: "Internal server error" });
  }
});
