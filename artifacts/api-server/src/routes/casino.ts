import { Router, type Request, type Response } from "express";
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
   NODE_MIRROR deployment: calls the streaming aggregator endpoint
   directly via native Node.js fetch, returns a single-use secure
   stream URL to the frontend iframe container.

   Required env vars (set in Render dashboard):
     CASINO_PROVIDER_URL  — aggregator base URL
     CASINO_API_KEY       — your aggregator API key / AGENT_TOKEN
     CASINO_MERCHANT_ID   — your merchant / operator ID / AGENT_CODE

   Aliases (NexusGGR / legacy):
     AGENT_CODE           — alias for CASINO_MERCHANT_ID
     AGENT_TOKEN          — alias for CASINO_API_KEY
     API_ENDPOINT         — alias for CASINO_PROVIDER_URL

   Routing config:
     SLOTS_DEPLOYMENT = NODE_MIRROR (native fetch, no PHP, no proxy)
───────────────────────────────────────────────────────────── */
casinoRouter.get("/launch", async (req: Request, res: Response) => {
  try {
    const gameId = req.query.game_id as string;
    const currency = (req.query.currency as string) || "USD";
    const lang = (req.query.lang as string) || "en";

    if (!gameId) {
      return res.status(400).json({ success: false, message: "game_id is required" });
    }

    // NODE_MIRROR: resolve env vars with alias fallback chain
    const CASINO_PROVIDER_URL =
      process.env.CASINO_PROVIDER_URL ||
      process.env.API_ENDPOINT;
    const CASINO_API_KEY =
      process.env.CASINO_API_KEY ||
      process.env.AGENT_TOKEN;
    const CASINO_MERCHANT_ID =
      process.env.CASINO_MERCHANT_ID ||
      process.env.AGENT_CODE;

    if (!CASINO_PROVIDER_URL || !CASINO_API_KEY || !CASINO_MERCHANT_ID) {
      logger.error("Casino launch: missing environment variables (CASINO_PROVIDER_URL / CASINO_API_KEY / CASINO_MERCHANT_ID)");
      return res.status(503).json({
        success: false,
        message: "Casino aggregator not configured",
        setup:
          "Set CASINO_PROVIDER_URL, CASINO_API_KEY, and CASINO_MERCHANT_ID in your Render environment variables. " +
          "Aliases: AGENT_TOKEN, AGENT_CODE, API_ENDPOINT are also accepted.",
      });
    }

    const userId = (req as any).user?.userId ?? "guest";
    const username = (req as any).user?.username ?? "guest";

    // Build the aggregator stream-session request URL (NODE_MIRROR pattern)
    const streamEndpoint = new URL(`${CASINO_PROVIDER_URL.replace(/\/$/, "")}/launch`);
    streamEndpoint.searchParams.set("game_id", gameId);
    streamEndpoint.searchParams.set("api_key", CASINO_API_KEY);
    streamEndpoint.searchParams.set("merchant_id", CASINO_MERCHANT_ID);
    streamEndpoint.searchParams.set("user_id", String(userId));
    streamEndpoint.searchParams.set("username", username);
    streamEndpoint.searchParams.set("currency", currency);
    streamEndpoint.searchParams.set("lang", lang);
    streamEndpoint.searchParams.set("return_url", `${process.env.SITE_URL ?? ""}/slots`);
    streamEndpoint.searchParams.set("mode", "real");

    // NODE_MIRROR: use native Node.js fetch to request the secure single-use stream link
    // from the aggregator. The aggregator returns a JSON body with a `url` or `launchUrl` field.
    let launchUrl: string;
    try {
      const aggregatorRes = await fetch(streamEndpoint.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "DGCArcade/2.0 NodeMirror",
          "X-Api-Key": CASINO_API_KEY,
          "X-Merchant-Id": CASINO_MERCHANT_ID,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!aggregatorRes.ok) {
        const errBody = await aggregatorRes.text();
        logger.error({ status: aggregatorRes.status, body: errBody, gameId }, "Casino aggregator returned error");
        // Fall back to direct URL construction if aggregator returns non-JSON or error
        launchUrl = streamEndpoint.toString();
      } else {
        const contentType = aggregatorRes.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const body = await aggregatorRes.json() as Record<string, any>;
          // Support multiple aggregator response shapes
          launchUrl =
            body.url ||
            body.launchUrl ||
            body.launch_url ||
            body.game_url ||
            body.data?.url ||
            body.data?.launchUrl ||
            streamEndpoint.toString();
        } else {
          // Aggregator returned the URL as plain text
          const text = (await aggregatorRes.text()).trim();
          launchUrl = text.startsWith("http") ? text : streamEndpoint.toString();
        }
      }
    } catch (fetchErr: any) {
      // Network error or timeout — fall back to direct URL so the iframe can still attempt
      logger.warn({ fetchErr: fetchErr?.message, gameId }, "Casino aggregator fetch failed — using direct URL fallback");
      launchUrl = streamEndpoint.toString();
    }

    logger.info({ gameId, userId, currency, launchUrl: launchUrl.slice(0, 80) }, "Casino launch URL resolved (NODE_MIRROR)");
    return res.json({ success: true, launchUrl });
  } catch (error) {
    logger.error({ error, query: req.query }, "Casino launch error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /api/slots/webhook
   Processes BET / WIN / REFUND signals from the aggregator.
   Uses SELECT FOR UPDATE row-lock to prevent race conditions.
   Converts USD wager amounts to/from live crypto prices.
   (Shared implementation with /callback alias via handleWebhook)
───────────────────────────────────────────────────────────── */
casinoRouter.post("/webhook", handleWebhook);


/* ─────────────────────────────────────────────────────────────
   POST /api/slots/callback  (legacy alias — same as /webhook)
   We re-use the same handler function directly to avoid calling
   the non-existent Router.handle() method.
───────────────────────────────────────────────────────────── */
async function handleWebhook(req: Request, res: Response) {
  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers["x-casino-signature"] as string | undefined;

    if (!verifyCasinoSignature(rawBody, signature)) {
      logger.warn({ signature }, "Casino webhook: invalid signature");
      return res.status(401).json({ success: false, message: "INVALID_SIGNATURE" });
    }

    const { action, user_id, transaction_id, amount, currency, game_id } = req.body;

    if (!user_id || !transaction_id || !action) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const transactionAmount = parseFloat(amount);
    if (isNaN(transactionAmount) || transactionAmount < 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    await db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user_id))
        .for("update");

      if (!user) {
        logger.error({ user_id }, "Casino webhook: user not found");
        tx.rollback();
        res.status(404).json({ success: false, message: "USER_NOT_FOUND" });
        return;
      }

      const existing = await tx
        .select({ id: casinoTransactionsTable.id })
        .from(casinoTransactionsTable)
        .where(eq(casinoTransactionsTable.transactionId, transaction_id))
        .limit(1);

      if (existing.length > 0) {
        res.json({ success: true, message: "DUPLICATE_IGNORED" });
        return;
      }

      const usedCurrency = (currency || "BTC").toUpperCase();
      let cryptoPrice = 1;
      try { cryptoPrice = await getCryptoPrice(usedCurrency); } catch { cryptoPrice = 1; }
      const cryptoAmount = cryptoPrice > 0 ? transactionAmount / cryptoPrice : transactionAmount;

      switch (action) {
        case "BET": {
          try {
            await deductBalance(user_id, transactionAmount, usedCurrency, tx);
          } catch (err: any) {
            if (err.message === "Insufficient balance") {
              tx.rollback();
              res.status(200).json({ success: false, message: "INSUFFICIENT_FUNDS" });
              return;
            }
            throw err;
          }
          break;
        }
        case "WIN": {
          await creditBalance(user_id, transactionAmount, usedCurrency, tx);
          break;
        }
        case "REFUND": {
          await creditBalance(user_id, transactionAmount, usedCurrency, tx);
          break;
        }
        default: {
          logger.warn({ action }, "Casino webhook: unknown action");
          tx.rollback();
          res.status(400).json({ success: false, message: "UNKNOWN_ACTION" });
          return;
        }
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
        cryptoAmount,
        currency: usedCurrency,
      });
    });

    return;
  } catch (error) {
    logger.error({ error, body: req.body }, "Casino webhook error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

casinoRouter.post("/callback", handleWebhook);

/* ─────────────────────────────────────────────────────────────
   POST /api/slots/payments/plisio-webhook
   Processes Plisio.net IPN crypto deposit notifications and
   credits the user's multi-crypto balance in Neon.tech.
   Supports all 12–15 accepted cryptocurrency assets.
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
