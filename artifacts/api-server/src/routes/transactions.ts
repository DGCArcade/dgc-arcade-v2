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
const PLISIO_API = "https://plisio.net/api/v1";

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
    const params = new URLSearchParams({
      api_key: PLISIO_SECRET_KEY,
      currency: currency.toUpperCase(),
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
      };
      message?: string;
    };
    req.log.info({ plisio_response: JSON.stringify(data) }, "Plisio raw response");
    if (data.status !== "success" || !data.data) {
      req.log.error({ data }, "Plisio deposit error");
      res.status(500).json({ error: "Payment gateway error: " + (data.message ?? "Unknown error") });
      return;
    }
    // Fetch transaction details to get wallet address
    let walletAddress = "";
    let qrCodeUrl = "";
    try {
      const txParams = new URLSearchParams({ api_key: PLISIO_SECRET_KEY });
      const txRes = await fetch(`${PLISIO_API}/transactions/${data.data.txn_id}?${txParams.toString()}`);
      const txData = await txRes.json() as { status: string; data?: { wallet_hash?: string; qr_code?: string } };
      req.log.info({ tx_response: JSON.stringify(txData).slice(0, 500) }, "Plisio tx detail response");
      if (txData.status === "success" && txData.data) {
        walletAddress = txData.data.wallet_hash ?? "";
        qrCodeUrl = txData.data.qr_code ?? "";
      }
    } catch (e) {
      req.log.warn({ err: String(e) }, "Could not fetch Plisio transaction details");
    }

    await db.insert(transactionsTable).values({
      userId: req.user!.userId,
      type: "deposit",
      amount: String(amount),
      currency,
      status: "pending",
      oxapayTrackId: data.data.txn_id,
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
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.oxapayTrackId, txn_id)).limit(1);
    if (!tx || tx.status === "completed") {
      res.json({ success: true });
      return;
    }
    const creditAmount = source_amount ? parseFloat(source_amount) : parseFloat(tx.amount);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
    if (user) {
      const newBalance = parseFloat(user.balance) + creditAmount;
      await db.update(usersTable).set({ balance: String(newBalance) }).where(eq(usersTable.id, user.id));
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
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const balance = parseFloat(user.balance);
    if (balance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    await db.update(usersTable).set({ balance: String(balance - amount) }).where(eq(usersTable.id, user.id));
    await db.insert(transactionsTable).values({
      userId: user.id,
      type: "withdrawal",
      amount: String(amount),
      currency,
      status: "pending",
      address,
    });
    res.json({ success: true, message: "Withdrawal request submitted. Under review." });
  } catch (err) {
    req.log.error({ err }, "Withdraw error");
    res.status(500).json({ error: "Internal server error" });
  }
});
