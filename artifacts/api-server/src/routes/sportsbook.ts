import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sportsBetsTable, usersTable, userBalancesTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { getCryptoPrice } from "../lib/price-service.js";

export const sportsbookRouter = Router();

/**
 * The Odds API Configuration
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "the-odds-api.p.rapidapi.com";
const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY || "";
// Ensure we use the correct base URL for The Odds API via RapidAPI
const ODDS_API_BASE = RAPIDAPI_HOST.includes("rapidapi.com") 
  ? `https://${RAPIDAPI_HOST}` 
  : `https://the-odds-api.p.rapidapi.com`;

/**
 * GET /api/sportsbook/sports
 */
sportsbookRouter.get("/sports", async (req: Request, res: Response) => {
  try {
    // Use THE_ODDS_API_KEY if available, otherwise fallback to RapidAPI headers
    const headers: Record<string, string> = THE_ODDS_API_KEY 
      ? { "x-api-key": THE_ODDS_API_KEY }
      : { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST };

    const response = await fetch(`${ODDS_API_BASE}/v4/sports`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch sports" });
    }

    const sports = await response.json();
    return res.json(sports);
  } catch (error) {
    console.error("Error fetching sports:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/odds/:sport
 */
sportsbookRouter.get("/odds/:sport", async (req: Request, res: Response) => {
  try {
    const { sport } = req.params;
    const { regions = "us", oddsFormat = "decimal" } = req.query;

    const headers: Record<string, string> = THE_ODDS_API_KEY 
      ? { "x-api-key": THE_ODDS_API_KEY }
      : { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": RAPIDAPI_HOST };

    // Default to American odds format as requested
    const format = oddsFormat === "decimal" ? "american" : oddsFormat;
    const response = await fetch(
      `${ODDS_API_BASE}/v4/sports/${sport}/odds?regions=${regions as string}&oddsFormat=${format as string}`,
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch odds" });
    }

    const odds = await response.json();
    return res.json(odds);
  } catch (error) {
    console.error("Error fetching odds:", error);
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
        cryptoType as string,
        tx
      );

      const cryptoPrice = await getCryptoPrice(usedCurrency);
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

    if (!admin || admin.role !== "admin") {
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
