import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

export interface CrashRoundBet {
  betId: number;
  userId: number;
  username: string;
  amount: number;
  cashoutAt: number;
  won?: boolean;
  payout?: number;
}

export interface CrashRound {
  roundId: string;
  state: "betting" | "flying" | "crashed" | "results";
  startedAt: number;
  bettingEndsAt: number;
  flyingStartedAt?: number;
  crashedAt?: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  crashPoint?: number;
  bets: CrashRoundBet[];
}

const FLY_RATE = 0.2;
const BETTING_WINDOW_MS = 6000;
const CRASHED_DISPLAY_MS = 5000;
const HOUSE_EDGE = 0.03;

function computeCrashPoint(serverSeed: string, clientSeed: string): number {
  const hash = createHash("sha256").update(`${serverSeed}:${clientSeed}:0:crash`).digest("hex");
  const num = parseInt(hash.slice(0, 8), 16);
  const seed = num / 0xffffffff;
  return Math.max(1.01, 1 / (1 - seed * (1 - HOUSE_EDGE)));
}

export function flyingMultiplier(elapsedSec: number): number {
  return Math.pow(Math.E, FLY_RATE * elapsedSec);
}

export function timeToReachCrash(crashPoint: number): number {
  return Math.log(crashPoint) / FLY_RATE;
}

class CrashRoundManager {
  private currentRound: CrashRound | null = null;
  private roundHistory: Map<string, CrashRound> = new Map();
  private roundCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onCrashResolve: ((round: CrashRound) => Promise<void>) | null = null;

  constructor() {
    this.startRoundCycle();
  }

  setOnCrashResolve(handler: (round: CrashRound) => Promise<void>) {
    this.onCrashResolve = handler;
  }

  private startRoundCycle() {
    if (this.roundCheckInterval) clearInterval(this.roundCheckInterval);
    this.roundCheckInterval = setInterval(() => {
      this.updateRoundState();
    }, 100);
  }

  private updateRoundState() {
    const now = Date.now();

    if (!this.currentRound) {
      const serverSeed = uuidv4().replace(/-/g, "");
      const serverSeedHash = createHash("sha256").update(serverSeed).digest("hex");
      this.currentRound = {
        roundId: uuidv4(),
        state: "betting",
        startedAt: now,
        bettingEndsAt: now + BETTING_WINDOW_MS,
        serverSeed,
        serverSeedHash,
        clientSeed: uuidv4().replace(/-/g, ""),
        bets: [],
      };
      return;
    }

    const round = this.currentRound;

    if (round.state === "betting" && now >= round.bettingEndsAt) {
      round.state = "flying";
      round.flyingStartedAt = now;
      round.crashPoint = computeCrashPoint(round.serverSeed, round.clientSeed);
      return;
    }

    if (round.state === "flying" && round.flyingStartedAt && round.crashPoint) {
      const elapsed = (now - round.flyingStartedAt) / 1000;
      if (flyingMultiplier(elapsed) >= round.crashPoint) {
        round.state = "crashed";
        round.crashedAt = now;
        this.resolveBets(round);
        if (this.onCrashResolve) {
          void this.onCrashResolve(round);
        }
      }
      return;
    }

    if (round.state === "crashed" && round.crashedAt && now >= round.crashedAt + CRASHED_DISPLAY_MS) {
      round.state = "results";
      return;
    }

    if (round.state === "results" && round.crashedAt && now >= round.crashedAt + CRASHED_DISPLAY_MS + 2000) {
      this.roundHistory.set(round.roundId, { ...round, bets: [...round.bets] });
      this.currentRound = null;
    }
  }

  private resolveBets(round: CrashRound) {
    if (!round.crashPoint) return;
    for (const bet of round.bets) {
      const won = bet.cashoutAt <= round.crashPoint;
      bet.won = won;
      bet.payout = won ? bet.amount * bet.cashoutAt : 0;
    }
  }

  getCurrentRound(): CrashRound | null {
    this.updateRoundState();
    return this.currentRound;
  }

  getCurrentMultiplier(): number {
    const round = this.getCurrentRound();
    if (!round || round.state !== "flying" || !round.flyingStartedAt) return 1;
    const elapsed = (Date.now() - round.flyingStartedAt) / 1000;
    const mult = flyingMultiplier(elapsed);
    if (round.crashPoint) return Math.min(mult, round.crashPoint);
    return mult;
  }

  addBet(bet: CrashRoundBet) {
    if (!this.currentRound || this.currentRound.state !== "betting") {
      throw new Error("Betting window closed");
    }
    this.currentRound.bets.push(bet);
  }

  getRoundHistory(limit = 10): CrashRound[] {
    return Array.from(this.roundHistory.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  destroy() {
    if (this.roundCheckInterval) {
      clearInterval(this.roundCheckInterval);
      this.roundCheckInterval = null;
    }
  }
}

export const crashRoundManager = new CrashRoundManager();
