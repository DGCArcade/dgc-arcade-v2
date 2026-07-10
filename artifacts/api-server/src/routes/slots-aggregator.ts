import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";

export const slotsAggregatorRouter = Router();

// Provider credentials — env vars take priority; fall back to sandbox defaults
const AGGREGATOR_URL = (process.env.CASINO_PROVIDER_URL || "https://my.nexusggr.dev").replace(/\/$/, "");
const AGGREGATOR_API_KEY = process.env.CASINO_API_KEY || "test_demoxx";
const AGGREGATOR_MERCHANT_ID = process.env.CASINO_MERCHANT_ID || "test_demo";

// In-memory cache for aggregator games
let cachedGames: any[] | null = null;
let cacheExpiresAt = 0;
const CACHE_DURATION_MS = 1000 * 60 * 15; // 15 minutes

/**
 * GET /api/slots/aggregator/games
 * Fetches the real list of 150+ games from NexusGGR with official cover art
 * and dynamically maps them into our searchable grid format.
 */
slotsAggregatorRouter.get("/games", async (req: Request, res: Response) => {
  try {
    const now = Date.now();

    // Return cached games if still valid
    if (cachedGames && now < cacheExpiresAt) {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return res.json({
        success: true,
        games: cachedGames,
        source: "aggregator",
        cached: true,
        cacheExpiresIn: Math.round((cacheExpiresAt - now) / 1000),
      });
    }

    // Fetch fresh games from aggregator
    logger.info("[SlotsAggregator] Fetching fresh game list from NexusGGR...");

    const gameListUrl = new URL(`${AGGREGATOR_URL}/games`);
    gameListUrl.searchParams.set("api_key", AGGREGATOR_API_KEY);
    gameListUrl.searchParams.set("merchant_id", AGGREGATOR_MERCHANT_ID);

    const aggregatorRes = await fetch(gameListUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "DGCArcade/2.0 AggregatorSync",
        "X-Api-Key": AGGREGATOR_API_KEY,
        "X-Merchant-Id": AGGREGATOR_MERCHANT_ID,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!aggregatorRes.ok) {
      logger.error(
        { status: aggregatorRes.status, url: gameListUrl.toString() },
        "[SlotsAggregator] Failed to fetch games from aggregator"
      );
      // Return cached games as fallback
      if (cachedGames) {
        return res.json({
          success: true,
          games: cachedGames,
          source: "aggregator_fallback",
          cached: true,
        });
      }
      return res.status(503).json({
        success: false,
        error: "Aggregator unavailable",
        message: "Could not fetch games from NexusGGR. Please try again later.",
      });
    }

    const aggregatorData = await aggregatorRes.json() as any;

    // Map aggregator games into our format
    const games = (aggregatorData.games || aggregatorData.data || [])
      .map((game: any, idx: number) => ({
        id: game.game_id || game.id || `game-${idx}`,
        title: game.name || game.title || "Unknown Game",
        provider: game.provider || "NexusGGR",
        thumbnail: game.image || game.thumbnail || game.cover_url || "",
        rtp: parseFloat(game.rtp) || 96.0,
        volatility: normalizeVolatility(game.volatility),
        jackpot: game.jackpot ? parseFloat(game.jackpot) : undefined,
        gameUrl: game.game_url || game.url || "",
        slug: game.slug || game.game_id?.toLowerCase() || `game-${idx}`,
      }))
      .filter((g: any) => g.id && g.title); // Remove invalid entries

    logger.info(
      { count: games.length },
      "[SlotsAggregator] Successfully fetched games from aggregator"
    );

    // Cache the results
    cachedGames = games;
    cacheExpiresAt = now + CACHE_DURATION_MS;

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.json({
      success: true,
      games,
      source: "aggregator",
      cached: false,
      totalGames: games.length,
    });
  } catch (error) {
    logger.error({ error }, "[SlotsAggregator] Error fetching games");
    // Return cached games as fallback
    if (cachedGames) {
      return res.json({
        success: true,
        games: cachedGames,
        source: "aggregator_fallback",
        cached: true,
        error: "Using cached data due to fetch error",
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Could not fetch games. Please try again later.",
    });
  }
});

/**
 * GET /api/slots/aggregator/game/:id
 * Fetches details for a specific game from the aggregator
 */
slotsAggregatorRouter.get("/game/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const gameDetailUrl = new URL(`${AGGREGATOR_URL}/game/${id}`);
    gameDetailUrl.searchParams.set("api_key", AGGREGATOR_API_KEY);
    gameDetailUrl.searchParams.set("merchant_id", AGGREGATOR_MERCHANT_ID);

    const aggregatorRes = await fetch(gameDetailUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "DGCArcade/2.0 AggregatorSync",
        "X-Api-Key": AGGREGATOR_API_KEY,
        "X-Merchant-Id": AGGREGATOR_MERCHANT_ID,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!aggregatorRes.ok) {
      logger.warn({ status: aggregatorRes.status, gameId: id }, "[SlotsAggregator] Game not found");
      return res.status(404).json({ success: false, error: "Game not found" });
    }

    const game = await aggregatorRes.json();
    return res.json({ success: true, game });
  } catch (error) {
    logger.error({ error, gameId: req.params.id }, "[SlotsAggregator] Error fetching game details");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/**
 * Helper: normalize volatility string to standard format
 */
function normalizeVolatility(v: unknown): "low" | "medium" | "high" {
  const s = String(v ?? "").toLowerCase();
  if (s === "low") return "low";
  if (s === "high" || s === "extreme" || s === "very high") return "high";
  return "medium";
}
