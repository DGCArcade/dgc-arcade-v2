import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";

export const sportsbookLiveRouter = Router();

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY || "7687F...";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

/**
 * GET /api/sportsbook/live/:sport
 * Fetches LIVE IN-PLAY games only from The Odds API
 * Filters for games that are currently in progress or started within the last 3 hours
 */
sportsbookLiveRouter.get("/:sport", async (req: Request, res: Response) => {
  try {
    const { sport } = req.params;
    const { regions = "us", oddsFormat = "american" } = req.query;

    logger.info({ sport }, "[SportsLive] Fetching live in-play games");

    // Build The Odds API URL
    const url = new URL(`${ODDS_API_BASE}/sports/${sport}/scores`);
    url.searchParams.set("apiKey", THE_ODDS_API_KEY);
    url.searchParams.set("daysFrom", "0"); // Only today's games
    url.searchParams.set("bookmakers", "fanduel,draftkings,betmgm,pointsbetus");

    const oddsRes = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!oddsRes.ok) {
      logger.warn(
        { status: oddsRes.status, sport },
        "[SportsLive] Failed to fetch live games from The Odds API"
      );
      return res.status(503).json({
        success: false,
        error: "Could not fetch live games",
        fixtures: [],
      });
    }

    const data = (await oddsRes.json()) as any;
    const now = new Date();

    // Filter for LIVE games only (started within last 3 hours)
    const liveGames = (data.scores || [])
      .filter((game: any) => {
        const commenceTime = new Date(game.commence_time);
        const timeDiff = (now.getTime() - commenceTime.getTime()) / (1000 * 60);
        // Show games that started within last 180 minutes (3 hours)
        return timeDiff >= 0 && timeDiff < 180;
      })
      .map((game: any) => ({
        id: game.id,
        sport_key: game.sport_key,
        sport_title: game.sport_title,
        commence_time: game.commence_time,
        completed: game.completed,
        home_team: game.home_team,
        away_team: game.away_team,
        scores: game.scores, // Live score data
        last_update: game.last_update,
        bookmakers: (game.bookmakers || [])
          .filter((bm: any) => bm.markets && bm.markets.length > 0)
          .map((bm: any) => ({
            key: bm.key,
            title: bm.title,
            markets: bm.markets.map((market: any) => ({
              key: market.key,
              outcomes: market.outcomes,
            })),
          })),
      }));

    logger.info(
      { count: liveGames.length, sport },
      "[SportsLive] Fetched live games"
    );

    return res.json({
      success: true,
      fixtures: liveGames,
      source: "the-odds-api-live",
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
