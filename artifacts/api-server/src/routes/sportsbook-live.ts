import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";
import { readLiveOddsSnapshot } from "../lib/live-odds-cache.js";
import { isSportsGameOddsConfigured } from "../lib/sportsgameodds.js";

export const sportsbookLiveRouter = Router();

/**
 * GET /api/sportsbook/live/:sport
 * Serves the last committed in-play snapshot. The background worker owns all
 * provider traffic so browser count cannot multiply SportsGameOdds usage.
 */
sportsbookLiveRouter.get("/:sport", async (req: Request, res: Response) => {
  const sportParam = req.params.sport;
  const sport = (Array.isArray(sportParam) ? sportParam[0] : sportParam).toLowerCase();

  try {
    const snapshot = await readLiveOddsSnapshot(isSportsGameOddsConfigured());
    const fixtures = sport === "all"
      ? snapshot.fixtures
      : snapshot.fixtures.filter((fixture) =>
          fixture.sport_key.toLowerCase() === sport ||
          fixture.sport_title.toLowerCase() === sport,
        );

    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return res.json({
      success: true,
      fixtures,
      source: "sportsgameodds-neon-live",
      count: fixtures.length,
      updatedAt: snapshot.updatedAt,
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
      version: snapshot.version,
      stale: snapshot.stale,
      configured: snapshot.configured,
    });
  } catch (error) {
    logger.error({ error, sport }, "[SportsLive] Failed to read live snapshot");
    return res.status(503).json({
      success: false,
      error: "Live sportsbook snapshot is temporarily unavailable",
      fixtures: [],
      stale: true,
      configured: isSportsGameOddsConfigured(),
    });
  }
});
