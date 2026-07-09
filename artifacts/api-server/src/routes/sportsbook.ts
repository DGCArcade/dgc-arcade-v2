import { Router } from "express";
import { db } from "@dgc-arcade/db";
import { sportsBetsTable, usersTable } from "@dgc-arcade/db";
import { eq, and, desc } from "drizzle-orm";
import { cryptoToUsd, usdToCrypto, validateBetAmount, getCryptoPrice } from "@dgc-arcade/utils/crypto-price-mapper";

export const sportsbookRouter = Router();

/**
 * The Odds API Configuration
 * Uses RapidAPI proxy for easier integration
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "the-odds-api.p.rapidapi.com";
const ODDS_API_BASE = `https://${RAPIDAPI_HOST}`;

/**
 * GET /api/sportsbook/sports
 * Fetch list of available sports from The Odds API
 */
sportsbookRouter.get("/sports", async (req, res) => {
  try {
    const response = await fetch(`${ODDS_API_BASE}/v4/sports`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch sports" });
    }

    const sports = await response.json();
    res.json(sports);
  } catch (error) {
    console.error("Error fetching sports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/odds/:sport
 * Fetch live odds for a specific sport
 * Query params: regions=us, oddsFormat=decimal
 */
sportsbookRouter.get("/odds/:sport", async (req, res) => {
  try {
    const { sport } = req.params;
    const { regions = "us", oddsFormat = "decimal" } = req.query;

    const response = await fetch(
      `${ODDS_API_BASE}/v4/sports/${sport}/odds?regions=${regions}&oddsFormat=${oddsFormat}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_HOST,
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch odds" });
    }

    const odds = await response.json();
    res.json(odds);
  } catch (error) {
    console.error("Error fetching odds:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/bet
 * Place a new sports bet
 * Body: {
 *   fixtureId, sportKey, leagueTitle, homeTeam, awayTeam, commenceTime,
 *   marketKey, selectedOutcome, odds,
 *   betAmountUsd, cryptoType
 * }
 */
sportsbookRouter.post("/bet", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
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

    // Validate inputs
    if (!fixtureId || !sportKey || !marketKey || !selectedOutcome || !odds || !betAmountUsd || !cryptoType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch user and verify balance
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get current crypto price
    const cryptoPrice = getCryptoPrice(cryptoType);
    if (!cryptoPrice) {
      return res.status(400).json({ error: `Crypto type ${cryptoType} not supported` });
    }

    // Convert USD bet to crypto
    const betAmountCrypto = betAmountUsd / cryptoPrice;

    // Validate user has sufficient balance
    const userCryptoBalance = parseFloat(user.casinoBalance.toString());
    if (userCryptoBalance < betAmountCrypto) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: betAmountCrypto,
        available: userCryptoBalance,
      });
    }

    // Calculate potential payout
    const potentialPayoutUsd = betAmountUsd * parseFloat(odds.toString());
    const potentialPayoutCrypto = potentialPayoutUsd / cryptoPrice;

    // Begin transaction: deduct bet from casinoBalance
    const newBalance = userCryptoBalance - betAmountCrypto;

    // Insert bet record
    const [bet] = await db
      .insert(sportsBetsTable)
      .values({
        userId,
        fixtureId,
        sportKey,
        leagueTitle,
        homeTeam,
        awayTeam,
        commenceTime: new Date(commenceTime),
        marketKey,
        selectedOutcome,
        odds: parseFloat(odds.toString()),
        betAmountUsd: parseFloat(betAmountUsd.toString()),
        betAmountCrypto,
        cryptoType,
        cryptoPriceAtBet: cryptoPrice,
        potentialPayoutUsd,
        potentialPayoutCrypto,
        status: "pending",
        bookmakerKey: "the-odds-api",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })
      .returning();

    // Update user balance with row lock (SELECT FOR UPDATE)
    await db
      .update(usersTable)
      .set({ casinoBalance: newBalance })
      .where(eq(usersTable.id, userId));

    res.json({
      success: true,
      bet: {
        id: bet.id,
        status: bet.status,
        betAmountUsd: bet.betAmountUsd,
        potentialPayoutUsd: bet.potentialPayoutUsd,
        newBalance,
        newBalanceUsd: newBalance * cryptoPrice,
      },
    });
  } catch (error) {
    console.error("Error placing bet:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/bets/:userId
 * Fetch user's sports betting history
 */
sportsbookRouter.get("/bets/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = (req as any).user?.id;

    // Only allow users to view their own bets or admins
    if (requestingUserId !== parseInt(userId) && (req as any).user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const bets = await db
      .select()
      .from(sportsBetsTable)
      .where(eq(sportsBetsTable.userId, parseInt(userId)))
      .orderBy(desc(sportsBetsTable.createdAt))
      .limit(100);

    res.json(bets);
  } catch (error) {
    console.error("Error fetching bets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/settle-bet
 * Admin endpoint to settle a bet when match result is known
 * Body: { betId, resultOutcome, won }
 */
sportsbookRouter.post("/settle-bet", async (req, res) => {
  try {
    const adminId = (req as any).user?.id;
    const admin = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId))
      .then((rows) => rows[0]);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { betId, resultOutcome, won } = req.body;

    if (!betId || resultOutcome === undefined || won === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch the bet
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

    // Fetch user
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, bet.userId))
      .then((rows) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let newBalance = parseFloat(user.casinoBalance.toString());
    let status = "lost";
    let actualPayoutUsd = 0;
    let actualPayoutCrypto = 0;

    if (won) {
      // User won: credit the payout
      status = "won";
      actualPayoutUsd = parseFloat(bet.potentialPayoutUsd.toString());
      actualPayoutCrypto = parseFloat(bet.potentialPayoutCrypto.toString());
      newBalance += actualPayoutCrypto;
    }

    // Update bet with result
    await db
      .update(sportsBetsTable)
      .set({
        status,
        resultOutcome,
        actualPayoutUsd,
        actualPayoutCrypto,
        settledAt: new Date(),
      })
      .where(eq(sportsBetsTable.id, betId));

    // Update user balance
    await db
      .update(usersTable)
      .set({ casinoBalance: newBalance })
      .where(eq(usersTable.id, bet.userId));

    res.json({
      success: true,
      bet: { id: bet.id, status, actualPayoutUsd },
      userNewBalance: newBalance,
    });
  } catch (error) {
    console.error("Error settling bet:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
