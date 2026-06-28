import { db, betsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

export interface DiceRound {
  roundId: string;
  state: "betting" | "rolling" | "results";
  startedAt: number;
  bettingEndsAt: number;
  rolledAt?: number;
  serverSeed: string;
  clientSeed: string;
  roll?: number;
  bets: DiceRoundBet[];
}

export interface DiceRoundBet {
  betId: number;
  userId: number;
  username: string;
  amount: number;
  target: number;
  mode: "over" | "under";
  won?: boolean;
  payout?: number;
}

class DiceRoundManager {
  private currentRound: DiceRound | null = null;
  private roundHistory: Map<string, DiceRound> = new Map();
  private readonly BETTING_WINDOW_MS = 5000; // 5 seconds
  private roundCheckInterval: any = null;

  constructor() {
    this.startRoundCycle();
  }

  private startRoundCycle() {
    if (this.roundCheckInterval) clearInterval(this.roundCheckInterval);
    
    // Check round state every 500ms
    this.roundCheckInterval = setInterval(() => {
      this.updateRoundState();
    }, 500);
  }

  private updateRoundState() {
    const now = Date.now();

    if (!this.currentRound) {
      // Start a new round
      this.currentRound = {
        roundId: uuidv4(),
        state: "betting",
        startedAt: now,
        bettingEndsAt: now + this.BETTING_WINDOW_MS,
        serverSeed: uuidv4().replace(/-/g, ""),
        clientSeed: uuidv4().replace(/-/g, ""),
        bets: [],
      };
      return;
    }

    // Transition from betting to rolling
    if (this.currentRound.state === "betting" && now >= this.currentRound.bettingEndsAt) {
      this.currentRound.state = "rolling";
      this.currentRound.rolledAt = now;
      this.rollDice();
    }

    // Transition from rolling to results (after 1 second of animation)
    if (this.currentRound.state === "rolling" && now >= (this.currentRound.rolledAt ?? 0) + 1000) {
      this.currentRound.state = "results";
      // Resolve all bets in this round
      this.resolveBets();
    }

    // Transition from results to new betting round (after 2 seconds)
    if (this.currentRound.state === "results" && now >= (this.currentRound.rolledAt ?? 0) + 3000) {
      this.roundHistory.set(this.currentRound.roundId, { ...this.currentRound });
      this.currentRound = null;
    }
  }

  private rollDice() {
    if (!this.currentRound) return;

    // Generate deterministic roll from seeds
    const message = `${this.currentRound.clientSeed}:0:dice`;
    const hash = createHash("sha256")
      .update(`${this.currentRound.serverSeed}:${message}`)
      .digest("hex");
    const num = parseInt(hash.slice(0, 8), 16);
    const seed = num / 0xffffffff;
    const roll = Math.floor(seed * 100) + 1; // 1-100

    this.currentRound.roll = roll;
  }

  private resolveBets() {
    if (!this.currentRound || this.currentRound.roll === undefined) return;

    const roll = this.currentRound.roll;

    for (const bet of this.currentRound.bets) {
      const won = bet.mode === "over" ? roll > bet.target : roll < bet.target;
      const winChance = bet.mode === "over" ? (100 - bet.target) / 100 : (bet.target - 1) / 100;
      const multiplier = won ? Math.max(1.01, (1 - 0.03) / Math.max(0.01, winChance)) : 0;
      const payout = won ? bet.amount * multiplier : 0;

      bet.won = won;
      bet.payout = payout;
    }
  }

  public getCurrentRound(): DiceRound | null {
    this.updateRoundState();
    return this.currentRound;
  }

  public addBetToRound(bet: DiceRoundBet) {
    if (!this.currentRound || this.currentRound.state !== "betting") {
      throw new Error("Betting window closed");
    }
    this.currentRound.bets.push(bet);
  }

  public getBetsForRound(roundId: string): DiceRoundBet[] {
    if (this.currentRound?.roundId === roundId) {
      return this.currentRound.bets;
    }
    return this.roundHistory.get(roundId)?.bets ?? [];
  }

  public getRoundHistory(limit: number = 10): DiceRound[] {
    const rounds: DiceRound[] = [];
    const entries = Array.from(this.roundHistory.entries())
      .sort((a, b) => b[1].startedAt - a[1].startedAt)
      .slice(0, limit);

    for (const [_, round] of entries) {
      rounds.push(round);
    }

    return rounds;
  }

  public destroy() {
    if (this.roundCheckInterval) {
      clearInterval(this.roundCheckInterval);
      this.roundCheckInterval = null;
    }
  }
}

// Singleton instance
export const diceRoundManager = new DiceRoundManager();
