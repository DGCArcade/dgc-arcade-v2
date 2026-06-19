import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, blackjackHandsTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export const blackjackRouter = Router();

// ─── Card utils ───────────────────────────────────────────────────────────────

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Card = { suit: Suit; rank: Rank };

function buildDeck(): Card[] {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const ranks: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck: Card[] = [];
  for (const suit of suits) for (const rank of ranks) deck.push({ suit, rank });
  return deck;
}

function shuffleDeck(seed: string, deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const combined = `${seed}:${i}`;
    const h = createHash("sha256").update(combined).digest("hex");
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
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    const v = cardValue(c.rank);
    if (v === 11) aces++;
    total += v;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBust(hand: Card[]): boolean { return handTotal(hand) > 21; }
function isBlackjack(hand: Card[]): boolean { return hand.length === 2 && handTotal(hand) === 21; }

function resolveHand(playerHand: Card[], dealerHand: Card[]) {
  const pt = handTotal(playerHand);
  const dt = handTotal(dealerHand);
  if (isBust(playerHand)) return "dealer_wins";
  if (isBlackjack(playerHand) && !isBlackjack(dealerHand)) return "player_blackjack";
  if (isBust(dealerHand)) return "player_wins";
  if (pt > dt) return "player_wins";
  if (dt > pt) return "dealer_wins";
  return "push";
}

// POST /api/blackjack/deal
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

    const { totalBalance: bjTotalBalance } = await getUserBalance(user.id);
    if (bjTotalBalance < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    // Check no active hand
    const existing = await db.select().from(blackjackHandsTable)
      .where(and(
        eq(blackjackHandsTable.userId, req.user!.userId),
        eq(blackjackHandsTable.status, "active")
      )).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "You have an active hand. Finish it first.", handId: existing[0].id });
      return;
    }

    // Standardized balance deduction (crypto-first, live prices)
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

    const serverSeed = uuidv4().replace(/-/g, "");
    const deck = shuffleDeck(serverSeed, buildDeck());

    const playerHand: Card[] = [deck[0], deck[2]];
    const dealerHand: Card[] = [deck[1], deck[3]];
    const remainingDeck = deck.slice(4);

    let status = "active";
    if (isBlackjack(playerHand)) {
      status = "player_blackjack";
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

    if (status === "player_blackjack") {
      const payout = amount * 2.5;
      currentBalance = await creditBalance(user.id, payout);
      await db.update(usersTable).set({
        totalBets: sql`total_bets + 1`,
        totalWon: sql`coalesce(total_won, 0) + ${payout}`,
      }).where(eq(usersTable.id, user.id));
      await db.insert(betsTable).values({
        userId: user.id, gameId: game.id,
        amount: String(amount), payout: String(payout),
        won: true, multiplier: "2.5",
        serverSeed, clientSeed: "blackjack",
        meta: { playerHand, dealerHand, result: "player_blackjack" },
      });
    }

    res.json({
      handId: hand.id,
      playerHand,
      dealerHand: status === "active" ? [dealerHand[0], { suit: "?", rank: "?" }] : dealerHand,
      playerTotal: handTotal(playerHand),
      status,
      bet: amount,
      balance: currentBalance,
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack deal error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/blackjack/action
blackjackRouter.post("/action", requireAuth, async (req, res) => {
  const { handId, action } = req.body; // action: "hit"|"stand"|"double"|"split"
  if (!handId || !action) {
    res.status(400).json({ error: "handId and action required" });
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

    if (action === "hit" || action === "double") {
      const newCard = deck.shift()!;
      playerHand = [...playerHand, newCard];

      if (action === "double") {
        try {
          await deductBalance(user.id, bet);
          await db.update(usersTable)
            .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet}` })
            .where(eq(usersTable.id, user.id));
        } catch (err: any) {
          res.status(400).json({ error: err.message || "Insufficient balance for double" });
          return;
        }
      }
    } else if (action === "split") {
      // Basic split implementation: For now, we'll just handle it by treating it as a new hand or a simplified split.
      // Full split logic with multiple hands requires schema changes or complex state.
      // To keep it simple but functional: split current hand, add new bet, and give one card to current hand.
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
      
      // Keep the first card, replace the second card with a new one
      playerHand = [playerHand[0], deck.shift()!];
    }

    let status = hand.status;
    let payout = 0;

    if (action === "hit" && isBust(playerHand)) {
      status = "dealer_wins";
    } else if (action === "stand" || action === "double" || isBust(playerHand)) {
      while (handTotal(dealerHand) < 17) {
        const newCard = deck.shift()!;
        dealerHand = [...dealerHand, newCard];
      }
      status = resolveHand(playerHand, dealerHand);
    }

    const isComplete = status !== "active";
    const finalBet = (action === "double" || action === "split") ? bet * 2 : bet;

    if (isComplete) {
      if (status === "player_wins") payout = finalBet * 2;
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
        won: payout > 0 && status !== "push", multiplier: String(payout / finalBet),
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

// GET /api/blackjack/current
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

    res.json({
      handId: hand.id,
      playerHand,
      dealerHand: [dealerHand[0], { suit: "?", rank: "?" }],
      playerTotal: handTotal(playerHand),
      status: hand.status,
      bet: parseFloat(hand.bet),
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack current error");
    res.status(500).json({ error: "Internal server error" });
  }
});
