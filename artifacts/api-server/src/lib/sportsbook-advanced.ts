import { db, sportsBetsTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { fetchAllLiveEvents, isSportsGameOddsConfigured } from "./sportsgameodds.js";
import { writeLiveOddsSnapshot, readLiveOddsSnapshot } from "./live-odds-cache.js";
import { getUserBalance, deductBalance, creditCryptoBalance } from "./balance-service.js";
import { getCryptoPrice } from "./price-service.js";
import crypto from "node:crypto";

// --- SWR Caching Layer ---
const STALE_TTL_MS = 5000; // 5 seconds
let isRevalidating = false;

export async function getLiveOddsSWR() {
  const snapshot = await readLiveOddsSnapshot(isSportsGameOddsConfigured());
  
  if (snapshot) {
    const ageMs = Date.now() - new Date(snapshot.updatedAt || Date.now()).getTime();

    if (ageMs > STALE_TTL_MS && !isRevalidating) {
      isRevalidating = true;
      triggerBackgroundRevalidate().catch(err => {
        logger.error({ err }, "SWR Background Revalidation Failed");
      }).finally(() => {
        isRevalidating = false;
      });
    }
    
    return snapshot.fixtures;
  }

  return await triggerBackgroundRevalidate();
}

async function triggerBackgroundRevalidate() {
  if (!isSportsGameOddsConfigured()) return [];
  const fixtures = await fetchAllLiveEvents();
  const snapshot = await writeLiveOddsSnapshot(fixtures, new Date(), true);
  return snapshot.fixtures;
}

// --- Odds Helpers ---

export function americanToDecimal(odds: number): number {
  if (odds > 0) {
    return (odds / 100) + 1;
  } else {
    return (100 / Math.abs(odds)) + 1;
  }
}

function americanToProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    const positiveOdds = Math.abs(odds);
    return positiveOdds / (positiveOdds + 100);
  }
}

// --- Cash Out Logic ---

export async function calculateCashOutValue(ticketId: string): Promise<number> {
  const HOUSE_MARGIN_HOLD = 0.05; // 5% house edge
  
  const legs = await db.select().from(sportsBetsTable).where(
    and(
      eq(sportsBetsTable.ticketId, ticketId),
      eq(sportsBetsTable.status, "pending")
    )
  );
  
  if (!legs || legs.length === 0) return 0;

  const potentialPayoutUsd = Number(legs[0].potentialPayoutUsd);
  const snapshot = await readLiveOddsSnapshot(isSportsGameOddsConfigured());
  if (!snapshot) return 0;
  
  const liveFixtures = snapshot.fixtures;
  let combinedCurrentProbability = 1;

  for (const leg of legs) {
    const liveMatch = liveFixtures.find((f: any) => f.id === leg.fixtureId);
    if (!liveMatch) return 0;

    // Access markets through the bookmakers array (matching existing system contract)
    const market = liveMatch.bookmakers[0]?.markets?.find((m: any) => m.key === leg.marketKey);
    const outcome = market?.outcomes?.find((o: any) => o.name === leg.selectedOutcome);
    
    if (!outcome) return 0;

    const impliedProb = americanToProbability(Number(outcome.price));
    combinedCurrentProbability *= impliedProb;
  }

  const fairCashOutValue = potentialPayoutUsd * combinedCurrentProbability;
  const finalCashOutOffer = fairCashOutValue * (1 - HOUSE_MARGIN_HOLD);

  if (finalCashOutOffer >= potentialPayoutUsd) return potentialPayoutUsd * 0.95;
  return Math.max(0, finalCashOutOffer);
}

// --- Bet Placement (Parlay & Single) ---

export interface BetLeg {
  fixtureId: string;
  sportKey: string;
  leagueTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  marketKey: string;
  selectedOutcome: string;
  odds: number; // American odds
  bookmakerKey?: string;
  metadata?: any;
}

