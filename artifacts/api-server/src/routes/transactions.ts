import { Router } from "express";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  InitiateDepositBody,
  RequestWithdrawalBody,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { v4 as uuidv4 } from "uuid";

export const transactionsRouter = Router();

const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? "";
const PLISIO_API = "https://api.plisio.net/api/v1";

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
transactionsRouter.post("/deposit/callback", async (req, res) => {
  try {
    const { txn_id, status, source_amount, verify_hash } = req.body as {
      txn_id?: string;
      status?: string;
      source_amount?: string;
      verify_hash?: string;
    };
    if (!txn_id || !status) {
      res.json({ success: true });
      return;
    }
    if (PLISIO_SECRET_KEY && verify_hash) {
      const crypto = await import("crypto");
      const params = { ...req.body };
      delete params.verify_hash;
      const sortedParams = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
      const expectedHash = crypto.createHmac("sha1", PLISIO_SECRET_KEY).update(sortedParams).digest("hex");
      if (expectedHash !== verify_hash) {
        req.log.warn({ txn_id }, "Plisio callback hash mismatch");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    if (user) {
      const newBalance = parseFloat(user.balance) + creditAmount;
      const newTotalDeposited = parseFloat(user.totalDeposited ?? "0") + creditAmount;
      const newWagerReq = newTotalDeposited * 1.0;
      await db.update(usersTable).set({
        balance: String(newBalance),
        totalDeposited: String(newTotalDeposited),
        wagerRequirement: String(newWagerReq),
        locationVerified: user.locationVerified,
      }).where(eq(usersTable.id, user.id));
    }
    await db.update(transactionsTable).set({ status: "completed", amount: String(creditAmount) }).where(eq(transactionsTable.id, tx.id));
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

    // ── FRAUD CHECK 2: 75% wagering requirement ───────────────────
    const totalDeposited = parseFloat(user.totalDeposited ?? "0");
    const totalWageredAmount = parseFloat(user.totalWageredAmount ?? "0");
    const requiredWager = totalDeposited * 1.0;
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
    if (withdrawRatio > 0.95 && totalWageredAmount < totalDeposited * 1.0) {
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
    const autoDecline = fraudScore >= 2 || (withdrawRatio > 0.95 && accountAgeHours < 1);

    if (autoDecline) {
      // Log the declined attempt but do NOT touch the balance
      await db.insert(transactionsTable).values({
        userId: user.id,
        type: "withdrawal",
        amount: String(amount),
        currency,
        status: "declined",
        address,
        metadata: JSON.stringify({ fraudFlags: flagReasons, fraudScore, autoDeclined: true }),
      });
      res.status(403).json({ error: "Withdrawal declined. Please contact support if you believe this is an error." });
      return;
    }

    // ── PASSED ALL CHECKS: process withdrawal ─────────────────────
    const status = fraudScore >= 1 ? "flagged" : "pending";
    await db.update(usersTable).set({ balance: String(balance - amount) }).where(eq(usersTable.id, user.id));
    await db.insert(transactionsTable).values({
      userId: user.id,
      type: "withdrawal",
      amount: String(amount),
      currency,
      status,
      address,
      metadata: JSON.stringify({ fraudFlags: flagReasons, fraudScore }),
    });

    const msg = status === "flagged"
      ? "Withdrawal flagged for manual review. Our team will process it within 24 hours."
      : "Withdrawal request submitted. Under review.";
    res.json({ success: true, message: msg, status });
  } catch (err) {
    req.log.error({ err }, "Withdraw error");
    res.status(500).json({ error: "Internal server error" });
  }
});
