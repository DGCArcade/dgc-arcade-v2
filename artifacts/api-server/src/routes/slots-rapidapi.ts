import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const slotsRapidApiRouter = Router();

/**
 * RapidAPI Slot Streamer Configuration
 * Generic launcher for any RapidAPI-based slot provider
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_SLOT_HOST || "your-slot-provider.p.rapidapi.com";

interface LaunchResponse {
  gameUrl?: string;
  launchUrl?: string;
}

/**
 * POST /api/slots/launch-rapidapi
 */
slotsRapidApiRouter.post("/launch-rapidapi", async (req: Request, res: Response) => {
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
      .then((rows: any[]) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate session token
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

    const rapidApiData = (await rapidApiResponse.json()) as LaunchResponse;

    return res.json({
      success: true,
      launchUrl: rapidApiData.gameUrl || rapidApiData.launchUrl,
      sessionId,
      gameToken,
      provider,
      gameName,
    });
  } catch (error) {
    console.error("Error launching RapidAPI slot:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/slots/sync-balance
 */
slotsRapidApiRouter.post("/sync-balance", async (req: Request, res: Response) => {
  try {
    const { sessionId, betAmount, winAmount } = req.body;

    if (!sessionId || betAmount === undefined || winAmount === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const userId = parseInt(sessionId.split("-")[0]);

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows: any[]) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentBalance = parseFloat(user.casinoBalance.toString());
    const newBalance = currentBalance - betAmount + winAmount;

    await db
      .update(usersTable)
      .set({ casinoBalance: newBalance.toString() })
      .where(eq(usersTable.id, userId));

    return res.json({
      success: true,
      newBalance,
      betAmount,
      winAmount,
      profit: winAmount - betAmount,
    });
  } catch (error) {
    console.error("Error syncing balance:", error);
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
