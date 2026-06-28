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
  serverSeedHash: string; // SHA-256 hash of serverSeed
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
  private nextRound: DiceRound | null = null; // Bets can be placed on the next round
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
      const serverSeed = uuidv4().replace(/-/g, "");
      const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
      
      this.currentRound = {
        roundId: uuidv4(),
        state: "betting",
        startedAt: now,
        bettingEndsAt: now + this.BETTING_WINDOW_MS,
        serverSeed,
        serverSeedHash,
        clientSeed: uuidv4().replace(/-/g, ""),
        bets: [],
      };

      // If there's a next round with bets, promote it to current
      if (this.nextRound && this.nextRound.bets.length > 0) {
        this.currentRound.bets = this.nextRound.bets;
        this.nextRound = null;
      }
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

    // Transition from results to new betting round (after 5 seconds total, allowing 4 more seconds for next-round betting)
    if (this.currentRound.state === "results" && now >= (this.currentRound.rolledAt ?? 0) + 5000) {
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

  public getNextRound(): DiceRound | null {
    // Create a next round if it doesn't exist
    if (!this.nextRound) {
      const serverSeed = uuidv4().replace(/-/g, "");
      const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
      
      this.nextRound = {
        roundId: uuidv4(),
        state: "betting",
        startedAt: Date.now() + this.BETTING_WINDOW_MS + 6000, // Estimated start time
        bettingEndsAt: Date.now() + this.BETTING_WINDOW_MS + 11000,
        serverSeed,
        serverSeedHash,
        clientSeed: uuidv4().replace(/-/g, ""),
        bets: [],
      };
    }
    return this.nextRound;
  }

  public addBetToRound(bet: DiceRoundBet, roundId?: string) {
    // If roundId is specified, add to that round (for next-round betting)
    if (roundId) {
      if (this.nextRound?.roundId === roundId) {
        this.nextRound.bets.push(bet);
        return;
      }
      throw new Error("Round not found");
    }

    // Otherwise add to current round
    if (!this.currentRound || this.currentRound.state !== "betting") {
      throw new Error("Betting window closed for current round");
    }
    this.currentRound.bets.push(bet);
  }

  public getBetsForRound(roundId: string): DiceRoundBet[] {
    if (this.currentRound?.roundId === roundId) {
      return this.currentRound.bets;
    }
    if (this.nextRound?.roundId === roundId) {
      return this.nextRound.bets;
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