export async function placeBetTicket(
  userId: number,
  legs: BetLeg[],
  stakeUsd: number,
  cryptoType: string
) {
  if (!legs || legs.length === 0 || stakeUsd <= 0) {
    throw new Error("Invalid legs or stake amount.");
  }

  // --- Professional Parlay Validation (SGP Rules) ---
  const gameMap = new Map<string, Set<string>>();
  for (const leg of legs) {
    if (!gameMap.has(leg.fixtureId)) {
      gameMap.set(leg.fixtureId, new Set());
    }
    const markets = gameMap.get(leg.fixtureId)!;
    
    // 1. Prevent multiple Moneyline (h2h) bets on the same game
    if (leg.marketKey === 'h2h' && markets.has('h2h')) {
      throw new Error("You cannot bet on multiple moneyline outcomes for the same game in one parlay.");
    }
    
    // 2. Prevent conflicting selections on the same market (e.g., both Over and Under)
    const marketSelectionKey = `${leg.marketKey}:${leg.selectedOutcome}`;
    if (markets.has(marketSelectionKey)) {
      throw new Error(`Duplicate selection: ${leg.selectedOutcome} for ${leg.marketKey}`);
    }
    
    markets.add(leg.marketKey);
    markets.add(marketSelectionKey);
  }

  return await db.transaction(async (tx) => {
    // 1. Get current crypto price for the "Crypto -> USD" conversion
    const cryptoPrice = await getCryptoPrice(cryptoType);
    if (cryptoPrice <= 0) throw new Error("Price data unavailable for " + cryptoType);

    // 2. Deduct balance (this handles the "Crypto -> USD" part internally)
    // It deducts crypto equivalent to stakeUsd
    await deductBalance(userId, stakeUsd, cryptoType, tx);

    // 3. Compute combined parlay odds
    let totalDecimalMultiplier = 1;
    for (const leg of legs) {
      totalDecimalMultiplier *= americanToDecimal(leg.odds);
    }

    const potentialPayoutUsd = stakeUsd * totalDecimalMultiplier;
    const isParlay = legs.length > 1;
    const ticketId = crypto.randomUUID();
    const cryptoAmount = stakeUsd / cryptoPrice;
    const potentialPayoutCrypto = potentialPayoutUsd / cryptoPrice;

    // 4. Insert records into sports_bets
    for (const leg of legs) {
      await tx.insert(sportsBetsTable).values({
        userId,
        fixtureId: leg.fixtureId,
        sportKey: leg.sportKey,
        leagueTitle: leg.leagueTitle,
        homeTeam: leg.homeTeam,
        awayTeam: leg.awayTeam,
        commenceTime: new Date(leg.commenceTime),
        marketKey: leg.marketKey,
        selectedOutcome: leg.selectedOutcome,
        odds: String(leg.odds),
        betAmountUsd: String(stakeUsd),
        betAmountCrypto: String(cryptoAmount),
        cryptoType,
        cryptoPriceAtBet: String(cryptoPrice),
        potentialPayoutUsd: String(potentialPayoutUsd),
        potentialPayoutCrypto: String(potentialPayoutCrypto),
        isParlay,
        ticketId,
        parlayStakeUsd: isParlay ? String(stakeUsd) : null,
        status: "pending",
        bookmakerKey: leg.bookmakerKey || "default",
        metadata: leg.metadata || {},
      });
    }

    return { ticketId, potentialPayoutUsd };
  });
}

// --- Cash Out Processing ---

export async function processCashOut(ticketId: string, userId: number) {
  return await db.transaction(async (tx) => {
    const cashOutValueUsd = await calculateCashOutValue(ticketId);
    if (cashOutValueUsd <= 0) throw new Error("Cash out unavailable at this time.");

    // 1. Update bet status
    await tx.update(sportsBetsTable)
      .set({ 
        status: "cashed_out", 
        settlementPayoutUsd: String(cashOutValueUsd) 
      })
      .where(and(
        eq(sportsBetsTable.ticketId, ticketId),
        eq(sportsBetsTable.userId, userId),
        eq(sportsBetsTable.status, "pending")
      ));

    // 2. Credit wallet (the "USD -> Crypto" part)
    const cryptoType = (await tx.select({ cryptoType: sportsBetsTable.cryptoType })
      .from(sportsBetsTable)
      .where(eq(sportsBetsTable.ticketId, ticketId))
      .limit(1))[0]?.cryptoType || "BTC";

    const cryptoPrice = await getCryptoPrice(cryptoType);
    const cryptoAmount = cashOutValueUsd / cryptoPrice;

    await creditCryptoBalance(userId, cryptoType, cryptoAmount, tx);

    return { cashOutValueUsd, cryptoAmount, cryptoType };
  });
}
