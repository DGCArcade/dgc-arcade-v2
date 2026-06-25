import { Router } from "express";
import { db, usersTable, gamesTable, betsTable, blackjackHandsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getUserBalance, deductBalance, creditBalance } from "../lib/balance-service.js";
import { v4 as uuidv4 } from "uuid";
import { createHash, createHmac } from "crypto";

export const blackjackRouter = Router();

// ─── Card utils ───────────────────────────────────────────────────────────────
type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Card = { suit: Suit; rank: Rank };

/**
 * Split state stored in the `playerHand` JSON field when a split occurs.
 * hands[0] = first split hand, hands[1] = second split hand
 * activeHandIndex = 0 or 1
 */
interface SplitState {
  isSplit: true;
  hands: [Card[], Card[]];
  activeHandIndex: 0 | 1;
  bets: [number, number];
  statuses: [string, string];
  payouts: [number, number];
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

/** HMAC-SHA256 seeded Fisher-Yates shuffle — provably fair */
function shuffleShoe(serverSeed: string, clientSeed: string, nonce: number, deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    // Standard provably fair outcome generation for each swap
    const message = `${clientSeed}:${nonce}:${i}:blackjack`;
    const h = createHmac("sha256", serverSeed)
      .update(message)
      .digest("hex");
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
blackjackRouter.post("/deal", requireAuth, async (req, res) => {
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

    // Auto-resolve stale active hands
    await db.update(blackjackHandsTable)
      .set({ status: "dealer_wins" })
      .where(and(
        eq(blackjackHandsTable.userId, req.user!.userId),
        eq(blackjackHandsTable.status, "active")
      ));

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

    // Provably fair: server seed + client seed + nonce
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
    }).returning();

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
        serverSeed, serverSeedHash, clientSeed, nonce,
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
      insuranceEligible: status === "active" ? insuranceEligible : false,
      // Provably fair info (pre-reveal)
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

    // Unpack seed info (Legacy support: check if serverSeed contains pipes)
    let serverSeed: string;
    let clientSeed: string;
    let nonce: number;

    if (hand.serverSeed.includes("|")) {
      const seedParts = hand.serverSeed.split("|");
      serverSeed = seedParts[0];
      clientSeed = seedParts[1] || "default";
      nonce = parseInt(seedParts[2] || "1");
    } else {
      serverSeed = hand.serverSeed;
      clientSeed = hand.clientSeed || "default";
      nonce = hand.nonce || 1;
    }
    const serverSeedHash = hashServerSeed(serverSeed);

    let deck: Card[] = JSON.parse(hand.deckState);
    const bet = parseFloat(hand.bet);

    // ── Check if this is a split hand ────────────────────────────────────────
    let rawPlayerHand: any;
    try { rawPlayerHand = JSON.parse(hand.playerHand); } catch { rawPlayerHand = []; }

    const isSplitHand = rawPlayerHand?.isSplit === true;

    if (isSplitHand) {
      return handleSplitAction(req, res, hand, user, rawPlayerHand as SplitState, deck, action, serverSeed, clientSeed, nonce, serverSeedHash);
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
        payout = insuranceBet * 3;
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
          serverSeed, serverSeedHash, clientSeed, nonce,
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
          serverSeedHash, clientSeed, nonce,
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
        while (dealerShouldHit(dealerHand)) {
          dealerHand = [...dealerHand, deck.shift()!];
        }
        status = resolveHand(playerHand, dealerHand);
      }
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
      playerHand = [...playerHand, deck.shift()!];
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

      // Build two hands: each gets the original card + one new card
      const card1 = playerHand[0];
      const card2 = playerHand[1];
      const newCard1 = deck.shift()!; // dealt to hand 1
      const newCard2 = deck.shift()!; // dealt to hand 2

      const hand1: Card[] = [card1, newCard1];
      const hand2: Card[] = [card2, newCard2];

      // For split aces: auto-stand both hands (standard rule)
      const isAceSplit = card1.rank === "A";
      let hand1Status = "active";
      let hand2Status = "active";

      if (isAceSplit) {
        // Play out dealer once and resolve both
        while (dealerShouldHit(dealerHand)) {
          dealerHand = [...dealerHand, deck.shift()!];
        }
        hand1Status = resolveHand(hand1, dealerHand);
        hand2Status = resolveHand(hand2, dealerHand);
      }

      const splitState: SplitState = {
        isSplit: true,
        hands: [hand1, hand2],
        activeHandIndex: isAceSplit ? 0 : 0,
        bets: [bet, bet],
        statuses: [hand1Status as any, hand2Status as any],
        payouts: [0, 0],
      };

      // Determine overall hand status
      const overallStatus = (hand1Status !== "active" && hand2Status !== "active") ? "split_complete" : "active";

      // If ace split, settle immediately
      if (isAceSplit) {
        const p1 = calcPayout(hand1Status, bet);
        const p2 = calcPayout(hand2Status, bet);
        splitState.payouts = [p1, p2];
        const totalPayout = p1 + p2;
        const totalBet = bet * 2;

        await creditBalance(user.id, totalPayout);
        await db.update(usersTable).set({
          totalBets: sql`total_bets + 1`,
          totalWon: sql`coalesce(total_won, 0) + ${totalPayout}`,
        }).where(eq(usersTable.id, user.id));
        await db.insert(betsTable).values({
          userId: user.id, gameId: hand.gameId,
          amount: String(totalBet), payout: String(totalPayout),
          won: totalPayout > totalBet,
          multiplier: String(totalBet > 0 ? totalPayout / totalBet : 0),
          serverSeed, serverSeedHash, clientSeed, nonce,
          meta: { splitHands: [hand1, hand2], dealerHand, hand1Status, hand2Status, action: "split", nonce, serverSeedHash },
        });

        await db.update(blackjackHandsTable).set({
          playerHand: JSON.stringify(splitState),
          dealerHand: JSON.stringify(dealerHand),
          deckState: JSON.stringify(deck),
          status: "split_complete",
          bet: String(totalBet),
        }).where(eq(blackjackHandsTable.id, hand.id));

        const { totalBalance } = await getUserBalance(user.id);
        res.json({
          handId: hand.id,
          isSplit: true,
          splitHands: [hand1, hand2],
          activeHandIndex: 0,
          hand1Total: handTotal(hand1),
          hand2Total: handTotal(hand2),
          dealerHand,
          dealerTotal: handTotal(dealerHand),
          hand1Status,
          hand2Status,
          status: "split_complete",
          payout: totalPayout,
          balance: totalBalance,
          serverSeedHash, clientSeed, nonce,
        });
        return;
      }

      // Non-ace split: save split state, player plays hand 1 first
      await db.update(blackjackHandsTable).set({
        playerHand: JSON.stringify(splitState),
        dealerHand: JSON.stringify(dealerHand),
        deckState: JSON.stringify(deck),
        status: "active",
        bet: String(bet * 2),
      }).where(eq(blackjackHandsTable.id, hand.id));

      const { totalBalance } = await getUserBalance(user.id);
      res.json({
        handId: hand.id,
        isSplit: true,
        splitHands: [hand1, hand2],
        activeHandIndex: 0,
        hand1Total: handTotal(hand1),
        hand2Total: handTotal(hand2),
        dealerHand: [dealerHand[0], { suit: "?", rank: "?" }],
        dealerTotal: null,
        hand1Status: "active",
        hand2Status: "active",
        status: "active",
        payout: 0,
        balance: totalBalance,
        serverSeedHash, clientSeed, nonce,
      });
      return;
    }

