import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  isSportsGameOddsConfigured,
  fetchLeagueEvents,
  mapEventToFixture,
} from "../lib/sportsgameodds.js";

export const sportsbookLiveRouter = Router();

/**
 * GET /api/sportsbook/live/:sport
 * Fetches LIVE IN-PLAY games only from SportsGameOdds.
 * Filters for games that are currently in progress or started within the last 3 hours.
 */
sportsbookLiveRouter.get("/:sport", async (req: Request, res: Response) => {
  try {
    const sportParam = req.params.sport;
    const sport = Array.isArray(sportParam) ? sportParam[0] : sportParam;

    if (!isSportsGameOddsConfigured()) {
      return res.status(503).json({
        success: false,
        error: "Sportsbook API key not configured",
        fixtures: [],
      });
    }

    logger.info({ sport }, "[SportsLive] Fetching live in-play games");

    const events = await fetchLeagueEvents(sport, { finalized: "false" });
    // Filter using the REAL status.live boolean from SportsGameOdds — never guess from time
    const liveGames = events
      .filter((event) => event.status?.live === true)
      .map((event) => mapEventToFixture(event, sport));

    logger.info({ count: liveGames.length, sport }, "[SportsLive] Fetched live games");

    return res.json({
      success: true,
      fixtures: liveGames,
      source: "sportsgameodds-live",
      count: liveGames.length,
    });
  } catch (error) {
    logger.error({ error, sport: req.params.sport }, "[SportsLive] Error fetching live games");
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      fixtures: [],
    });
  }
});
