import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, blackjackHandsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { requireLocationVerified } from "../middlewares/location.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { checkWagerLimits } from "../services/gambling-limits.js";
import { v4 as uuidv4 } from "uuid";
import { createHash, createHmac } from "crypto";

export const blackjackRouter = Router();

// ─── Card utils ───────────────────────────────────────────────────────────────
type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Card = { suit: Suit; rank: Rank };

interface SplitState {
  isSplit: true;
  hands: Card[][];
  activeHandIndex: number;
  bets: number[];
  statuses: string[];
  payouts: number[];
}

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const NUM_DECKS = 6;

function buildShoe(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < NUM_DECKS; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ suit, rank });
  return deck;
}

function shuffleShoe(serverSeed: string, clientSeed: string, nonce: number, deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const message = `${clientSeed}:${nonce}:${i}:blackjack`;
    const h = createHmac("sha256", serverSeed).update(message).digest("hex");
    const j = parseInt(h.slice(0, 8), 16) % (i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

function cardValue(rank: Rank): number {
  if (["J","Q","K"].includes(rank)) return 10;
  if (rank === "A") return 11;
  return parseInt(rank);
}

function handTotal(hand: Card[]): number {
  let total = 0, aces = 0;
  for (const c of hand) {
    const v = cardValue(c.rank);
    if (v === 11) aces++;
    total += v;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoftHand(hand: Card[]): boolean {
  let rawTotal = 0, rawAces = 0;
  for (const c of hand) {
    const v = cardValue(c.rank);
    if (v === 11) rawAces++;
    rawTotal += v;
  }
  return rawAces > 0 && rawTotal <= 21;
}

function isBust(hand: Card[]): boolean { return handTotal(hand) > 21; }

function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handTotal(hand) === 21;
}

function dealerShouldHit(hand: Card[]): boolean {
  const total = handTotal(hand);
  if (total < 17) return true;
  if (total === 17 && isSoftHand(hand)) return true;
  return false;
}

function resolveHand(playerHand: Card[], dealerHand: Card[]): string {
  const pt = handTotal(playerHand);
  const dt = handTotal(dealerHand);
  if (isBust(playerHand)) return "dealer_wins";
  if (isBlackjack(playerHand) && !isBlackjack(dealerHand)) return "player_blackjack";
  if (isBust(dealerHand)) return "player_wins";
  if (pt > dt) return "player_wins";
  if (dt > pt) return "dealer_wins";
  return "push";
}

function calcPayout(status: string, bet: number): number {
  if (status === "player_wins") return bet * 2;
  if (status === "player_blackjack") return bet * 2.5;
  if (status === "push") return bet;
  return 0;
}

// ─── POST /api/blackjack/deal ─────────────────────────────────────────────────
blackjackRouter.post("/deal", requireAuth, requireLocationVerified, async (req, res) => {
  const { gameId, amount, clientSeed: rawClientSeed } = req.body;
  if (!gameId || !amount || amount <= 0) {
    res.status(400).json({ error: "gameId and amount required" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
    if (!game || !game.active) { res.status(404).json({ error: "Game not found" }); return; }

    const minBet = parseFloat(String(game.minBet ?? "1"));
    const maxBet = parseFloat(String(game.maxBet ?? "10000"));
    if (amount < minBet) { res.status(400).json({ error: `Minimum bet is $${minBet}` }); return; }
    if (amount > maxBet) { res.status(400).json({ error: `Maximum bet is $${maxBet}` }); return; }

    const { totalBalance } = await getUserBalance(user.id);
    if (totalBalance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const limitCheck = await checkWagerLimits(user.id, amount);
    if (!limitCheck.ok) {
      res.status(403).json({ error: limitCheck.error, code: limitCheck.code });
      return;
    }

    // Auto-resolve stale active hands
    await db.update(blackjackHandsTable)
      .set({ status: "dealer_wins" })
      .where(and(
        eq(blackjackHandsTable.userId, req.user!.userId),
        eq(blackjackHandsTable.status, "active")
      ));

    let currentBalance: number;
    let usedCurrency: string;
    try {
      const result = await deductBalance(user.id, amount);
      currentBalance = result.newBalance;
      usedCurrency = result.usedCurrency;
      await db.update(usersTable)
        .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${amount}` })
        .where(eq(usersTable.id, user.id));
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Insufficient balance" });
      return;
    }

    const serverSeed = uuidv4().replace(/-/g, "");
    const serverSeedHash = hashServerSeed(serverSeed);
    const clientSeed = rawClientSeed || uuidv4().replace(/-/g, "").slice(0, 16);
    const nonce = (user.totalBets || 0) + 1;

    const shoe = shuffleShoe(serverSeed, clientSeed, nonce, buildShoe());

    const playerHand: Card[] = [shoe[0], shoe[2]];
    const dealerHand: Card[] = [shoe[1], shoe[3]];
    const remainingDeck = shoe.slice(4);

    const dealerUpcard = dealerHand[0];
    const insuranceEligible = dealerUpcard.rank === "A";

    let status = "active";
    let payout = 0;

    const playerBJ = isBlackjack(playerHand);
    const dealerBJ = isBlackjack(dealerHand);

    if (playerBJ && dealerBJ) {
      status = "push";
      payout = amount;
    } else if (playerBJ) {
      status = "player_blackjack";
      payout = amount * 2.5;
    } else if (dealerBJ) {
      status = "dealer_wins";
      payout = 0;
    }

    const [hand] = await db.insert(blackjackHandsTable).values({
      userId: user.id,
      gameId: game.id,
      bet: String(amount),
      serverSeed,
      clientSeed,
      nonce,
      deckState: JSON.stringify(remainingDeck),
      playerHand: JSON.stringify(playerHand),
      dealerHand: JSON.stringify(dealerHand),
      status,
      currency: usedCurrency,
    }).returning();

    if (status !== "active") {
      currentBalance = await creditBalance(user.id, payout, usedCurrency);
      await db.update(usersTable).set({
        totalBets: sql`total_bets + 1`,
        totalWon: sql`coalesce(total_won, 0) + ${payout}`,
      }).where(eq(usersTable.id, user.id));
      await db.insert(betsTable).values({
        userId: user.id, gameId: game.id,
        amount: String(amount), payout: String(payout),
        won: payout > 0,
        multiplier: String(amount > 0 ? payout / amount : 0),
        serverSeed, serverSeedHash, clientSeed, nonce,
        currency: usedCurrency,
        meta: { playerHand, dealerHand, result: status },
      });
    }

    res.json({
      handId: hand.id,
      playerHand,
      dealerHand: status === "active" ? [dealerHand[0], { suit: "?", rank: "?" }] : dealerHand,
      playerTotal: handTotal(playerHand),
      dealerTotal: status !== "active" ? handTotal(dealerHand) : null,
      status,
      payout,
      bet: amount,
      balance: currentBalance!,
      currency: usedCurrency,
      insuranceEligible: status === "active" ? insuranceEligible : false,
      serverSeedHash,
      clientSeed,
      nonce,
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack deal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/blackjack/action ───────────────────────────────────────────────
blackjackRouter.post("/action", requireAuth, requireLocationVerified, async (req, res) => {
  const { handId, action } = req.body;
  if (!handId || !action) {
    res.status(400).json({ error: "handId and action required" });
    return;
  }

  const validActions = ["hit", "stand", "double", "split", "insurance"];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` });
    return;
  }

  try {
    const [hand] = await db.select().from(blackjackHandsTable)
      .where(and(eq(blackjackHandsTable.id, handId), eq(blackjackHandsTable.userId, req.user!.userId)))
      .limit(1);
    if (!hand || hand.status !== "active") {
      res.status(400).json({ error: "No active hand found" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const serverSeed = hand.serverSeed;
    const clientSeed = hand.clientSeed || "default";
    const nonce = hand.nonce || 1;
    const serverSeedHash = hashServerSeed(serverSeed);
    const usedCurrency = hand.currency || "USD";

    let deck: Card[] = JSON.parse(hand.deckState);
    const bet = parseFloat(hand.bet);

    let rawPlayerHand: any;
    try { rawPlayerHand = JSON.parse(hand.playerHand); } catch { rawPlayerHand = []; }

    const isSplitHand = rawPlayerHand?.isSplit === true;

    if (isSplitHand) {
      return handleSplitAction(req, res, hand, user, rawPlayerHand as SplitState, deck, action, serverSeed, clientSeed, nonce, serverSeedHash, usedCurrency);
    }

    let playerHand: Card[] = rawPlayerHand as Card[];
    let dealerHand: Card[] = JSON.parse(hand.dealerHand);
    let status: string = hand.status;
    let payout = 0;
    let finalBet = bet;

    // ── INSURANCE ────────────────────────────────────────────────────────────
    if (action === "insurance") {
      const dealerUpcard = dealerHand[0];
      if (dealerUpcard.rank !== "A") {
        res.status(400).json({ error: "Insurance only available when dealer shows an Ace" });
        return;
      }
      if (playerHand.length !== 2) {
        res.status(400).json({ error: "Insurance only available on initial deal" });
        return;
      }

      const insuranceBet = bet / 2;
      try {
        await deductBalance(user.id, insuranceBet, usedCurrency);
        await db.update(usersTable)
          .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${insuranceBet}` })
          .where(eq(usersTable.id, user.id));
      } catch (err: any) {
        res.status(400).json({ error: err.message || "Insufficient balance for insurance" });
        return;
      }

      const dealerHasBlackjack = isBlackjack(dealerHand);
      if (dealerHasBlackjack) {
        payout = insuranceBet * 3;
        status = "dealer_wins";
        finalBet = bet + insuranceBet;

        await creditBalance(user.id, payout, usedCurrency);
        await db.update(usersTable).set({
          totalBets: sql`total_bets + 1`,
          totalWon: sql`coalesce(total_won, 0) + ${payout}`,
        }).where(eq(usersTable.id, user.id));
        await db.insert(betsTable).values({
          userId: user.id, gameId: hand.gameId,
          amount: String(finalBet), payout: String(payout),
          won: payout > 0, multiplier: String(finalBet > 0 ? payout / finalBet : 0),
          serverSeed, serverSeedHash, clientSeed, nonce,
          currency: usedCurrency,
          meta: { playerHand, dealerHand, result: "insurance_win", action: "insurance", nonce, serverSeedHash },
        });

        await db.update(blackjackHandsTable).set({
          status, bet: String(finalBet),
          playerHand: JSON.stringify(playerHand),
          dealerHand: JSON.stringify(dealerHand),
          deckState: JSON.stringify(deck),
        }).where(eq(blackjackHandsTable.id, hand.id));

        const { totalBalance } = await getUserBalance(user.id);
        res.json({
          handId: hand.id, playerHand, dealerHand,
          playerTotal: handTotal(playerHand),
          dealerTotal: handTotal(dealerHand),
          status, payout, balance: totalBalance,
          currency: usedCurrency,
          serverSeedHash, clientSeed, nonce,
        });
        return;
      } else {
        await db.update(blackjackHandsTable).set({
          deckState: JSON.stringify(deck),
        }).where(eq(blackjackHandsTable.id, hand.id));

        const { totalBalance } = await getUserBalance(user.id);
        res.json({
          handId: hand.id, playerHand,
          dealerHand: [dealerHand[0], { suit: "?", rank: "?" }],
          playerTotal: handTotal(playerHand),
          dealerTotal: null,
          status: "active", payout: 0,
          insuranceLost: true, balance: totalBalance,
          currency: usedCurrency,
          serverSeedHash, clientSeed, nonce,
        });
        return;
      }
    }

    // ── HIT ───────────────────────────────────────────────────────────────────
    else if (action === "hit") {
      const newCard = deck.shift()!;
      playerHand.push(newCard);
      if (isBust(playerHand)) {
        status = "dealer_wins";
        payout = 0;
      }
    }

    // ── DOUBLE ────────────────────────────────────────────────────────────────
    else if (action === "double") {
      if (playerHand.length !== 2) {
        res.status(400).json({ error: "Can only double on initial two cards" });
        return;
      }
      try {
        await deductBalance(user.id, bet, usedCurrency);
        await db.update(usersTable)
          .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet}` })
          .where(eq(usersTable.id, user.id));
        finalBet = bet * 2;
      } catch (err: any) {
        res.status(400).json({ error: err.message || "Insufficient balance to double" });
        return;
      }

      const newCard = deck.shift()!;
      playerHand.push(newCard);
      
      // Auto-stand after double
      while (dealerShouldHit(dealerHand)) dealerHand.push(deck.shift()!);
      status = resolveHand(playerHand, dealerHand);
      payout = calcPayout(status, finalBet);
    }

    // ── STAND ─────────────────────────────────────────────────────────────────
    else if (action === "stand") {
      while (dealerShouldHit(dealerHand)) dealerHand.push(deck.shift()!);
      status = resolveHand(playerHand, dealerHand);
      payout = calcPayout(status, finalBet);
    }

    // ── SPLIT ─────────────────────────────────────────────────────────────────
    else if (action === "split") {
      if (playerHand.length !== 2 || playerHand[0].rank !== playerHand[1].rank) {
        res.status(400).json({ error: "Can only split a pair of identical ranks" });
        return;
      }
      try {
        await deductBalance(user.id, bet, usedCurrency);
        await db.update(usersTable)
          .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet}` })
          .where(eq(usersTable.id, user.id));
      } catch (err: any) {
        res.status(400).json({ error: err.message || "Insufficient balance to split" });
        return;
      }

      const splitState: SplitState = {
        isSplit: true,
        hands: [
          [playerHand[0], deck.shift()!],
          [playerHand[1], deck.shift()!],
        ],
        activeHandIndex: 0,
        bets: [bet, bet],
        statuses: ["active", "active"],
        payouts: [0, 0],
      };

      await db.update(blackjackHandsTable).set({
        playerHand: JSON.stringify(splitState),
        deckState: JSON.stringify(deck),
      }).where(eq(blackjackHandsTable.id, hand.id));

      const { totalBalance } = await getUserBalance(user.id);
      res.json({
        handId: hand.id,
        playerHand: splitState,
        dealerHand: [dealerHand[0], { suit: "?", rank: "?" }],
        status: "active",
        balance: totalBalance,
        currency: usedCurrency,
        serverSeedHash, clientSeed, nonce,
      });
      return;
    }

    let finalBalance: number | undefined;
    if (status !== "active") {
      finalBalance = await creditBalance(user.id, payout, usedCurrency);
      await db.update(usersTable).set({
        totalBets: sql`total_bets + 1`,
        totalWon: sql`coalesce(total_won, 0) + ${payout}`,
      }).where(eq(usersTable.id, user.id));

      await db.insert(betsTable).values({
        userId: user.id, gameId: hand.gameId,
        amount: String(finalBet), payout: String(payout),
        won: payout > 0, multiplier: String(finalBet > 0 ? payout / finalBet : 0),
        serverSeed, serverSeedHash, clientSeed, nonce,
        currency: usedCurrency,
        meta: { playerHand, dealerHand, result: status, action, nonce, serverSeedHash },
      });
    }

    await db.update(blackjackHandsTable).set({
      status, bet: String(finalBet),
      playerHand: JSON.stringify(playerHand),
      dealerHand: JSON.stringify(dealerHand),
      deckState: JSON.stringify(deck),
    }).where(eq(blackjackHandsTable.id, hand.id));

    const { totalBalance } = await getUserBalance(user.id);
    res.json({
      handId: hand.id, playerHand,
      dealerHand: status === "active" ? [dealerHand[0], { suit: "?", rank: "?" }] : dealerHand,
      playerTotal: handTotal(playerHand),
      dealerTotal: status !== "active" ? handTotal(dealerHand) : null,
      status, payout, balance: finalBalance ?? totalBalance,
      currency: usedCurrency,
      serverSeedHash, clientSeed, nonce,
    });

  } catch (err) {
    req.log.error({ err }, "Blackjack action error");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function handleSplitAction(req: any, res: any, hand: any, user: any, state: SplitState, deck: Card[], action: string, serverSeed: string, clientSeed: string, nonce: number, serverSeedHash: string, currency: string) {
  const activeIdx = state.activeHandIndex;
  const currentHand = state.hands[activeIdx];
  const bet = state.bets[activeIdx];

  if (action === "hit") {
    currentHand.push(deck.shift()!);
    if (isBust(currentHand)) {
      state.statuses[activeIdx] = "dealer_wins";
      state.payouts[activeIdx] = 0;
      // Move to next hand or finish
      if (activeIdx === 0 && state.statuses[1] === "active") {
        state.activeHandIndex = 1;
      } else {
        await finishSplitHand(res, hand, user, state, JSON.parse(hand.dealerHand), deck, serverSeed, clientSeed, nonce, serverSeedHash, currency);
        return;
      }
    }
  } else if (action === "stand") {
    if (activeIdx === 0 && state.statuses[1] === "active") {
      state.activeHandIndex = 1;
    } else {
      await finishSplitHand(res, hand, user, state, JSON.parse(hand.dealerHand), deck, serverSeed, clientSeed, nonce, serverSeedHash, currency);
      return;
    }
  } else if (action === "double") {
    if (currentHand.length !== 2) return res.status(400).json({ error: "Can only double on initial two cards" });
    try {
      await deductBalance(user.id, bet, currency);
      state.bets[activeIdx] *= 2;
    } catch (err: any) { return res.status(400).json({ error: err.message }); }
    
    currentHand.push(deck.shift()!);
    if (isBust(currentHand)) {
      state.statuses[activeIdx] = "dealer_wins";
      state.payouts[activeIdx] = 0;
    } else {
      // Auto-stand after double
    }
    
    if (activeIdx === 0 && state.statuses[1] === "active") {
      state.activeHandIndex = 1;
    } else {
      await finishSplitHand(res, hand, user, state, JSON.parse(hand.dealerHand), deck, serverSeed, clientSeed, nonce, serverSeedHash, currency);
      return;
    }
  }

  await db.update(blackjackHandsTable).set({
    playerHand: JSON.stringify(state),
    deckState: JSON.stringify(deck),
  }).where(eq(blackjackHandsTable.id, hand.id));

  const { totalBalance } = await getUserBalance(user.id);
  res.json({
    handId: hand.id, playerHand: state,
    dealerHand: [{ suit: "?", rank: "?" }, { suit: "?", rank: "?" }],
    status: "active", payout: 0, balance: totalBalance,
    currency,
    serverSeedHash, clientSeed, nonce,
  });
}

async function finishSplitHand(res: any, hand: any, user: any, state: SplitState, dealerHand: Card[], deck: Card[], serverSeed: string, clientSeed: string, nonce: number, serverSeedHash: string, currency: string) {
  // Only play dealer if at least one hand didn't bust
  const anyActive = state.statuses.some(s => s === "active");
  if (anyActive) {
    while (dealerShouldHit(dealerHand)) dealerHand.push(deck.shift()!);
    for (let i = 0; i < 2; i++) {
      if (state.statuses[i] === "active") {
        state.statuses[i] = resolveHand(state.hands[i], dealerHand);
        state.payouts[i] = calcPayout(state.statuses[i], state.bets[i]);
      }
    }
  }

  const totalPayout = state.payouts[0] + state.payouts[1];
  const totalBet = state.bets[0] + state.bets[1];
  
  await finalizeBlackjackHand(hand, user, state, dealerHand, totalPayout, currency);
  
  const finalBalance = await creditBalance(user.id, totalPayout, currency);
  await db.update(usersTable).set({
    totalBets: sql`total_bets + 1`,
    totalWon: sql`coalesce(total_won, 0) + ${totalPayout}`,
  }).where(eq(usersTable.id, user.id));

  await db.insert(betsTable).values({
    userId: user.id, gameId: hand.gameId,
    amount: String(totalBet), payout: String(totalPayout),
    won: totalPayout > 0, multiplier: String(totalBet > 0 ? totalPayout / totalBet : 0),
    serverSeed, serverSeedHash, clientSeed, nonce,
    currency,
    meta: { playerHand: state, dealerHand, result: "split_complete", nonce, serverSeedHash },
  });

  res.json({
    handId: hand.id, playerHand: state, dealerHand,
    status: "completed", payout: totalPayout, balance: finalBalance,
    currency,
    serverSeedHash, clientSeed, nonce,
  });
}

async function finalizeBlackjackHand(hand: any, user: any, playerHand: any, dealerHand: Card[], payout: number, currency: string) {
  await db.update(blackjackHandsTable).set({
    status: "completed",
    playerHand: JSON.stringify(playerHand),
    dealerHand: JSON.stringify(dealerHand),
  }).where(eq(blackjackHandsTable.id, hand.id));
}
