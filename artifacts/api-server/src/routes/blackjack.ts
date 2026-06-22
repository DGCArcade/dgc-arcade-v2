import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, blackjackHandsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export const blackjackRouter = Router();

// ─── Card utils ───────────────────────────────────────────────────────────────
type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Card = { suit: Suit; rank: Rank };

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const NUM_DECKS = 6; // Standard casino 6-deck shoe

/** Build a multi-deck shoe */
function buildShoe(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < NUM_DECKS; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ suit, rank });
  return deck;
}

/** Cryptographically seeded Fisher-Yates shuffle */
function shuffleShoe(seed: string, deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const h = createHash("sha256").update(`${seed}:${i}`).digest("hex");
    const j = parseInt(h.slice(0, 8), 16) % (i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
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

/** Soft hand = has an ace counting as 11 */
function isSoftHand(hand: Card[]): boolean {
  let total = 0, aces = 0;
  for (const c of hand) {
    const v = cardValue(c.rank);
    if (v === 11) aces++;
    total += v;
  }
  // Soft if reducing aces still keeps total <= 21 but at least one ace counts as 11
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  // Re-check: if original total (before reduction) had an ace as 11 and total <= 21
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

/**
 * Dealer hits on soft 17 — standard Vegas Strip / most US casino rule
 * House edge: ~0.5% with basic strategy
 */
function dealerShouldHit(hand: Card[]): boolean {
  const total = handTotal(hand);
  if (total < 17) return true;
  if (total === 17 && isSoftHand(hand)) return true; // Hit soft 17
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

// ─── POST /api/blackjack/deal ─────────────────────────────────────────────────
blackjackRouter.post("/deal", requireAuth, async (req, res) => {
  const { gameId, amount } = req.body;
  if (!gameId || !amount || amount <= 0) {
    res.status(400).json({ error: "gameId and amount required" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
    if (!game || !game.active) { res.status(404).json({ error: "Game not found" }); return; }

    // Validate bet limits
    const minBet = parseFloat(String(game.minBet ?? "1"));
    const maxBet = parseFloat(String(game.maxBet ?? "10000"));
    if (amount < minBet) { res.status(400).json({ error: `Minimum bet is $${minBet}` }); return; }
    if (amount > maxBet) { res.status(400).json({ error: `Maximum bet is $${maxBet}` }); return; }

    const { totalBalance } = await getUserBalance(user.id);
    if (totalBalance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Auto-resolve any stale active hands (cleanup so player can always start fresh)
    await db.update(blackjackHandsTable)
      .set({ status: "dealer_wins" })
      .where(and(
        eq(blackjackHandsTable.userId, req.user!.userId),
        eq(blackjackHandsTable.status, "active")
      ));

    // Deduct bet
    let currentBalance: number;
    try {
      currentBalance = await deductBalance(user.id, amount);
      await db.update(usersTable)
        .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${amount}` })
        .where(eq(usersTable.id, user.id));
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Insufficient balance" });
      return;
    }

    // Build and shuffle 6-deck shoe
    const serverSeed = uuidv4().replace(/-/g, "");
    const shoe = shuffleShoe(serverSeed, buildShoe());

    // Deal: player[0], dealer[0], player[1], dealer[1] — standard deal order
    const playerHand: Card[] = [shoe[0], shoe[2]];
    const dealerHand: Card[] = [shoe[1], shoe[3]];
    const remainingDeck = shoe.slice(4);

    const dealerUpcard = dealerHand[0];
    const insuranceEligible = dealerUpcard.rank === "A";

    let status = "active";
    let payout = 0;

    // Immediate resolution checks
    const playerBJ = isBlackjack(playerHand);
    const dealerBJ = isBlackjack(dealerHand);

    if (playerBJ && dealerBJ) {
      status = "push";
      payout = amount; // Push — return bet
    } else if (playerBJ) {
      status = "player_blackjack";
      payout = amount * 2.5; // 3:2 payout
    } else if (dealerBJ) {
      status = "dealer_wins";
      payout = 0;
    }

    const [hand] = await db.insert(blackjackHandsTable).values({
      userId: user.id,
      gameId: game.id,
      bet: String(amount),
      serverSeed,
      deckState: JSON.stringify(remainingDeck),
      playerHand: JSON.stringify(playerHand),
      dealerHand: JSON.stringify(dealerHand),
      status,
    }).returning();

    // Settle immediately if not active
    if (status !== "active") {
      currentBalance = await creditBalance(user.id, payout);
      await db.update(usersTable).set({
        totalBets: sql`total_bets + 1`,
        totalWon: sql`coalesce(total_won, 0) + ${payout}`,
      }).where(eq(usersTable.id, user.id));
      await db.insert(betsTable).values({
        userId: user.id, gameId: game.id,
        amount: String(amount), payout: String(payout),
        won: payout > 0,
        multiplier: String(amount > 0 ? payout / amount : 0),
        serverSeed, clientSeed: "blackjack",
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
      balance: currentBalance,
      insuranceEligible: status === "active" ? insuranceEligible : false,
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack deal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/blackjack/action ───────────────────────────────────────────────
// action: "hit" | "stand" | "double" | "split" | "insurance"
blackjackRouter.post("/action", requireAuth, async (req, res) => {
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

    let playerHand: Card[] = JSON.parse(hand.playerHand);
    let dealerHand: Card[] = JSON.parse(hand.dealerHand);
    let deck: Card[] = JSON.parse(hand.deckState);
    const bet = parseFloat(hand.bet);

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
        await deductBalance(user.id, insuranceBet);
        await db.update(usersTable)
          .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${insuranceBet}` })
          .where(eq(usersTable.id, user.id));
      } catch (err: any) {
        res.status(400).json({ error: err.message || "Insufficient balance for insurance" });
        return;
      }

      const dealerHasBlackjack = isBlackjack(dealerHand);
      if (dealerHasBlackjack) {
        // Insurance pays 2:1 — player wins insurance side bet but loses main bet
        payout = insuranceBet * 3; // Return insurance + 2:1 profit
        status = "dealer_wins";
        finalBet = bet + insuranceBet;

        await creditBalance(user.id, payout);
        await db.update(usersTable).set({
          totalBets: sql`total_bets + 1`,
          totalWon: sql`coalesce(total_won, 0) + ${payout}`,
        }).where(eq(usersTable.id, user.id));
        await db.insert(betsTable).values({
          userId: user.id, gameId: hand.gameId,
          amount: String(finalBet), payout: String(payout),
          won: payout > 0, multiplier: String(finalBet > 0 ? payout / finalBet : 0),
          serverSeed: hand.serverSeed, clientSeed: "blackjack",
          meta: { playerHand, dealerHand, result: "insurance_win", action: "insurance" },
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
        });
        return;
      } else {
        // Insurance loses, game continues normally
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
        });
        return;
      }
    }

    // ── HIT ───────────────────────────────────────────────────────────────────
    else if (action === "hit") {
      const newCard = deck.shift()!;
      playerHand = [...playerHand, newCard];

      if (isBust(playerHand)) {
        status = "dealer_wins";
      } else if (handTotal(playerHand) === 21) {
        // Auto-stand at 21 — play out dealer
        while (dealerShouldHit(dealerHand)) {
          dealerHand = [...dealerHand, deck.shift()!];
        }
        status = resolveHand(playerHand, dealerHand);
      }
      // else status stays "active" — player can keep hitting
    }

    // ── STAND ─────────────────────────────────────────────────────────────────
    else if (action === "stand") {
      while (dealerShouldHit(dealerHand)) {
        dealerHand = [...dealerHand, deck.shift()!];
      }
      status = resolveHand(playerHand, dealerHand);
    }

    // ── DOUBLE DOWN ───────────────────────────────────────────────────────────
    else if (action === "double") {
      if (playerHand.length !== 2) {
        res.status(400).json({ error: "Double down only allowed on first two cards" });
        return;
      }
      try {
        await deductBalance(user.id, bet);
        await db.update(usersTable)
          .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet}` })
          .where(eq(usersTable.id, user.id));
      } catch (err: any) {
        res.status(400).json({ error: err.message || "Insufficient balance for double down" });
        return;
      }
      finalBet = bet * 2;
      // Exactly one more card
      playerHand = [...playerHand, deck.shift()!];
      // Dealer plays out
      while (dealerShouldHit(dealerHand)) {
        dealerHand = [...dealerHand, deck.shift()!];
      }
      status = resolveHand(playerHand, dealerHand);
    }

    // ── SPLIT ─────────────────────────────────────────────────────────────────
    else if (action === "split") {
      if (playerHand.length !== 2 || playerHand[0].rank !== playerHand[1].rank) {
        res.status(400).json({ error: "Cannot split these cards" });
        return;
      }
      try {
        await deductBalance(user.id, bet);
        await db.update(usersTable)
          .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet}` })
          .where(eq(usersTable.id, user.id));
      } catch (err: any) {
        res.status(400).json({ error: err.message || "Insufficient balance for split" });
        return;
      }
      finalBet = bet * 2;
      // Keep first card, deal new second card
      playerHand = [playerHand[0], deck.shift()!];

      // Split aces: one card each, auto-stand (standard rule)
      if (playerHand[0].rank === "A") {
        while (dealerShouldHit(dealerHand)) {
          dealerHand = [...dealerHand, deck.shift()!];
        }
        status = resolveHand(playerHand, dealerHand);
      }
      // Other splits: continue playing
    }

    // ── SETTLE COMPLETED HANDS ────────────────────────────────────────────────
    const isComplete = status !== "active";

    if (isComplete) {
      if (status === "player_wins") payout = finalBet * 2;
      else if (status === "player_blackjack") payout = finalBet * 2.5;
      else if (status === "push") payout = finalBet;
      else payout = 0;

      await creditBalance(user.id, payout);
      await db.update(usersTable).set({
        totalBets: sql`total_bets + 1`,
        totalWon: sql`coalesce(total_won, 0) + ${payout}`,
      }).where(eq(usersTable.id, user.id));
      await db.insert(betsTable).values({
        userId: user.id, gameId: hand.gameId,
        amount: String(finalBet), payout: String(payout),
        won: payout > 0 && status !== "push",
        multiplier: String(finalBet > 0 ? payout / finalBet : 0),
        serverSeed: hand.serverSeed, clientSeed: "blackjack",
        meta: { playerHand, dealerHand, result: status, action },
      });
    }

    await db.update(blackjackHandsTable).set({
      playerHand: JSON.stringify(playerHand),
      dealerHand: JSON.stringify(dealerHand),
      deckState: JSON.stringify(deck),
      status,
      bet: String(finalBet),
    }).where(eq(blackjackHandsTable.id, hand.id));

    const { totalBalance } = await getUserBalance(user.id);

    res.json({
      handId: hand.id,
      playerHand,
      dealerHand: isComplete ? dealerHand : [dealerHand[0], { suit: "?", rank: "?" }],
      playerTotal: handTotal(playerHand),
      dealerTotal: isComplete ? handTotal(dealerHand) : null,
      status,
      payout,
      balance: totalBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack action error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/blackjack/current ───────────────────────────────────────────────
blackjackRouter.get("/current", requireAuth, async (req, res) => {
  try {
    const [hand] = await db.select().from(blackjackHandsTable)
      .where(and(
        eq(blackjackHandsTable.userId, req.user!.userId),
        eq(blackjackHandsTable.status, "active")
      )).limit(1);

    if (!hand) { res.json(null); return; }

    const playerHand: Card[] = JSON.parse(hand.playerHand);
    const dealerHand: Card[] = JSON.parse(hand.dealerHand);
    const dealerUpcard = dealerHand[0];

    res.json({
      handId: hand.id,
      playerHand,
      dealerHand: [dealerUpcard, { suit: "?", rank: "?" }],
      playerTotal: handTotal(playerHand),
      status: hand.status,
      bet: parseFloat(hand.bet),
      insuranceEligible: dealerUpcard.rank === "A" && playerHand.length === 2,
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack current error");
    res.status(500).json({ error: "Internal server error" });
  }
});
