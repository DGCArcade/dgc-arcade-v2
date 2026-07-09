import { Router, Request, Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { db } from "@workspace/db";
import { usersTable, casinoTransactionsTable, userBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getCryptoPrice } from "../lib/price-service.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import crypto from "crypto";

export const casinoRouter = Router();

/* ─────────────────────────────────────────────────────────────
   Helper: verify aggregator HMAC signature
   The aggregator signs its callback body with CASINO_SECRET_SIGN.
   We compute HMAC-SHA256 of the raw body and compare to the
   X-Casino-Signature header to prevent spoofed callbacks.
───────────────────────────────────────────────────────────── */
function verifyCasinoSignature(
  rawBody: string,
  signature: string | undefined
): boolean {
  const secret = process.env.CASINO_SECRET_SIGN;
  if (!secret) {
    logger.warn("CASINO_SECRET_SIGN not set — skipping signature verification");
    return true;
  }
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}

/* ─────────────────────────────────────────────────────────────
   GET /api/slots/launch?game_id=X
   SANDBOX MODE: hardcoded free staging credentials for NexusGGR
   Automatically signs handshake payload and streams game iframe
   without requiring external config validation.
───────────────────────────────────────────────────────────── */
casinoRouter.get("/launch", async (req: Request, res: Response) => {
  try {
    const gameId = req.query.game_id as string;
    const currency = (req.query.currency as string) || "USD";
    const lang = (req.query.lang as string) || "en";

    if (!gameId) {
      return res.status(400).json({ success: false, message: "game_id is required" });
    }

    // SANDBOX MODE: hardcoded free staging credentials
    const CASINO_PROVIDER_URL = "https://nexusggr.dev";
    const CASINO_API_KEY = "test_demoxx";
    const CASINO_MERCHANT_ID = "test_demo";

    const userId = (req as any).user?.userId ?? "guest";
    const username = (req as any).user?.username ?? "guest";

    // Build the aggregator stream-session request URL
    const streamEndpoint = new URL(`${CASINO_PROVIDER_URL.replace(/\/$/, "")}/launch`);
    streamEndpoint.searchParams.set("game_id", gameId);
    streamEndpoint.searchParams.set("api_key", CASINO_API_KEY);
    streamEndpoint.searchParams.set("merchant_id", CASINO_MERCHANT_ID);
    streamEndpoint.searchParams.set("user_id", String(userId));
    streamEndpoint.searchParams.set("username", username);
    streamEndpoint.searchParams.set("currency", currency);
    streamEndpoint.searchParams.set("lang", lang);
    streamEndpoint.searchParams.set("return_url", `${process.env.SITE_URL ?? "https://dgcarcade.com"}/slots`);
    streamEndpoint.searchParams.set("mode", "real");

    // Use native Node.js fetch to request the secure single-use stream link
    let launchUrl: string;
    try {
      const aggregatorRes = await fetch(streamEndpoint.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "DGCArcade/2.0 Sandbox",
          "X-Api-Key": CASINO_API_KEY,
          "X-Merchant-Id": CASINO_MERCHANT_ID,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!aggregatorRes.ok) {
        logger.warn({ status: aggregatorRes.status, gameId }, "Aggregator HTTP error, attempting fallback");
        // Fallback: construct direct game URL
        launchUrl = `${CASINO_PROVIDER_URL}/play/${gameId}?api_key=${CASINO_API_KEY}&merchant_id=${CASINO_MERCHANT_ID}&user_id=${userId}`;
      } else {
        const data = await aggregatorRes.json() as any;
        launchUrl =
          data.url ||
          data.launchUrl ||
          data.launch_url ||
          data.game_url ||
          data.data?.url ||
          `${CASINO_PROVIDER_URL}/play/${gameId}?api_key=${CASINO_API_KEY}&merchant_id=${CASINO_MERCHANT_ID}&user_id=${userId}`;
      }
    } catch (fetchErr) {
      logger.warn({ fetchErr, gameId }, "Aggregator fetch failed, using direct URL");
      launchUrl = `${CASINO_PROVIDER_URL}/play/${gameId}?api_key=${CASINO_API_KEY}&merchant_id=${CASINO_MERCHANT_ID}&user_id=${userId}`;
    }

    // Return the launch URL to the frontend iframe
    return res.json({
      success: true,
      url: launchUrl,
      gameId,
      currency,
    });
  } catch (error) {
    logger.error({ error, gameId: req.query.game_id }, "Slots launch error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/slots/webhook
   Processes spin callbacks (BET/WIN/REFUND) from the aggregator
   and updates user balances in real-time with row-locking.
───────────────────────────────────────────────────────────── */
async function handleWebhook(req: Request, res: Response) {
  try {
    const { user_id, transaction_id, action, amount, currency } = req.body;

    if (!user_id || !transaction_id || !action) {
      logger.warn({ body: req.body }, "Casino webhook: missing required fields");
      res.status(400).json({ success: false, message: "Missing required fields" });
      return;
    }

    const transactionAmount = parseFloat(amount || "0");
    if (isNaN(transactionAmount)) {
      logger.error({ body: req.body }, "Casino webhook: invalid amount");
      res.status(400).json({ success: false, message: "Invalid amount" });
      return;
    }

    await db.transaction(async (tx) => {
      // Row-lock the user
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user_id} FOR UPDATE`);

      // Idempotency check
      const [existing] = await tx
        .select({ id: casinoTransactionsTable.id })
        .from(casinoTransactionsTable)
        .where(eq(casinoTransactionsTable.transactionId, transaction_id))
        .limit(1);

      if (existing) {
        logger.info({ transaction_id }, "Casino webhook: duplicate transaction ignored");
        res.json({ success: true, message: "DUPLICATE_IGNORED" });
        return;
      }

      const usedCurrency = (currency || "USD").toUpperCase();

      if (action === "BET") {
        // Deduct balance
        await deductBalance(user_id, transactionAmount, usedCurrency, tx);
      } else if (action === "WIN") {
        // Credit balance
        await creditBalance(user_id, transactionAmount, usedCurrency, tx);
      }

      await tx.insert(casinoTransactionsTable).values({
        userId: user_id,
        transactionId: transaction_id,
        type: action as "BET" | "WIN" | "REFUND",
        amount: transactionAmount.toString(),
      });

      const { totalBalance: newBalanceUsd } = await getUserBalance(user_id);

      res.json({
        success: true,
        message: `${action} processed`,
        newBalanceUsd,
        cryptoAmount: transactionAmount,
        currency: usedCurrency,
      });
    });
  } catch (error) {
    logger.error({ error, body: req.body }, "Casino webhook error");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

casinoRouter.post("/callback", handleWebhook);

/* ─────────────────────────────────────────────────────────────
   POST /api/slots/payments/plisio-webhook
   Processes Plisio.net IPN crypto deposit notifications and
   credits the user's multi-crypto balance in Neon.tech.
───────────────────────────────────────────────────────────── */
casinoRouter.post("/payments/plisio-webhook", async (req: Request, res: Response) => {
  try {
    const { amount, currency, user_id, transaction_id, status } = req.body;

    if (status !== "completed") {
      logger.warn({ body: req.body }, "Plisio webhook: non-completed status, no action taken");
      return res.status(200).json({ success: true, message: "Status not completed" });
    }

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      logger.error({ body: req.body }, "Plisio webhook: invalid deposit amount");
      return res.status(400).json({ success: false, message: "Invalid deposit amount" });
    }

    await db.transaction(async (tx) => {
      // Row-lock the user record
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user_id))
        .for("update");

      if (!user) {
        logger.error({ user_id }, "Plisio webhook: user not found");
        tx.rollback();
        return;
      }

      // Idempotency check
      const existing = await tx
        .select({ id: casinoTransactionsTable.id })
        .from(casinoTransactionsTable)
        .where(eq(casinoTransactionsTable.transactionId, transaction_id))
        .limit(1);

      if (existing.length > 0) {
        logger.info({ transaction_id }, "Plisio webhook: duplicate deposit ignored");
        res.json({ success: true, message: "DUPLICATE_IGNORED" });
        return;
      }

      const cryptoCurrency = (currency || "BTC").toUpperCase();

      // Credit exact crypto amount to the user's multi-crypto balance row
      await tx
        .insert(userBalancesTable)
        .values({ userId: user_id, currency: cryptoCurrency, amount: String(depositAmount) })
        .onConflictDoUpdate({
          target: [userBalancesTable.userId, userBalancesTable.currency],
          set: { amount: sql`user_balances.amount + ${String(depositAmount)}` },
        });

      await tx.insert(casinoTransactionsTable).values({
        userId: user_id,
        transactionId: transaction_id,
        type: "WIN",
        amount: depositAmount.toString(),
      });

      logger.info({ user_id, depositAmount, currency: cryptoCurrency }, "Plisio deposit credited");
      res.json({ success: true, message: "Deposit credited" });
    });

    return;
  } catch (error) {
    logger.error({ error, body: req.body }, "Plisio webhook error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/slots/balance
   Returns the authenticated user's total USD balance across
   all crypto holdings for the casino iframe display.
───────────────────────────────────────────────────────────── */
casinoRouter.get("/balance", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { totalBalance, cryptoBalances } = await getUserBalance(userId);

    return res.json({
      success: true,
      balanceUsd: totalBalance,
      cryptoBalances,
    });
  } catch (error) {
    logger.error({ error }, "Casino balance fetch error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});
