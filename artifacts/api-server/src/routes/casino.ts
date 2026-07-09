import { Router } from "express";
import { db, pool } from "@workspace/db";
import { usersTable, casinoTransactionsTable } from "@workspace/db/src/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export const casinoRouter = Router();

// Plisio.net Crypto Wallet Integration Webhook
casinoRouter.post("/payments/plisio-webhook", async (req, res) => {
  try {
    // TODO: Implement Plisio IPN verification (e.g., check signature, IP whitelist)
    // For now, assuming the webhook is verified.

    const { amount, currency, user_id, transaction_id, status } = req.body; // Adjust based on actual Plisio payload

    if (status === "completed") {
      // Calculate equivalent currency credits (e.g., convert crypto to in-game currency)
      // For simplicity, directly using the amount for now.
      const depositAmount = parseFloat(amount);

      if (isNaN(depositAmount) || depositAmount <= 0) {
        logger.error({ body: req.body }, "Invalid deposit amount from Plisio webhook");
        return res.status(400).json({ success: false, message: "Invalid deposit amount" });
      }

      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, user_id)).for("update");

        if (!user) {
          logger.error({ user_id }, "User not found for Plisio deposit");
          tx.rollback();
          return res.status(404).json({ success: false, message: "User not found" });
        }

        const newCasinoBalance = parseFloat(user.casinoBalance) + depositAmount;

        await tx.update(usersTable)
          .set({ casinoBalance: newCasinoBalance.toString() })
          .where(eq(usersTable.id, user_id));

        await tx.insert(casinoTransactionsTable).values({
          userId: user_id,
          transactionId: transaction_id,
          type: "DEPOSIT", // Assuming DEPOSIT type for Plisio
          amount: depositAmount.toString(),
        });

        logger.info({ user_id, amount, currency, transaction_id }, "Plisio deposit processed successfully");
        res.json({ success: true, message: "Deposit processed" });
      });
    } else {
      logger.warn({ body: req.body }, "Plisio webhook received non-completed status");
      res.status(200).json({ success: true, message: "Transaction status not completed, no action taken" });
    }
  } catch (error) {
    logger.error({ error, body: req.body }, "Error processing Plisio webhook");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Backend Casino Aggregator Engine Webhook
casinoRouter.post("/callback", async (req, res) => {
  try {
    // TODO: Implement signature verification using CASINO_SECRET_SIGN
    const { action, user_id, amount, transaction_id, game_id } = req.body; // Adjust based on actual aggregator payload

    if (!user_id || !action || !amount || !transaction_id) {
      logger.error({ body: req.body }, "Missing required fields in casino callback");
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const transactionAmount = parseFloat(amount);
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      logger.error({ body: req.body }, "Invalid transaction amount in casino callback");
      return res.status(400).json({ success: false, message: "Invalid transaction amount" });
    }

    await db.transaction(async (tx) => {
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, user_id)).for("update");

      if (!user) {
        logger.error({ user_id }, "User not found for casino callback");
        tx.rollback();
        return res.status(404).json({ success: false, message: "User not found" });
      }

      let newCasinoBalance = parseFloat(user.casinoBalance);
      let transactionType: "BET" | "WIN" | "REFUND";

      switch (action) {
        case "BET":
          if (newCasinoBalance < transactionAmount) {
            logger.warn({ user_id, currentBalance: newCasinoBalance, betAmount: transactionAmount }, "Insufficient funds for bet");
            tx.rollback();
            return res.status(200).json({ success: false, message: "INSUFFICIENT_FUNDS" });
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
          logger.warn({ action }, "Unknown casino callback action");
          tx.rollback();
          return res.status(400).json({ success: false, message: "Unknown action" });
      }

      await tx.update(usersTable)
        .set({ casinoBalance: newCasinoBalance.toString() })
        .where(eq(usersTable.id, user_id));

      await tx.insert(casinoTransactionsTable).values({
        userId: user_id,
        transactionId: transaction_id,
        type: transactionType,
        amount: transactionAmount.toString(),
      });

      logger.info({ user_id, action, amount, newCasinoBalance }, "Casino callback processed successfully");
      res.json({ success: true, message: `${action} processed` });
    });
  } catch (error) {
    logger.error({ error, body: req.body }, "Error processing casino callback");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Launch route for external aggregator game
casinoRouter.get("/launch", async (req, res) => {
  try {
    const gameId = req.query.game_id as string;
    if (!gameId) {
      return res.status(400).json({ success: false, message: "game_id is required" });
    }

    const CASINO_PROVIDER_URL = process.env.CASINO_PROVIDER_URL;
    const CASINO_API_KEY = process.env.CASINO_API_KEY; // Assuming API key for authentication
    const CASINO_MERCHANT_ID = process.env.CASINO_MERCHANT_ID;

    if (!CASINO_PROVIDER_URL || !CASINO_API_KEY || !CASINO_MERCHANT_ID) {
      logger.error("Missing casino environment variables");
      return res.status(500).json({ success: false, message: "Casino configuration error" });
    }

    // TODO: Implement actual call to external aggregator's game initializing API
    // This is a placeholder. The actual implementation will depend on the aggregator's API.
    // It will likely involve sending a signed request with user_id, game_id, and other parameters.
    const externalLaunchUrl = `${CASINO_PROVIDER_URL}/launch?game_id=${gameId}&api_key=${CASINO_API_KEY}&merchant_id=${CASINO_MERCHANT_ID}&user_id=${req.user?.id || "guest"}`;

    logger.info({ gameId, externalLaunchUrl }, "Generated external game launch URL");
    res.json({ success: true, launchUrl: externalLaunchUrl });
  } catch (error) {
    logger.error({ error, query: req.query }, "Error generating game launch URL");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
