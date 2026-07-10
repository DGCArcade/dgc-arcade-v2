import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sportsBetsTable, usersTable, userBalancesTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth.js";
import { eq, and, desc, sql, lt, lte } from "drizzle-orm";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { getCryptoPrice } from "../lib/price-service.js";
import { logger } from "../lib/logger.js";

export const sportsbookRouter = Router();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * The Odds API Configuration
 *
 * Uses The Odds API direct (https://api.the-odds-api.com)
 *   - Set env var: THE_ODDS_API_KEY=your_key_here in Render dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */
const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY || "";
const ODDS_API_BASE = "https://api.the-odds-api.com";

function buildOddsUrl(path: string, extraParams: Record<string, string> = {}): string {
  const url = new URL(`${ODDS_API_BASE}${path}`);
  if (THE_ODDS_API_KEY) url.searchParams.set("apiKey", THE_ODDS_API_KEY);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Compute correct payout multiplier from American odds.
 * e.g. +150 → 2.5x, -110 → 1.909x
 */
function americanOddsToMultiplier(americanOdds: number): number {
  if (americanOdds > 0) {
    return americanOdds / 100 + 1;
  } else {
    return 100 / Math.abs(americanOdds) + 1;
  }
}

/**
 * GET /api/sportsbook/sports
 * Returns all available sports from The Odds API.
 */
sportsbookRouter.get("/sports", async (req: Request, res: Response) => {
  try {
    if (!THE_ODDS_API_KEY) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set THE_ODDS_API_KEY in your Render environment variables. Free key at https://the-odds-api.com",
      });
    }

    const url = buildOddsUrl("/v4/sports", { all: "false" });
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "[Sportsbook] /sports failed");
      return res.status(response.status).json({ error: "Failed to fetch sports from The Odds API", details: body });
    }

    const sports = await response.json();
    return res.json(sports);
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching sports");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sports/feed
 * Premium global match feed for Football, Basketball, UFC, and Tennis.
 * Loops real-time data into the DGC glassmorphic match card layout.
 * This is the primary feed endpoint referenced in the deployment spec.
 */
