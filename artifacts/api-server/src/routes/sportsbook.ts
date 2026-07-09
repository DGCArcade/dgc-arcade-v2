import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sportsBetsTable, usersTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
// Correct relative path to the root lib directory
import { getCryptoPrice } from "../../../../lib/utils/crypto-price-mapper";

export const sportsbookRouter = Router();

/**
 * The Odds API Configuration
 */
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "the-odds-api.p.rapidapi.com";
const ODDS_API_BASE = `https://${RAPIDAPI_HOST}`;

/**
 * GET /api/sportsbook/sports
 */
sportsbookRouter.get("/sports", async (req: Request, res: Response) => {
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

    const response = await fetch(
      `${ODDS_API_BASE}/v4/sports/${sport}/odds?regions=${regions as string}&oddsFormat=${oddsFormat as string}`,
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
    return res.json(odds);
  } catch (error) {
    console.error("Error fetching odds:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/sportsbook/bet
 */
sportsbookRouter.post("/bet", async (req: Request, res: Response) => {
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

    if (!fixtureId || !sportKey || !marketKey || !selectedOutcome || !odds || !betAmountUsd || !cryptoType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows: any[]) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const cryptoPrice = getCryptoPrice(cryptoType);
    if (!cryptoPrice) {
      return res.status(400).json({ error: `Crypto type ${cryptoType} not supported` });
    }

    const betAmountCrypto = betAmountUsd / cryptoPrice;
    const userCryptoBalance = parseFloat(user.casinoBalance.toString());
    if (userCryptoBalance < betAmountCrypto) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: betAmountCrypto,
        available: userCryptoBalance,
      });
    }

    const potentialPayoutUsd = betAmountUsd * parseFloat(odds.toString());
    const potentialPayoutCrypto = potentialPayoutUsd / cryptoPrice;
    const newBalance = userCryptoBalance - betAmountCrypto;

    const [bet] = await db
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
        betAmountCrypto: betAmountCrypto.toString(),
        cryptoType: cryptoType as string,
        cryptoPriceAtBet: cryptoPrice.toString(),
        potentialPayoutUsd: potentialPayoutUsd.toString(),
        potentialPayoutCrypto: potentialPayoutCrypto.toString(),
        status: "pending",
        bookmakerKey: "the-odds-api",
        ipAddress: Array.isArray(req.ip) ? req.ip[0] : (req.ip || ""),
        userAgent: req.get("user-agent") || "",
      })
      .returning();

    await db
      .update(usersTable)
      .set({ casinoBalance: newBalance.toString() })
      .where(eq(usersTable.id, userId));

    return res.json({
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sportsbook/bets/:userId
 */
sportsbookRouter.get("/bets/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = (req as any).user?.id;

    if (requestingUserId !== parseInt(userId) && (req as any).user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const bets = await db
      .select()
      .from(sportsBetsTable)
      .where(eq(sportsBetsTable.userId, parseInt(userId)))
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
 */
sportsbookRouter.post("/settle-bet", async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user?.id;
    const admin = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId))
      .then((rows: any[]) => rows[0]);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { betId, resultOutcome, won } = req.body;

    if (!betId || resultOutcome === undefined || won === undefined) {
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

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, bet.userId))
      .then((rows: any[]) => rows[0]);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let newBalance = parseFloat(user.casinoBalance.toString());
    let status = "lost";
    let actualPayoutUsd = 0;
    let actualPayoutCrypto = 0;

    if (won) {
      status = "won";
      actualPayoutUsd = parseFloat(bet.potentialPayoutUsd.toString());
      actualPayoutCrypto = parseFloat(bet.potentialPayoutCrypto.toString());
      newBalance += actualPayoutCrypto;
    }

    await db
      .update(sportsBetsTable)
      .set({
        status,
        resultOutcome: resultOutcome.toString(),
        actualPayoutUsd: actualPayoutUsd.toString(),
        actualPayoutCrypto: actualPayoutCrypto.toString(),
        settledAt: new Date(),
      })
      .where(eq(sportsBetsTable.id, betId));

    await db
      .update(usersTable)
      .set({ casinoBalance: newBalance.toString() })
      .where(eq(usersTable.id, bet.userId));

    return res.json({
      success: true,
      bet: { id: bet.id, status, actualPayoutUsd },
      userNewBalance: newBalance,
    });
  } catch (error) {
    console.error("Error settling bet:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
