import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { aggregatorGamesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
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
 * Helper: normalize volatility string to standard format
 */
function normalizeVolatility(v: unknown): "low" | "medium" | "high" {
  const s = String(v ?? "").toLowerCase();
  if (s === "low") return "low";
  if (s === "high" || s === "extreme" || s === "very high") return "high";
  return "medium";
}

/**
 * Helper: seed database with premium slot games if empty
 */
async function seedPremiumSlotsIfNeeded(): Promise<void> {
  try {
    const count = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM aggregator_games`
    );
    const gameCount = (count as any)[0]?.cnt || 0;

    if (gameCount > 0) {
      logger.info("[SlotsAggregator] Database already seeded with games");
      return;
    }

    logger.info("[SlotsAggregator] Seeding database with 150+ premium slot titles...");

    // Import premium slots seed data
    // @ts-ignore
    const { ALL_PREMIUM_SLOTS } = await import("../../../lib/db/src/seeds/premium-slots");

    // Insert in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < ALL_PREMIUM_SLOTS.length; i += batchSize) {
      const batch = ALL_PREMIUM_SLOTS.slice(i, i + batchSize);
      await db.insert(aggregatorGamesTable).values(
        batch.map((game: any) => ({
          gameId: game.gameId,
          title: game.title,
          provider: game.provider,
          thumbnail: game.thumbnail,
          rtp: String(game.rtp),
          volatility: game.volatility,
          slug: game.slug,
          metadata: { features: ["free-spins", "bonus-rounds"] },
          active: "true",
        }))
      ).onConflictDoNothing();
    }

    logger.info("[SlotsAggregator] Successfully seeded database with premium slots");
  } catch (error) {
    logger.error({ error }, "[SlotsAggregator] Error seeding database");
    // Non-fatal: continue with fallback
  }
}

/**
 * Helper: fetch games from database fallback
 */
async function getGamesFromDatabase(): Promise<any[]> {
  try {
    const games = await db.select().from(aggregatorGamesTable).where(eq(aggregatorGamesTable.active, "true"));
    return games.map((game) => ({
      id: game.gameId,
      title: game.title,
      provider: game.provider,
      thumbnail: game.thumbnail,
      rtp: parseFloat(game.rtp),
      volatility: game.volatility,
      slug: game.slug,
      jackpot: game.jackpot ? parseFloat(game.jackpot) : undefined,
    }));
  } catch (error) {
    logger.error({ error }, "[SlotsAggregator] Error fetching games from database");
    return [];
  }
}

/**
 * GET /api/slots/aggregator/games
 * Fetches the real list of 150+ games from NexusGGR with official cover art.
 * Falls back to local database cache if aggregator is unavailable.
 * Never returns an error — always serves games from cache or database.
 */
slotsAggregatorRouter.get("/games", async (req: Request, res: Response) => {
  try {
    const now = Date.now();

    // Return in-memory cache if still valid
    if (cachedGames && now < cacheExpiresAt) {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return res.json({
        success: true,
        games: cachedGames,
        source: "cache",
        cached: true,
        cacheExpiresIn: Math.round((cacheExpiresAt - now) / 1000),
      });
    }

    // Attempt to fetch fresh games from aggregator
    logger.info("[SlotsAggregator] Fetching fresh game list from NexusGGR...");

    const gameListUrl = new URL(`${AGGREGATOR_URL}/games`);
    gameListUrl.searchParams.set("api_key", AGGREGATOR_API_KEY);
    gameListUrl.searchParams.set("merchant_id", AGGREGATOR_MERCHANT_ID);

    let games: any[] = [];
    let source = "aggregator";

    try {
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

      if (aggregatorRes.ok) {
        const aggregatorData = await aggregatorRes.json() as any;

        // Map aggregator games into our format
        const aggregatorGames = (aggregatorData.games || aggregatorData.data || [])
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
          .filter((g: any) => g.id && g.title);

        if (aggregatorGames.length > 0) {
          games = aggregatorGames;
          logger.info(
            { count: games.length },
            "[SlotsAggregator] Successfully fetched games from aggregator"
          );
        }
      } else {
        logger.warn(
          { status: aggregatorRes.status, url: gameListUrl.toString() },
          "[SlotsAggregator] Aggregator returned non-OK status, falling back to database"
        );
      }
    } catch (fetchError) {
      logger.warn(
        { error: fetchError },
        "[SlotsAggregator] Aggregator fetch failed, falling back to database"
      );
    }

    // If aggregator failed, fetch from database
    if (games.length === 0) {
      logger.info("[SlotsAggregator] Fetching games from local database...");
      const dbGames = await getGamesFromDatabase();
      games = dbGames;
      source = "database";

      // If database is empty, seed it
      if (dbGames.length === 0) {
        await seedPremiumSlotsIfNeeded();
        games = await getGamesFromDatabase();
        source = "database_seeded";
      }
    }

    // Cache the results (whether from aggregator or database)
    cachedGames = games || [];
    cacheExpiresAt = now + CACHE_DURATION_MS;

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.json({
      success: true,
      games: cachedGames,
      source,
      cached: false,
      totalGames: cachedGames.length,
    });
  } catch (error) {
    logger.error({ error }, "[SlotsAggregator] Unexpected error in /games endpoint");

    // Last resort: return in-memory cache if available
    if (cachedGames) {
      return res.json({
        success: true,
        games: cachedGames,
        source: "cache_fallback",
        cached: true,
        error: "Using cached data due to error",
      });
    }

    // Fetch from database as final fallback
    const dbGames = await getGamesFromDatabase();
    if (dbGames.length > 0) {
      return res.json({
        success: true,
        games: dbGames,
        source: "database_fallback",
        cached: true,
        error: "Using database fallback",
      });
    }

    // If all else fails, return empty games array (never an error)
    return res.json({
      success: true,
      games: [],
      source: "empty",
      cached: false,
      error: "No games available at this time",
    });
  }
});

/**
 * GET /api/slots/aggregator/game/:id
 * Fetches details for a specific game from the aggregator or database.
 * Falls back to database if aggregator is unavailable.
 */
slotsAggregatorRouter.get("/game/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Try aggregator first
    try {
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

      if (aggregatorRes.ok) {
        const game = await aggregatorRes.json();
        return res.json({ success: true, game, source: "aggregator" });
      }
    } catch (error) {
      logger.warn({ error, gameId: id }, "[SlotsAggregator] Aggregator fetch failed for game details");
    }

    // Fall back to database
    const dbGame = await db.select().from(aggregatorGamesTable).where(eq(aggregatorGamesTable.gameId, String(id))).limit(1);
    if (dbGame.length > 0) {
      const game = dbGame[0];
      return res.json({
        success: true,
        game: {
          id: game.gameId,
          title: game.title,
          provider: game.provider,
          thumbnail: game.thumbnail,
          rtp: parseFloat(game.rtp),
          volatility: game.volatility,
          slug: game.slug,
          metadata: game.metadata,
        },
        source: "database",
      });
    }

    return res.status(404).json({ success: false, error: "Game not found" });
  } catch (error) {
    logger.error({ error, gameId: req.params.id }, "[SlotsAggregator] Error fetching game details");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});