    // ── SETTLE COMPLETED HANDS ────────────────────────────────────────────────
    const isComplete = status !== "active";

    if (isComplete) {
      payout = calcPayout(status, finalBet);

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
        serverSeed, serverSeedHash, clientSeed, nonce,
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
      serverSeedHash, clientSeed, nonce,
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack action error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Handle actions on a split hand ──────────────────────────────────────────
async function handleSplitAction(
  req: any, res: any,
  hand: any, user: any,
  splitState: SplitState,
  deck: Card[],
  action: string,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  serverSeedHash: string,
) {
  const activeIdx = splitState.activeHandIndex;
  let activeHand = [...splitState.hands[activeIdx]];
  let dealerHand: Card[] = JSON.parse(hand.dealerHand);
  const bet = splitState.bets[activeIdx];

  if (action === "hit") {
    const newCard = deck.shift()!;
    activeHand = [...activeHand, newCard];

    if (isBust(activeHand)) {
      splitState.statuses[activeIdx] = "dealer_wins";
    } else if (handTotal(activeHand) === 21) {
      // Auto-advance to next hand or play dealer
      splitState.statuses[activeIdx] = "stand_pending";
    }
    splitState.hands[activeIdx] = activeHand;
  } else if (action === "stand" || splitState.statuses[activeIdx] === "stand_pending") {
    splitState.statuses[activeIdx] = "stood";
  } else if (action === "double") {
    if (activeHand.length !== 2) {
      res.status(400).json({ error: "Double only on first two cards" });
      return;
    }
    try {
      await deductBalance(user.id, bet);
      await db.update(usersTable)
        .set({ totalWageredAmount: sql`coalesce(total_wagered_amount, 0) + ${bet}` })
        .where(eq(usersTable.id, user.id));
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Insufficient balance for double" });
      return;
    }
    splitState.bets[activeIdx] = bet * 2;
    activeHand = [...activeHand, deck.shift()!];
    splitState.hands[activeIdx] = activeHand;
    splitState.statuses[activeIdx] = "stood";
  }

  // Advance to next hand if current hand is done
  const currentStatus = splitState.statuses[activeIdx];
  const handDone = currentStatus === "dealer_wins" || currentStatus === "stood" || currentStatus === "stand_pending";

  if (handDone && activeIdx === 0 && splitState.statuses[1] === "active") {
    splitState.activeHandIndex = 1;
    splitState.hands[activeIdx] = activeHand;

    await db.update(blackjackHandsTable).set({
      playerHand: JSON.stringify(splitState),
      deckState: JSON.stringify(deck),
    }).where(eq(blackjackHandsTable.id, hand.id));

    const { totalBalance } = await getUserBalance(user.id);
    res.json({
      handId: hand.id,
      isSplit: true,
      splitHands: splitState.hands,
      activeHandIndex: 1,
      hand1Total: handTotal(splitState.hands[0]),
      hand2Total: handTotal(splitState.hands[1]),
      dealerHand: [dealerHand[0], { suit: "?", rank: "?" }],
      dealerTotal: null,
      hand1Status: splitState.statuses[0],
      hand2Status: "active",
      status: "active",
      payout: 0,
      balance: totalBalance,
      serverSeedHash, clientSeed, nonce,
    });
    return;
  }

  // Both hands done — play dealer and settle
  if (handDone && (activeIdx === 1 || splitState.statuses[1] !== "active")) {
    splitState.hands[activeIdx] = activeHand;

    // Play out dealer
    while (dealerShouldHit(dealerHand)) {
      dealerHand = [...dealerHand, deck.shift()!];
    }

    // Resolve each hand
    // Only hands already marked "dealer_wins" (busted player) skip resolution.
    // "stood" and "stand_pending" (hit-to-21 auto-stand) both need resolveHand.
    const finalStatuses: [string, string] = ["dealer_wins", "dealer_wins"];
    for (let i = 0; i < 2; i++) {
      const hs = splitState.statuses[i];
      if (hs === "dealer_wins") {
        // Player busted — dealer wins regardless
        finalStatuses[i] = "dealer_wins";
      } else {
        // "stood" or "stand_pending" — compare totals properly
        finalStatuses[i] = resolveHand(splitState.hands[i], dealerHand);
      }
    }

    const p1 = calcPayout(finalStatuses[0], splitState.bets[0]);
    const p2 = calcPayout(finalStatuses[1], splitState.bets[1]);
    const totalPayout = p1 + p2;
    const totalBet = splitState.bets[0] + splitState.bets[1];

    splitState.statuses = finalStatuses;
    splitState.payouts = [p1, p2];

    await creditBalance(user.id, totalPayout);
    await db.update(usersTable).set({
      totalBets: sql`total_bets + 1`,
      totalWon: sql`coalesce(total_won, 0) + ${totalPayout}`,
    }).where(eq(usersTable.id, user.id));
    await db.insert(betsTable).values({
      userId: user.id, gameId: hand.gameId,
      amount: String(totalBet), payout: String(totalPayout),
      won: totalPayout > totalBet,
      multiplier: String(totalBet > 0 ? totalPayout / totalBet : 0),
      serverSeed, serverSeedHash, clientSeed, nonce,
      meta: { splitHands: splitState.hands, dealerHand, finalStatuses, action: "split_complete" },
    });

    await db.update(blackjackHandsTable).set({
      playerHand: JSON.stringify(splitState),
      dealerHand: JSON.stringify(dealerHand),
      deckState: JSON.stringify(deck),
      status: "split_complete",
      bet: String(totalBet),
    }).where(eq(blackjackHandsTable.id, hand.id));

    const { totalBalance } = await getUserBalance(user.id);
    res.json({
      handId: hand.id,
      isSplit: true,
      splitHands: splitState.hands,
      activeHandIndex: activeIdx,
      hand1Total: handTotal(splitState.hands[0]),
      hand2Total: handTotal(splitState.hands[1]),
      dealerHand,
      dealerTotal: handTotal(dealerHand),
      hand1Status: finalStatuses[0],
      hand2Status: finalStatuses[1],
      status: "split_complete",
      payout: totalPayout,
      balance: totalBalance,
      serverSeedHash, clientSeed, nonce,
    });
    return;
  }

  // Still playing current hand
  splitState.hands[activeIdx] = activeHand;

  await db.update(blackjackHandsTable).set({
    playerHand: JSON.stringify(splitState),
    deckState: JSON.stringify(deck),
  }).where(eq(blackjackHandsTable.id, hand.id));

  const { totalBalance } = await getUserBalance(user.id);
  res.json({
    handId: hand.id,
    isSplit: true,
    splitHands: splitState.hands,
    activeHandIndex: activeIdx,
    hand1Total: handTotal(splitState.hands[0]),
    hand2Total: handTotal(splitState.hands[1]),
    dealerHand: [dealerHand[0], { suit: "?", rank: "?" }],
    dealerTotal: null,
    hand1Status: splitState.statuses[0],
    hand2Status: splitState.statuses[1],
    status: "active",
    payout: 0,
    balance: totalBalance,
    serverSeedHash, clientSeed, nonce,
  });
}

// ─── GET /api/blackjack/current ───────────────────────────────────────────────
blackjackRouter.get("/current", requireAuth, async (req, res) => {
  try {
    const [hand] = await db.select().from(blackjackHandsTable)
      .where(and(
        eq(blackjackHandsTable.userId, req.user!.userId),
        eq(blackjackHandsTable.status, "active")
      )).limit(1);

    if (!hand) { res.json(null); return; }

    // Legacy support
    let serverSeed: string;
    let clientSeed: string;
    let nonce: number;

    if (hand.serverSeed.includes("|")) {
      const seedParts = hand.serverSeed.split("|");
      serverSeed = seedParts[0];
      clientSeed = seedParts[1] || "default";
      nonce = parseInt(seedParts[2] || "1");
    } else {
      serverSeed = hand.serverSeed;
      clientSeed = hand.clientSeed || "default";
      nonce = hand.nonce || 1;
    }
    const serverSeedHash = hashServerSeed(serverSeed);

    let rawPlayerHand: any;
    try { rawPlayerHand = JSON.parse(hand.playerHand); } catch { rawPlayerHand = []; }

    const isSplitHand = rawPlayerHand?.isSplit === true;
    const dealerHand: Card[] = JSON.parse(hand.dealerHand);
    const dealerUpcard = dealerHand[0];

    if (isSplitHand) {
      const splitState = rawPlayerHand as SplitState;
      res.json({
        handId: hand.id,
        isSplit: true,
        splitHands: splitState.hands,
        activeHandIndex: splitState.activeHandIndex,
        hand1Total: handTotal(splitState.hands[0]),
        hand2Total: handTotal(splitState.hands[1]),
        dealerHand: [dealerUpcard, { suit: "?", rank: "?" }],
        hand1Status: splitState.statuses[0],
        hand2Status: splitState.statuses[1],
        status: hand.status,
        bet: parseFloat(hand.bet),
        serverSeedHash, clientSeed, nonce,
      });
    } else {
      const playerHand: Card[] = rawPlayerHand as Card[];
      res.json({
        handId: hand.id,
        playerHand,
        dealerHand: [dealerUpcard, { suit: "?", rank: "?" }],
        playerTotal: handTotal(playerHand),
        status: hand.status,
        bet: parseFloat(hand.bet),
        insuranceEligible: dealerUpcard.rank === "A" && playerHand.length === 2,
        serverSeedHash, clientSeed, nonce,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Blackjack current error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/blackjack/verify/:handId ───────────────────────────────────────
blackjackRouter.get("/verify/:handId", requireAuth, async (req, res) => {
  try {
    const handId = parseInt(req.params.handId as string);
    const [hand] = await db.select().from(blackjackHandsTable)
      .where(and(
        eq(blackjackHandsTable.id, handId),
        eq(blackjackHandsTable.userId, req.user!.userId)
      )).limit(1);

    if (!hand) { res.status(404).json({ error: "Hand not found" }); return; }

    // Only reveal server seed after hand is complete
    if (hand.status === "active") {
      res.status(400).json({ error: "Hand still in progress — server seed revealed after completion" });
      return;
    }

    // Legacy support
    let serverSeed: string;
    let clientSeed: string;
    let nonce: number;

    if (hand.serverSeed.includes("|")) {
      const seedParts = hand.serverSeed.split("|");
      serverSeed = seedParts[0];
      clientSeed = seedParts[1] || "default";
      nonce = parseInt(seedParts[2] || "1");
    } else {
      serverSeed = hand.serverSeed;
      clientSeed = hand.clientSeed || "default";
      nonce = hand.nonce || 1;
    }
    const serverSeedHash = hashServerSeed(serverSeed);

    res.json({
      handId: hand.id,
      serverSeed,          // Revealed after game
      serverSeedHash,      // Was shown before game
      clientSeed,
      nonce,
      status: hand.status,
      bet: hand.bet,
      createdAt: hand.createdAt,
      verificationInstructions: [
        "1. Combine serverSeed + clientSeed + nonce",
        "2. Run HMAC-SHA256(serverSeed, clientSeed:nonce:cardIndex) for each card position",
        "3. Compare the resulting hash to serverSeedHash shown before the game",
        "4. If they match, the outcome was not manipulated",
      ],
    });
  } catch (err) {
    req.log.error({ err }, "Blackjack verify error");
    res.status(500).json({ error: "Internal server error" });
  }
});
