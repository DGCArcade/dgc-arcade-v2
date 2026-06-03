import { Router } from "express";
import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  InitiateDepositBody,
  OxapayCallbackBody,
  RequestWithdrawalBody,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { v4 as uuidv4 } from "uuid";

export const transactionsRouter = Router();

const OXAPAY_MERCHANT_KEY = process.env.OXAPAY_MERCHANT_KEY ?? "";
const OXAPAY_PAYOUT_KEY = process.env.OXAPAY_PAYOUT_KEY ?? "";
const OXAPAY_API = "https://api.oxapay.com";

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
    // If OxaPay keys are not set yet, return a placeholder so the UI still works
    if (!OXAPAY_MERCHANT_KEY) {
      const trackId = `DEMO-${orderId}`;
      await db.insert(transactionsTable).values({
        userId: req.user!.userId,
        type: "deposit",
        amount: String(amount),
        currency,
        status: "pending",
        oxapayTrackId: trackId,
        orderId,
      });
      res.json({
        paymentUrl: `https://oxapay.com/pay/${trackId}`,
        trackId,
      });
      return;
    }

    // Real OxaPay request
    const response = await fetch(`${OXAPAY_API}/merchants/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant: OXAPAY_MERCHANT_KEY,
        amount,
        currency,
        orderId,
        callbackUrl: `${process.env.SITE_URL ?? ""}/api/transactions/deposit/callback`,
        returnUrl: `${process.env.SITE_URL ?? ""}/profile`,
      }),
    });

    const data = (await response.json()) as { result: number; message: string; trackId: string; payLink: string };

    if (data.result !== 100) {
      req.log.error({ data }, "OxaPay deposit error");
      res.status(500).json({ error: "Payment gateway error: " + data.message });
      return;
    }

    await db.insert(transactionsTable).values({
      userId: req.user!.userId,
      type: "deposit",
      amount: String(amount),
      currency,
      status: "pending",
      oxapayTrackId: data.trackId,
      orderId,
    });

    res.json({ paymentUrl: data.payLink, trackId: data.trackId });
  } catch (err) {
    req.log.error({ err }, "Initiate deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/transactions/deposit/callback  (OxaPay IPN)
transactionsRouter.post("/deposit/callback", async (req, res) => {
  const parsed = OxapayCallbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid callback" });
    return;
  }
  const { trackId, status, amount } = parsed.data;

  if (!trackId || status !== "Paid" || !amount) {
    res.json({ success: true });
    return;
  }

  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.oxapayTrackId, trackId))
      .limit(1);

    if (!tx || tx.status === "completed") {
      res.json({ success: true });
      return;
    }

    // Credit user balance
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, tx.userId))
      .limit(1);

    if (user) {
      const newBalance = parseFloat(user.balance) + amount;
      await db
        .update(usersTable)
        .set({ balance: String(newBalance) })
        .where(eq(usersTable.id, user.id));
    }

    await db
      .update(transactionsTable)
      .set({ status: "completed", amount: String(amount) })
      .where(eq(transactionsTable.id, tx.id));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "OxaPay callback error");
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
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const balance = parseFloat(user.balance);
    if (balance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Deduct balance immediately (pending review)
    await db
      .update(usersTable)
      .set({ balance: String(balance - amount) })
      .where(eq(usersTable.id, user.id));

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