sportsbookRouter.get("/feed", async (req: Request, res: Response) => {
  try {
    if (!THE_ODDS_API_KEY) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set THE_ODDS_API_KEY in your Render environment variables.",
      });
    }

    // Expanded sport keys — covers all major categories shown in the frontend
    const TRACKED_SPORTS: Record<string, string[]> = {
      Football: [
        "americanfootball_nfl",
        "americanfootball_ncaaf",
        "soccer_epl",
        "soccer_mls",
        "soccer_uefa_champs_league",
        "soccer_uefa_europa_league",
        "soccer_spain_la_liga",
        "soccer_germany_bundesliga",
        "soccer_italy_serie_a",
        "soccer_france_ligue_one",
      ],
      Basketball: [
        "basketball_nba",
        "basketball_ncaab",
        "basketball_euroleague",
        "basketball_wnba",
      ],
      Baseball: ["baseball_mlb"],
      Hockey: ["icehockey_nhl", "icehockey_sweden_hockey_league"],
      Tennis: [
        "tennis_atp_wimbledon",
        "tennis_wta_wimbledon",
        "tennis_atp_us_open",
        "tennis_wta_us_open",
        "tennis_atp_aus_open",
        "tennis_wta_aus_open",
        "tennis_atp_french_open",
        "tennis_wta_french_open",
      ],
      UFC: ["mma_mixed_martial_arts"],
      Boxing: ["boxing_boxing"],
      Golf: [
        "golf_pga_championship",
        "golf_the_masters_tournament",
        "golf_us_open",
        "golf_the_open_championship",
      ],
    };

    const feedResults: Record<string, any[]> = {
      Football: [],
      Basketball: [],
      Baseball: [],
      Hockey: [],
      Tennis: [],
      UFC: [],
      Boxing: [],
      Golf: [],
    };

    // Fetch fixtures for each category in parallel (live + upcoming merged)
    await Promise.all(
      Object.entries(TRACKED_SPORTS).map(async ([category, sportKeys]) => {
        for (const sportKey of sportKeys) {
          try {
            // Fetch all odds (live and upcoming)
            const url = buildOddsUrl(`/v4/sports/${sportKey}/odds`, {
              regions: "us",
              oddsFormat: "american",
              markets: "h2h",
            });
            const resp = await fetch(url, { method: "GET" });
            if (!resp.ok) continue;
            const fixtures = await resp.json() as any[];
            feedResults[category].push(
              ...fixtures.map((f: any) => ({
                ...f,
                _category: category,
                _sportKey: sportKey,
                _isLive: new Date(f.commence_time).getTime() <= Date.now() + 3600000,
              }))
            );
          } catch {
            // Skip unavailable sport keys silently
          }
        }
      })
    );

    // Sort by commence time (live games first, then upcoming)
    for (const category of Object.keys(feedResults)) {
      feedResults[category].sort((a: any, b: any) => {
        const aIsLive = a._isLive ? 0 : 1;
        const bIsLive = b._isLive ? 0 : 1;
        if (aIsLive !== bIsLive) return aIsLive - bIsLive;
        const aTime = new Date(a.commence_time).getTime();
        const bTime = new Date(b.commence_time).getTime();
        return aTime - bTime;
      });
    }

    // Log quota usage
    const quotaUrl = buildOddsUrl("/v4/sports", { all: "false" });
    const quotaResp = await fetch(quotaUrl).catch(() => null);
    if (quotaResp) {
      logger.info({
        used: quotaResp.headers.get("x-requests-used"),
        remaining: quotaResp.headers.get("x-requests-remaining"),
      }, "[Sportsbook] Feed quota");
    }

    return res.json({
      success: true,
      feed: feedResults,
      totalFixtures: Object.values(feedResults).reduce((sum, arr) => sum + arr.length, 0),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching global feed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/quota
 * Returns remaining API quota (for monitoring in owner panel).
 */
sportsbookRouter.get("/quota", async (_req: Request, res: Response) => {
  try {
    if (!THE_ODDS_API_KEY) {
      return res.json({ configured: false, message: "THE_ODDS_API_KEY not set" });
    }
    const url = buildOddsUrl("/v4/sports", { all: "false" });
    const response = await fetch(url);
    return res.json({
      configured: true,
      mode: "direct",
      requestsUsed: response.headers.get("x-requests-used"),
      requestsRemaining: response.headers.get("x-requests-remaining"),
      requestsLast: response.headers.get("x-requests-last"),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to check quota" });
  }
});

/**
 * GET /api/sportsbook/live/:sport
 * Streams live match data with real-time score updates and fluctuating odds.
 * Uses Server-Sent Events (SSE) for continuous updates without polling.
 */
sportsbookRouter.get("/live/:sport", async (req: Request, res: Response) => {
  try {
    const { sport } = req.params;

    if (!THE_ODDS_API_KEY) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set THE_ODDS_API_KEY in your Render environment variables.",
      });
    }

    // Set SSE headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", sport, timestamp: new Date().toISOString() })}\n\n`);

    // Fetch and stream live odds every 10 seconds
    const interval = setInterval(async () => {
      return; // Ensure path returns void for setInterval
    }, 10000);

    // Replace the above dummy with the real logic, ensuring return types are handled
    const realInterval = setInterval(async () => {
      try {
        const url = buildOddsUrl(`/v4/sports/${sport}/odds`, {
          regions: "us",
          oddsFormat: "american",
          markets: "h2h",
        });
        const response = await fetch(url, { method: "GET" });

        if (!response.ok) {
          logger.warn({ status: response.status, sport }, "[Sportsbook] Live odds fetch failed");
          return;
        }

        const oddsData = await response.json() as any[];
        const remaining = response.headers.get("x-requests-remaining");

        // Stream the odds data
        res.write(
          `data: ${JSON.stringify({
            type: "odds_update",
            sport,
            fixtures: oddsData.slice(0, 20), // Limit to 20 fixtures per update
            quotaRemaining: remaining,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      } catch (error) {
        logger.error({ error, sport }, "[Sportsbook] Error in live stream");
      }
    }, 10000); // Update every 10 seconds

    // Clean up interval on client disconnect
    req.on("close", () => {
      clearInterval(interval);
      clearInterval(realInterval);
      res.end();
    });

    return;
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error setting up live stream");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/odds/:sport
 * Returns live odds for a given sport key. Always uses American odds format.
 */
sportsbookRouter.get("/odds/:sport", async (req: Request, res: Response) => {
  try {
    const { sport } = req.params;
    const regions = (req.query.regions as string) || "us";
    const markets = (req.query.markets as string) || "h2h";
    const oddsFormat = "american";

    if (!THE_ODDS_API_KEY) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set THE_ODDS_API_KEY in your Render environment variables.",
      });
    }

    const url = buildOddsUrl(`/v4/sports/${sport}/odds`, { regions, oddsFormat, markets });
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body, sport }, "[Sportsbook] /odds/:sport failed");
      return res.status(response.status).json({ error: "Failed to fetch odds", details: body });
    }

    const odds = await response.json();

    const remaining = response.headers.get("x-requests-remaining");
    const used = response.headers.get("x-requests-used");
    if (remaining) logger.info({ used, remaining }, "[Sportsbook] Odds API quota");

    return res.json(odds);
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching odds");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/bet
 * Places a bet with proper row-locking (SELECT FOR UPDATE) on user_balances
 * and correct American odds payout calculation.
 */
sportsbookRouter.post("/bet", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      fixtureId,
      sportKey,
      leagueTitle,
      homeTeam,
      awayTeam,
      commenceTime,
      marketKey,
      selectedOutcome,
      odds,
      betAmountUsd,
      cryptoType,
    } = req.body;

    if (!fixtureId || !sportKey || !marketKey || !selectedOutcome || !odds || !betAmountUsd || !cryptoType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const betAmountFloat = parseFloat(betAmountUsd);
    if (isNaN(betAmountFloat) || betAmountFloat <= 0) {
      return res.status(400).json({ error: "Invalid bet amount" });
    }

    // Correct American odds payout multiplier
    const americanOdds = parseFloat((odds as any).toString());
    const multiplier = americanOddsToMultiplier(americanOdds);
    const potentialPayoutUsd = betAmountFloat * multiplier;

    const betResult = await db.transaction(async (tx) => {
      // Strict row lock on BOTH users and user_balances before any read/write
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM user_balances WHERE user_id = ${userId} FOR UPDATE`);

      // Deduct balance INSIDE this transaction (passes tx so the lock is honoured)
      const { newBalance, usedCurrency } = await deductBalance(
        userId,
        betAmountFloat,
        cryptoType as string,
        tx
      );

      const cryptoPrice = await getCryptoPrice(usedCurrency.split("_")[0]);
      const betAmountCrypto = betAmountFloat / cryptoPrice;
      const potentialPayoutCrypto = potentialPayoutUsd / cryptoPrice;

      const [bet] = await tx
        .insert(sportsBetsTable)
        .values({
          userId: userId as number,
          fixtureId: fixtureId as string,
          sportKey: sportKey as string,
          leagueTitle: (leagueTitle as string) || "Unknown",
          homeTeam: homeTeam as string,
          awayTeam: awayTeam as string,
          commenceTime: new Date(commenceTime),
          marketKey: marketKey as string,
          selectedOutcome: selectedOutcome as string,
          odds: americanOdds.toString(),
          betAmountUsd: betAmountFloat.toString(),
          betAmountCrypto: betAmountCrypto.toFixed(12),
          cryptoType: usedCurrency,
          cryptoPriceAtBet: cryptoPrice.toString(),
          potentialPayoutUsd: potentialPayoutUsd.toString(),
          potentialPayoutCrypto: potentialPayoutCrypto.toFixed(12),
          status: "pending",
          bookmakerKey: "the-odds-api",
          ipAddress: Array.isArray(req.ip) ? req.ip[0] : (req.ip || "0.0.0.0"),
          userAgent: (req.get("user-agent") as string) || "unknown",
        })
        .returning();

      return { bet, newBalance };
    });

    const { bet, newBalance } = betResult;

    return res.json({
      success: true,
      bet: {
        id: bet.id,
        status: bet.status,
        betAmountUsd: bet.betAmountUsd,
        potentialPayoutUsd: bet.potentialPayoutUsd,
        newBalanceUsd: newBalance,
      },
    });
  } catch (error: any) {
    logger.error({ error }, "[Sportsbook] Error placing bet");
    return res.status(error.message === "Insufficient balance" ? 400 : 500).json({
      error: error.message || "Internal server error",
    });
  }
});

/**
 * GET /api/sportsbook/bets/:userId
 */
sportsbookRouter.get("/bets/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = (req as any).user?.userId;
    const userIdNum = parseInt(Array.isArray(userId) ? userId[0] : userId);

    if (requestingUserId !== userIdNum && (req as any).user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const bets = await db
      .select()
      .from(sportsBetsTable)
      .where(eq(sportsBetsTable.userId, userIdNum))
      .orderBy(desc(sportsBetsTable.createdAt))
      .limit(100);

    return res.json(bets);
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching bets");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/settle-bet
 * Admin endpoint: credits winnings back to the real crypto wallet.
 */
sportsbookRouter.post("/settle-bet", requireAuth, async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.userId;
    const [admin] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId))
      .limit(1);

    if (!admin || (admin.role !== "admin" && admin.role !== "owner")) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { betId, won } = req.body;

    if (!betId || won === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [bet] = await db
      .select()
      .from(sportsBetsTable)
      .where(eq(sportsBetsTable.id, betId));

    if (!bet) {
      return res.status(404).json({ error: "Bet not found" });
    }

    if (bet.status !== "pending") {
      return res.status(400).json({ error: "Bet already settled" });
    }

    let status = "lost";
    let actualPayoutUsd = 0;
    let newTotalBalance = 0;

    if (won) {
      status = "won";
      actualPayoutUsd = parseFloat(bet.potentialPayoutUsd.toString());
      newTotalBalance = await creditBalance(
        bet.userId,
        actualPayoutUsd,
        bet.cryptoType || "BTC"
      );
      logger.info(
        {
          betId: bet.id,
          userId: bet.userId,
          cryptoType: bet.cryptoType,
          payoutUsd: actualPayoutUsd,
          payoutCrypto: bet.potentialPayoutCrypto,
          timestamp: new Date().toISOString(),
        },
        "[Sportsbook] Bet settled — payout credited to vault"
      );
    } else {
      const { totalBalance } = await getUserBalance(bet.userId);
      newTotalBalance = totalBalance;
      logger.info(
        { betId: bet.id, userId: bet.userId, timestamp: new Date().toISOString() },
        "[Sportsbook] Bet settled — loss recorded"
      );
    }

    await db
      .update(sportsBetsTable)
      .set({
        status,
        actualPayoutUsd: actualPayoutUsd.toString(),
        settledAt: new Date(),
      })
      .where(eq(sportsBetsTable.id, betId));

    return res.json({
      success: true,
      bet: { id: bet.id, status, actualPayoutUsd },
      newBalanceUsd: newTotalBalance,
    });
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error settling bet");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/auto-settle
 * Internal endpoint called by the background settlement checker (or owner).
 * Checks all pending bets whose commence_time has passed, queries
 * The Odds API for scores/results, and settles them automatically.
 * Returns a list of settled bets with win/loss outcomes for UI toasts.
 */
sportsbookRouter.post("/auto-settle", async (req: Request, res: Response) => {
  try {
    // Only callable from internal background tasks or owner
    const callerRole = (req as any).user?.role;
    const isInternal = req.headers["x-internal-task"] === process.env.INTERNAL_TASK_SECRET;
    if (!isInternal && callerRole !== "owner" && callerRole !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const now = new Date();
    // Find pending bets where the match has already started (commence_time in the past)
    const pendingBets = await db
      .select()
      .from(sportsBetsTable)
      .where(
        and(
          eq(sportsBetsTable.status, "pending"),
          lte(sportsBetsTable.commenceTime, now)
        )
      )
      .limit(50);

    if (pendingBets.length === 0) {
      return res.json({ success: true, settled: [] });
    }

    const settled: Array<{ betId: number; userId: number; status: string; payoutUsd: number }> = [];

    for (const bet of pendingBets) {
      try {
        if (!THE_ODDS_API_KEY) break;

        // Query scores for this sport
        const scoresUrl = buildOddsUrl(`/v4/sports/${bet.sportKey}/scores`, {
          daysFrom: "3",
        });
        const scoresResp = await fetch(scoresUrl);
        if (!scoresResp.ok) continue;

        const scores = await scoresResp.json() as any[];
        const matchScore = scores.find((s: any) => s.id === bet.fixtureId);

        // Only settle if the match is marked completed
        if (!matchScore || !matchScore.completed) continue;

        const homeScore = matchScore.scores?.find((s: any) => s.name === matchScore.home_team)?.score;
        const awayScore = matchScore.scores?.find((s: any) => s.name === matchScore.away_team)?.score;

        let won = false;
        if (homeScore !== undefined && awayScore !== undefined) {
          const homeWon = parseFloat(homeScore) > parseFloat(awayScore);
          const awayWon = parseFloat(awayScore) > parseFloat(homeScore);
          const isDraw = parseFloat(homeScore) === parseFloat(awayScore);

          if (bet.selectedOutcome === matchScore.home_team) won = homeWon;
          else if (bet.selectedOutcome === matchScore.away_team) won = awayWon;
          else if (bet.selectedOutcome === "Draw") won = isDraw;
        }

        let actualPayoutUsd = 0;
        let newBalance = 0;

        if (won) {
          actualPayoutUsd = parseFloat(bet.potentialPayoutUsd.toString());
          newBalance = await creditBalance(bet.userId, actualPayoutUsd, bet.cryptoType || "BTC");
        } else {
          const { totalBalance } = await getUserBalance(bet.userId);
          newBalance = totalBalance;
        }

        await db
          .update(sportsBetsTable)
          .set({
            status: won ? "won" : "lost",
            actualPayoutUsd: actualPayoutUsd.toString(),
            settledAt: new Date(),
          })
          .where(eq(sportsBetsTable.id, bet.id));

        settled.push({
          betId: bet.id,
          userId: bet.userId,
          status: won ? "won" : "lost",
          payoutUsd: actualPayoutUsd,
        });

        logger.info(
          { betId: bet.id, userId: bet.userId, won, actualPayoutUsd },
          "[Sportsbook] Auto-settled bet"
        );
      } catch (betErr) {
        logger.error({ betErr, betId: bet.id }, "[Sportsbook] Error auto-settling individual bet");
      }
    }

    return res.json({ success: true, settled });
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Auto-settle error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/pending-results/:userId
 * Returns recently settled bets for a user so the frontend can
 * display Win/Loss toast notifications on the profile panel.
 */
sportsbookRouter.get("/pending-results/:userId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = (req as any).user?.userId;
    const userIdNum = parseInt(Array.isArray(userId) ? userId[0] : userId);

    if (requestingUserId !== userIdNum) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Return bets settled in the last 10 minutes that haven't been toasted yet
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentlySettled = await db
      .select()
      .from(sportsBetsTable)
      .where(
        and(
          eq(sportsBetsTable.userId, userIdNum),
          sql`${sportsBetsTable.settledAt} >= ${tenMinutesAgo}`,
          sql`${sportsBetsTable.status} IN ('won', 'lost')`
        )
      )
      .orderBy(desc(sportsBetsTable.settledAt))
      .limit(10);

    return res.json(recentlySettled);
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching pending results");
    return res.status(500).json({ error: "Internal server error" });
  }
});
