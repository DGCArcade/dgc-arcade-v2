import { TRACK_LEN } from "./derby-race-utils";

export type RacerProgress = { racerId: number; progress: number; done: boolean };

const GATE_MS = 900;
/** Staggered gate break — horses don't all leave at once */
const GATE_STAGGER_MS = [0, 90, 180, 60, 150, 120];
/** Winner crosses ~8s after gate; each place +950ms so order never flips */
const BASE_FINISH_MS = 7600;
const RANK_GAP_MS = 950;
/** Tiny per-id jitter — must stay well under RANK_GAP_MS */
const JITTER_MS = 35;

export const RACE_GATE_MS = GATE_MS;
/** Hold photo-finish cam before showing payout card */
export const FINISH_HOLD_MS = 3200;

export function buildFinishRankMap(finishOrder: number[]): Record<number, number> {
  const map: Record<number, number> = {};
  finishOrder.forEach((id, i) => {
    map[id] = i;
  });
  return map;
}

/**
 * Progress driven strictly by provably-fair finish order.
 * Rank 0 always reaches the wire first; jitter cannot invert places.
 */
export function computeRaceProgress(
  elapsedMs: number,
  finishOrder: number[],
  trackLen: number = TRACK_LEN,
): { progress: RacerProgress[]; allDone: boolean } {
  const finishRank = buildFinishRankMap(finishOrder);
  const raceElapsed = Math.max(0, elapsedMs - GATE_MS);

  const progress = finishOrder.map(racerId => {
    const rank = finishRank[racerId] ?? 5;
    const stagger = GATE_STAGGER_MS[racerId - 1] ?? 0;
    const horseElapsed = Math.max(0, raceElapsed - stagger);
    const jitter = (racerId % 5) * JITTER_MS;
    const finishMs = BASE_FINISH_MS + rank * RANK_GAP_MS + jitter;
    const t = horseElapsed <= 0 ? 0 : Math.min(1, horseElapsed / finishMs);
    const eased = t < 0.08 ? t * 3.2 : 1 - Math.pow(1 - t, 3.1);
    return { racerId, progress: eased * trackLen, done: t >= 1 };
  });

  return { progress, allDone: progress.every(p => p.done) };
}

/** Snap positions at the wire for photo finish — winner at the line, others behind */
export function buildPhotoFinishProgress(
  finishOrder: number[],
  trackLen: number = TRACK_LEN,
): RacerProgress[] {
  const gapM = 2.8;
  return finishOrder.map((racerId, rank) => ({
    racerId,
    progress: Math.max(0, trackLen - rank * gapM),
    done: true,
  }));
}
