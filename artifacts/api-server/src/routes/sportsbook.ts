import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sportsBetsTable, usersTable, userBalancesTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth.js";
import { eq, and, desc, sql, lt, lte } from "drizzle-orm";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { getCryptoPrice } from "../lib/price-service.js";
import { logger } from "../lib/logger.js";
import {
  isSportsGameOddsConfigured,
  CATEGORY_LEAGUES,
  ALL_LEAGUE_IDS,
  fetchLeagueEvents,
  fetchCategoryEvents,
  mapEventToFixture,
} from "../lib/sportsgameodds.js";
import { cached } from "../lib/response-cache-v2.js";

export const sportsbookRouter = Router();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SportsGameOdds API Configuration
 *
 * Uses SportsGameOdds.com (https://sportsgameodds.com)
 *   - Set env var: SPORTSGAMEODDS_API_KEY=your_key_here in Render dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Compute correct payout multiplier from American odds.
 * e.g. +150 → 2.5x, -110 → 1.909x
 */
function americanOddsToMultiplier(americanOdds: number): number {
  if (americanOdds > 0) {
    return Number((americanOdds / 100 + 1).toFixed(4));
  } else if (americanOdds < 0) {
    return Number((100 / Math.abs(americanOdds) + 1).toFixed(4));
  }
  return 1.0; // Push/Void
}

/**
 * GET /api/sportsbook/sports
 * Returns all available sport categories/leagues (SportsGameOdds-backed).
 */
sportsbookRouter.get("/sports", async (req: Request, res: Response) => {
  try {
    if (!isSportsGameOddsConfigured()) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set SPORTSGAMEODDS_API_KEY in your Render environment variables. https://sportsgameodds.com",
      });
    }

    const sports = Object.entries(CATEGORY_LEAGUES).flatMap(([category, leagueIDs]) =>
      leagueIDs.map((leagueID) => ({
        key: leagueID,
        group: category,
        title: leagueID,
        description: `${category} — ${leagueID}`,
        active: true,
      }))
    );

    return res.json(sports);
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching sports");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sports/feed
 * Premium global match feed for Football, Basketball, MMA, Boxing, Tennis, Golf, etc.
 * Loops real-time data into the DGC glassmorphic match card layout.
 * This is the primary feed endpoint referenced in the deployment spec.
 * 
 * OPTIMIZED: Cached with 30-second TTL and stale-while-revalidate for instant loads.
 */
sportsbookRouter.get("/feed", async (req: Request, res: Response) => {
  try {
    if (!isSportsGameOddsConfigured()) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set SPORTSGAMEODDS_API_KEY in your Render environment variables.",
      });
    }

    // Fetch and cache the feed with 30-second TTL and 60-second stale window
    const feedData = await cached(
      "sportsbook:global-feed",
      120_000, // 2 minutes TTL
      async () => {
        const categories = Object.keys(CATEGORY_LEAGUES);
        const feedResults: Record<string, any[]> = Object.fromEntries(categories.map((c) => [c, []]));

        // Fetch ALL leagues in parallel (not sequentially per category) — 5-10x faster
        await Promise.all(
          Object.entries(CATEGORY_LEAGUES).flatMap(([category, leagueIDs]) =>
            leagueIDs.map(async (leagueID) => {
              try {
                const events = await fetchLeagueEvents(leagueID, { finalized: "false" });
                const fixtures = events.map((event) => {
                  const fixture = mapEventToFixture(event, leagueID);
                  return {
                    ...fixture,
                    _category: category,
                    _sportKey: leagueID,
                    _isLive: new Date(fixture.commence_time).getTime() <= Date.now() + 3600000,
                  };
                });
                feedResults[category].push(...fixtures);
              } catch {
                // Skip unavailable leagues silently
              }
            })
          )
        );

        // Sort: live first, then by commence time
        for (const category of Object.keys(feedResults)) {
          feedResults[category].sort((a: any, b: any) => {
            const aIsLive = a._isLive ? 0 : 1;
            const bIsLive = b._isLive ? 0 : 1;
            if (aIsLive !== bIsLive) return aIsLive - bIsLive;
            return new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
          });
        }

        return feedResults;
      },
      {
        staleTtlMs: 300_000, // serve stale for up to 5 min while revalidating in background
        staleWhileRevalidate: true,
      }
    );

    return res.json({
      success: true,
      feed: feedData,
      totalFixtures: Object.values(feedData).reduce((sum, arr) => sum + arr.length, 0),
      fetchedAt: new Date().toISOString(),
      cached: true,
    });
  } catch (error) {
    logger.error({ error }, "[Sportsbook] Error fetching global feed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/quota
 * Returns whether SportsGameOdds is configured (for monitoring in owner panel).
 */
sportsbookRouter.get("/quota", async (_req: Request, res: Response) => {
  try {
    if (!isSportsGameOddsConfigured()) {
      return res.json({ configured: false, message: "SPORTSGAMEODDS_API_KEY not set" });
    }
    return res.json({
      configured: true,
      mode: "sportsgameodds",
      plan: "pro",
      leagues: ALL_LEAGUE_IDS,
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
    const sportParam = req.params.sport;
    const sport = Array.isArray(sportParam) ? sportParam[0] : sportParam;

    if (!isSportsGameOddsConfigured()) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set SPORTSGAMEODDS_API_KEY in your Render environment variables.",
      });
    }

    // Set SSE headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", sport, timestamp: new Date().toISOString() })}\n\n`);

    const realInterval = setInterval(async () => {
      try {
        const events = await fetchLeagueEvents(sport, { finalized: "false" });
        const fixtures = events.slice(0, 20).map((event) => mapEventToFixture(event, sport));

        res.write(
          `data: ${JSON.stringify({
            type: "odds_update",
            sport,
            fixtures,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
      } catch (error) {
        logger.error({ error, sport }, "[Sportsbook] Error in live stream");
      }
    }, 10000); // Update every 10 seconds

    // Clean up interval on client disconnect
    req.on("close", () => {
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
 * Returns live odds for a given leagueID (SportsGameOdds), normalized to the
 * fixture shape the frontend expects. Always uses American odds format.
 */
sportsbookRouter.get("/odds/:sport", async (req: Request, res: Response) => {
  try {
    const sportParam = req.params.sport;
    const sport = Array.isArray(sportParam) ? sportParam[0] : sportParam;

    if (!isSportsGameOddsConfigured()) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set SPORTSGAMEODDS_API_KEY in your Render environment variables.",
      });
    }

    const events = await fetchLeagueEvents(sport, { finalized: "false" });
    const fixtures = events.map((event) => mapEventToFixture(event, sport));

    return res.json(fixtures);
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
      bookmakerKey,
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
    // Ensure potential payout is rounded to 2 decimal places for USD
    const potentialPayoutUsd = Math.floor(betAmountFloat * multiplier * 100) / 100;

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

      // Extract spread/total metadata for settlement
      const metadata: any = {};
      if (marketKey === "spreads" && req.body.spread !== undefined) {
        metadata.spread = req.body.spread;
      }
      if (marketKey === "totals" && req.body.total !== undefined) {
        metadata.total = req.body.total;
      }

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
          bookmakerKey: bookmakerKey || "sportsgameodds",
          ipAddress: Array.isArray(req.ip) ? req.ip[0] : (req.ip || "0.0.0.0"),
          userAgent: (req.get("user-agent") as string) || "unknown",
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
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
        if (!isSportsGameOddsConfigured()) break;

        // Query this specific event from SportsGameOdds
        const events = await fetchLeagueEvents(bet.sportKey, { finalized: "true" });
        const matchEvent = events.find((e) => e.eventID === bet.fixtureId);

        // Only settle if the match is marked finalized/ended
        if (!matchEvent || !(matchEvent.status?.finalized || matchEvent.status?.ended)) continue;

        const homeTeamName = matchEvent.teams?.home?.names?.long || matchEvent.teams?.home?.teamID;
        const awayTeamName = matchEvent.teams?.away?.names?.long || matchEvent.teams?.away?.teamID;

        // Pull final score from any h2h-moneyline oddID's "score" field
        const oddsEntries = Object.values(matchEvent.odds ?? {});
        const homeScoreEntry = oddsEntries.find((o) => o.oddID?.includes("-home-game-ml-home"));
        const awayScoreEntry = oddsEntries.find((o) => o.oddID?.includes("-away-game-ml-away"));
        const homeScore = homeScoreEntry?.score;
        const awayScore = awayScoreEntry?.score;

        let won = false;
        if (homeScore !== undefined && awayScore !== undefined) {
          const home = parseFloat(homeScore);
          const away = parseFloat(awayScore);
          const homeWon = home > away;
          const awayWon = away > home;
          const isDraw = home === away;

          if (bet.marketKey === "spreads") {
            // Spread: team must win after applying the point spread stored in metadata
            const spread = parseFloat((bet.metadata as any)?.spread ?? "0");
            const isHomeSide = bet.selectedOutcome === homeTeamName;
            const adjustedHome = home + (isHomeSide ? spread : 0);
            const adjustedAway = away + (!isHomeSide ? spread : 0);
            won = isHomeSide ? adjustedHome > adjustedAway : adjustedAway > adjustedHome;
          } else if (bet.marketKey === "totals") {
            // Totals: Over/Under vs the line stored in metadata
            const totalLine = parseFloat((bet.metadata as any)?.total ?? "0");
            const actualTotal = home + away;
            if (actualTotal === totalLine) {
              // Push — refund; skip (leave pending for manual resolution)
              continue;
            }
            won = bet.selectedOutcome === "Over" ? actualTotal > totalLine : actualTotal < totalLine;
          } else {
            // H2H moneyline (default)
            if (bet.selectedOutcome === homeTeamName) won = homeWon;
            else if (bet.selectedOutcome === awayTeamName) won = awayWon;
            else if (bet.selectedOutcome === "Draw") won = isDraw;
          }
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
