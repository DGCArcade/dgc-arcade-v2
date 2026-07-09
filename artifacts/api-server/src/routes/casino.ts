import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, casinoTransactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
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
    // If no secret is configured, skip verification (dev mode)
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
   POST /api/slots/payments/plisio-webhook
   Processes Plisio.net IPN crypto deposit notifications and
   credits the user's casino_balance in Neon.tech.
───────────────────────────────────────────────────────────── */
casinoRouter.post("/payments/plisio-webhook", async (req, res) => {
  try {
    // TODO: Implement Plisio IPN HMAC verification
    // See: https://plisio.net/api#ipn
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
      // Row-level lock prevents double-credit race conditions
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

      const newCasinoBalance =
        parseFloat(user.casinoBalance as string) + depositAmount;

      await tx
        .update(usersTable)
        .set({ casinoBalance: newCasinoBalance.toString() })
        .where(eq(usersTable.id, user_id));

      await tx.insert(casinoTransactionsTable).values({
        userId: user_id,
        transactionId: transaction_id,
        type: "DEPOSIT",
        amount: depositAmount.toString(),
      });

      logger.info(
        { user_id, amount, currency, transaction_id, newCasinoBalance },
        "Plisio deposit processed"
      );
      res.json({ success: true, message: "Deposit processed" });
    });
    return;
  } catch (error) {
    logger.error({ error, body: req.body }, "Plisio webhook error");
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/slots/callback
   Aggregator spin callback — processes BET / WIN / REFUND
   actions against the user's casino_balance with SELECT FOR
   UPDATE row-locking to prevent credit duplication.
───────────────────────────────────────────────────────────── */
casinoRouter.post("/callback", async (req, res) => {
  try {
    // Verify HMAC signature from aggregator
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers["x-casino-signature"] as string | undefined;
    if (!verifyCasinoSignature(rawBody, signature)) {
      logger.warn({ headers: req.headers }, "Casino callback: invalid signature");
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const { action, user_id, amount, transaction_id } = req.body;

    if (!user_id || !action || !amount || !transaction_id) {
      logger.error({ body: req.body }, "Casino callback: missing required fields");
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const transactionAmount = parseFloat(amount);
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      logger.error({ body: req.body }, "Casino callback: invalid transaction amount");
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction amount" });
    }

    await db.transaction(async (tx) => {
      // SELECT FOR UPDATE — row-level lock prevents double-spend
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user_id))
        .for("update");

      if (!user) {
        logger.error({ user_id }, "Casino callback: user not found");
        tx.rollback();
        return;
      }

      let newCasinoBalance = parseFloat(user.casinoBalance as string);
      let transactionType: "BET" | "WIN" | "REFUND";

      switch (action) {
        case "BET":
          if (newCasinoBalance < transactionAmount) {
            logger.warn(
              { user_id, balance: newCasinoBalance, bet: transactionAmount },
              "Casino callback: insufficient funds"
            );
            tx.rollback();
            res.status(200).json({ success: false, message: "INSUFFICIENT_FUNDS" });
            return;
          }
          newCasinoBalance -= transactionAmount;
          transactionType = "BET";
          break;

        case "WIN":
          newCasinoBalance += transactionAmount;
          transactionType = "WIN";
          break;

        case "REFUND":
          newCasinoBalance += transactionAmount;
          transactionType = "REFUND";
          break;

        default:
          logger.warn({ action }, "Casino callback: unknown action");
          tx.rollback();
          return;
      }

      await tx
        .update(usersTable)
        .set({ casinoBalance: newCasinoBalance.toString() })
        .where(eq(usersTable.id, user_id));

      await tx.insert(casinoTransactionsTable).values({
        userId: user_id,
        transactionId: transaction_id,
        type: transactionType,
        amount: transactionAmount.toString(),
      });

      logger.info(
        { user_id, action, amount, newCasinoBalance },
        "Casino callback processed"
      );
      res.json({ success: true, message: `${action} processed` });
    });
    return;
  } catch (error) {
    logger.error({ error, body: req.body }, "Casino callback error");
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/slots/launch?game_id=X
   Generates a single-use session URL from the external
   aggregator (Pragmatic Play / Hacksaw / NoLimit City / NetEnt).
   Requires CASINO_PROVIDER_URL, CASINO_API_KEY, CASINO_MERCHANT_ID.
───────────────────────────────────────────────────────────── */
casinoRouter.get("/launch", async (req, res) => {
  try {
    const gameId = req.query.game_id as string;
    if (!gameId) {
      return res
        .status(400)
        .json({ success: false, message: "game_id is required" });
    }

    const CASINO_PROVIDER_URL = process.env.CASINO_PROVIDER_URL;
    const CASINO_API_KEY = process.env.CASINO_API_KEY;
    const CASINO_MERCHANT_ID = process.env.CASINO_MERCHANT_ID;

    if (!CASINO_PROVIDER_URL || !CASINO_API_KEY || !CASINO_MERCHANT_ID) {
      logger.error("Casino launch: missing environment variables");
      return res
        .status(500)
        .json({ success: false, message: "Casino not configured" });
    }

    const userId = (req.user as any)?.userId ?? "guest";

    // Build the aggregator launch URL.
    // In production the aggregator returns a signed single-use token URL;
    // replace this with the actual aggregator SDK call as needed.
    const externalLaunchUrl = `${CASINO_PROVIDER_URL}/launch?game_id=${encodeURIComponent(gameId)}&api_key=${CASINO_API_KEY}&merchant_id=${CASINO_MERCHANT_ID}&user_id=${userId}`;

    logger.info({ gameId, userId }, "Casino launch URL generated");
    res.json({ success: true, launchUrl: externalLaunchUrl });
    return;
  } catch (error) {
    logger.error({ error, query: req.query }, "Casino launch error");
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /api/slots/balance
   Returns the authenticated user's current casino_balance so
   the frontend can display it without a full /me refetch.
───────────────────────────────────────────────────────────── */
casinoRouter.get("/balance", async (req, res) => {
  try {
    const userId = (req.user as any)?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const [user] = await db
      .select({ casinoBalance: usersTable.casinoBalance })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      casinoBalance: parseFloat(user.casinoBalance as string),
    });
    return;
  } catch (error) {
    logger.error({ error }, "Casino balance fetch error");
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
});
