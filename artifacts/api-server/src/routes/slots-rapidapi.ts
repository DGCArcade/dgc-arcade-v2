import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";

export const slotsRapidApiRouter = Router();

/**
 * RapidAPI Slot Streamer Configuration
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_SLOT_HOST || "your-slot-provider.p.rapidapi.com";

interface LaunchResponse {
  gameUrl?: string;
  launchUrl?: string;
}

/**
 * POST /api/slots/launch-rapidapi
 * Uses the real crypto wallet (balance-service) to prevent "fake" balances.
 */
slotsRapidApiRouter.post("/launch-rapidapi", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { gameId, gameName, provider, cryptoType, betAmountUsd } = req.body;

    if (!gameId || !gameName || !provider || !betAmountUsd || !cryptoType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Deduct from real crypto wallet before launching
    // This ensures USD knows what crypto it has and prevents fake balances.
    const { newBalance, usedCurrency } = await deductBalance(
      userId, 
      parseFloat(betAmountUsd), 
      cryptoType as string
    );

    // 2. Launch game via RapidAPI
    const rapidApiResponse = await fetch(
      `https://${RAPIDAPI_HOST}/v1/games/launch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_HOST,
        },
        body: JSON.stringify({
          gameId,
          gameName,
          provider,
          userId: userId.toString(),
          currency: "USD",
          balance: parseFloat(betAmountUsd),
          returnUrl: `${process.env.FRONTEND_URL}/slots/${gameId}`,
        }),
      }
    );

    if (!rapidApiResponse.ok) {
      // Refund if launch fails
      await creditBalance(userId, parseFloat(betAmountUsd), usedCurrency);
      return res.status(502).json({ error: "Failed to launch game via RapidAPI" });
    }

    const rapidApiData = (await rapidApiResponse.json()) as LaunchResponse;

    return res.json({
      success: true,
      launchUrl: rapidApiData.gameUrl || rapidApiData.launchUrl,
      newBalanceUsd: newBalance,
      usedCurrency
    });
  } catch (error: any) {
    console.error("Error launching RapidAPI slot:", error);
    return res.status(error.message === "Insufficient balance" ? 400 : 500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

/**
 * POST /api/slots/sync-balance
 * Webhook to sync wins back to the real crypto wallet.
 */
slotsRapidApiRouter.post("/sync-balance", async (req: Request, res: Response) => {
  try {
    const { user_id, amount, currency, transaction_id } = req.body;

    if (!user_id || amount === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const userId = parseInt(user_id);
    const winAmount = parseFloat(amount);

    // Credit win back to real crypto wallet
    // This ensures the USD balance is always tied to real crypto.
    const newTotalBalance = await creditBalance(
      userId, 
      winAmount, 
      currency || "BTC"
    );

    return res.json({
      success: true,
      transaction_id,
      newBalanceUsd: newTotalBalance,
    });
  } catch (error) {
    console.error("Error syncing slot balance:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/slots/game-info/:gameId
 */
slotsRapidApiRouter.get("/game-info/:gameId", async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;

    const response = await fetch(
      `https://${RAPIDAPI_HOST}/v1/games/${gameId}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_HOST,
        },
      }
    );

    if (!response.ok) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gameInfo = await response.json();
    return res.json(gameInfo);
  } catch (error) {
    console.error("Error fetching game info:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
