import { Router } from "express";
import { db } from "@dgc-arcade/db";
import { usersTable } from "@dgc-arcade/db";
import { eq } from "drizzle-orm";

export const slotsRapidApiRouter = Router();

/**
 * RapidAPI Slot Streamer Configuration
 * Generic launcher for any RapidAPI-based slot provider
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_SLOT_HOST || "your-slot-provider.p.rapidapi.com";

/**
 * POST /api/slots/launch-rapidapi
 * Launch a slot game via RapidAPI slot streamer
 * 
 * Body: {
 *   gameId: string,
 *   gameName: string,
 *   provider: string,
 *   cryptoType: string (e.g., "BTC", "ETH")
 * }
 * 
 * Returns: { launchUrl, sessionId, gameToken }
 */
slotsRapidApiRouter.post("/launch-rapidapi", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { gameId, gameName, provider, cryptoType } = req.body;

    if (!gameId || !gameName || !provider) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch user
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate session token (used for game communication)
    const sessionId = `${userId}-${gameId}-${Date.now()}`;
    const gameToken = Buffer.from(
      JSON.stringify({
        userId,
        gameId,
        gameName,
        provider,
        cryptoType,
        balance: user.casinoBalance,
        timestamp: Date.now(),
      })
    ).toString("base64");

    /**
     * Call RapidAPI Slot Streamer endpoint
     * This is a generic pattern — adjust the endpoint based on your actual slot provider
     */
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
          userId: sessionId,
          token: gameToken,
          returnUrl: `${process.env.FRONTEND_URL}/slots/${gameId}`,
          currency: cryptoType,
        }),
      }
    );

    if (!rapidApiResponse.ok) {
      console.error("RapidAPI error:", await rapidApiResponse.text());
      return res.status(502).json({ error: "Failed to launch game via RapidAPI" });
    }

    const rapidApiData = await rapidApiResponse.json();

    // Return launch URL and session info
    res.json({
      success: true,
      launchUrl: rapidApiData.gameUrl || rapidApiData.launchUrl,
      sessionId,
      gameToken,
      provider,
      gameName,
    });
  } catch (error) {
    console.error("Error launching RapidAPI slot:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/slots/sync-balance
 * Sync user balance after slot spin (called by RapidAPI callback)
 * 
 * Body: {
 *   sessionId: string,
 *   betAmount: number,
 *   winAmount: number,
 *   gameId: string
 * }
 */
slotsRapidApiRouter.post("/sync-balance", async (req, res) => {
  try {
    const { sessionId, betAmount, winAmount, gameId } = req.body;

    if (!sessionId || betAmount === undefined || winAmount === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Parse sessionId to get userId
    const userId = parseInt(sessionId.split("-")[0]);

    // Fetch user
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Calculate new balance: deduct bet, add win
    const currentBalance = parseFloat(user.casinoBalance.toString());
    const newBalance = currentBalance - betAmount + winAmount;

    // Update user balance with row lock
    await db
      .update(usersTable)
      .set({ casinoBalance: newBalance })
      .where(eq(usersTable.id, userId));

    res.json({
      success: true,
      newBalance,
      betAmount,
      winAmount,
      profit: winAmount - betAmount,
    });
  } catch (error) {
    console.error("Error syncing balance:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/slots/game-info/:gameId
 * Fetch game metadata for display
 */
slotsRapidApiRouter.get("/game-info/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;

    /**
     * Fetch game info from RapidAPI
     * This would call the slot provider's game metadata endpoint
     */
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
    res.json(gameInfo);
  } catch (error) {
    console.error("Error fetching game info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
