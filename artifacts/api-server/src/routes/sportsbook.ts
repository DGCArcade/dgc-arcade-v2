import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sportsBetsTable, usersTable, userBalancesTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { getCryptoPrice } from "../lib/price-service.js";

export const sportsbookRouter = Router();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * The Odds API Configuration
 *
 * PRIMARY:  The Odds API direct (https://api.the-odds-api.com)
 *   - Free tier: 500 requests/month — no credit card, no contact required
 *   - Sign up free at https://the-odds-api.com  →  get THE_ODDS_API_KEY
 *   - Set env var: THE_ODDS_API_KEY=your_key_here
 *
 * FALLBACK: RapidAPI proxy (https://the-odds-api.p.rapidapi.com)
 *   - Only used if THE_ODDS_API_KEY is not set
 *   - Set env vars: RAPIDAPI_KEY + RAPIDAPI_HOST=the-odds-api.p.rapidapi.com
 *
 * Recommendation: Use the direct API. It's free, open, and requires no
 * third-party marketplace subscription or paid contact.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY || "";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "the-odds-api.p.rapidapi.com";

// Prefer direct API; fall back to RapidAPI proxy only if direct key is absent
const USE_DIRECT_API = !!THE_ODDS_API_KEY;
const ODDS_API_BASE = USE_DIRECT_API
  ? "https://api.the-odds-api.com"
  : `https://${RAPIDAPI_HOST}`;

function buildOddsHeaders(): Record<string, string> {
  if (USE_DIRECT_API) return {}; // key goes in query param for direct API
  return { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST };
}

function buildOddsUrl(path: string, extraParams: Record<string, string> = {}): string {
  const url = new URL(`${ODDS_API_BASE}${path}`);
  if (USE_DIRECT_API && THE_ODDS_API_KEY) url.searchParams.set("apiKey", THE_ODDS_API_KEY);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * GET /api/sportsbook/sports
 * Returns all available sports from The Odds API.
 */
sportsbookRouter.get("/sports", async (req: Request, res: Response) => {
  try {
    if (!THE_ODDS_API_KEY && !RAPIDAPI_KEY) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set THE_ODDS_API_KEY in your Render environment variables. Free key at https://the-odds-api.com",
      });
    }

    const url = buildOddsUrl("/v4/sports", { all: "false" });
    const response = await fetch(url, { method: "GET", headers: buildOddsHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Sportsbook] /sports failed ${response.status}: ${body}`);
      return res.status(response.status).json({ error: "Failed to fetch sports from The Odds API", details: body });
    }

    const sports = await response.json();
    return res.json(sports);
  } catch (error) {
    console.error("[Sportsbook] Error fetching sports:", error);
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
      return res.json({ configured: false, mode: "rapidapi", message: "Using RapidAPI proxy — quota not directly visible" });
    }
    const url = buildOddsUrl("/v4/sports", { all: "false" });
    const response = await fetch(url, { headers: buildOddsHeaders() });
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
 * GET /api/sportsbook/odds/:sport
 * Returns live odds for a given sport key. Always uses American odds format.
 */
sportsbookRouter.get("/odds/:sport", async (req: Request, res: Response) => {
  try {
    const { sport } = req.params;
    const regions = (req.query.regions as string) || "us";
    const markets = (req.query.markets as string) || "h2h";
    // Always American odds — matches the UI display logic
    const oddsFormat = "american";

    if (!THE_ODDS_API_KEY && !RAPIDAPI_KEY) {
      return res.status(503).json({
        error: "Sportsbook API key not configured",
        setup: "Set THE_ODDS_API_KEY in your Render environment variables. Free key at https://the-odds-api.com",
      });
    }

    const url = buildOddsUrl(`/v4/sports/${sport}/odds`, { regions, oddsFormat, markets });
    const response = await fetch(url, { method: "GET", headers: buildOddsHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Sportsbook] /odds/${sport} failed ${response.status}: ${body}`);
      return res.status(response.status).json({ error: "Failed to fetch odds", details: body });
    }

    const odds = await response.json();

    // Log remaining quota for monitoring (direct API only)
    if (USE_DIRECT_API) {
      const remaining = response.headers.get("x-requests-remaining");
      const used = response.headers.get("x-requests-used");
      if (remaining) console.log(`[Sportsbook] Odds API quota — used: ${used}, remaining: ${remaining}`);
    }

    return res.json(odds);
  } catch (error) {
    console.error("[Sportsbook] Error fetching odds:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/bet
 * Uses the real crypto wallet (balance-service) to prevent "fake" balances.
 */
sportsbookRouter.post("/bet", async (req: Request, res: Response) => {
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

    // 1. Process deduction with SQL row lock via transaction
    const betResult = await db.transaction(async (tx) => {
      // Apply row lock on user balance to prevent race conditions
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM user_balances WHERE user_id = ${userId} FOR UPDATE`);

      // Use the deductBalance logic within the transaction
      const { newBalance, usedCurrency } = await deductBalance(
        userId, 
        parseFloat(betAmountUsd), 
        cryptoType as string
      );

      const cryptoPrice = await getCryptoPrice(usedCurrency.split("_")[0]);
      const betAmountCrypto = parseFloat(betAmountUsd) / cryptoPrice;
      // Calculate potential payout based on American odds
      const americanOdds = parseFloat(odds.toString());
      let multiplier = 0;
      if (americanOdds > 0) {
        multiplier = (americanOdds / 100) + 1;
      } else {
        multiplier = (100 / Math.abs(americanOdds)) + 1;
      }
      const potentialPayoutUsd = parseFloat(betAmountUsd) * multiplier;
      const potentialPayoutCrypto = potentialPayoutUsd / cryptoPrice;

      // 2. Record the bet with the real crypto details
      const [bet] = await tx
        .insert(sportsBetsTable)
        .values({
          userId: userId as number,
          fixtureId: fixtureId as string,
          sportKey: sportKey as string,
          leagueTitle: leagueTitle as string,
          homeTeam: homeTeam as string,
          awayTeam: awayTeam as string,
          commenceTime: new Date(commenceTime),
          marketKey: marketKey as string,
          selectedOutcome: selectedOutcome as string,
          odds: odds.toString(),
          betAmountUsd: betAmountUsd.toString(),
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
    console.error("Error placing bet:", error);
    return res.status(error.message === "Insufficient balance" ? 400 : 500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

/**
 * GET /api/sportsbook/bets/:userId
 */
sportsbookRouter.get("/bets/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = (req as any).user?.id;
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
    console.error("Error fetching bets:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/settle-bet
 * Credits winnings back to the real crypto wallet.
 */
sportsbookRouter.post("/settle-bet", async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.id;
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
      
      // Credit winnings back to the SAME crypto used for the bet
      // This ensures the USD balance is always tied to real crypto.
      newTotalBalance = await creditBalance(
        bet.userId, 
        actualPayoutUsd, 
        bet.cryptoType || "BTC"
      );
    } else {
      const { totalBalance } = await getUserBalance(bet.userId);
      newTotalBalance = totalBalance;
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
    console.error("Error settling bet:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
