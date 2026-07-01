import { describe, expect, it } from "vitest";
import { computeRaceProgress } from "./derby-race-animation";

describe("computeRaceProgress", () => {
  const finishOrder = [2, 6, 1, 4, 3, 5]; // horse #2 wins per SHA-256 order

  it("keeps winner ahead at the wire", () => {
    const late = computeRaceProgress(20000, finishOrder);
    const winner = late.progress.find(p => p.racerId === 2)!;
    const runnerUp = late.progress.find(p => p.racerId === 6)!;
    expect(winner.done).toBe(true);
    expect(runnerUp.done).toBe(true);
    // Winner must finish before runner-up in time (crosses first)
    const winnerCross = computeRaceProgress(8500, finishOrder).progress.find(p => p.racerId === 2)!;
    const runnerCross = computeRaceProgress(8500, finishOrder).progress.find(p => p.racerId === 6)!;
    expect(winnerCross.progress).toBeGreaterThan(runnerCross.progress);
  });

  it("never lets a lower place cross before the winner mid-race", () => {
    for (let ms = 2000; ms <= 18000; ms += 400) {
      const { progress } = computeRaceProgress(ms, finishOrder);
      const winnerProg = progress.find(p => p.racerId === 2)!.progress;
      for (const id of [6, 1, 4, 3, 5]) {
        const other = progress.find(p => p.racerId === id)!.progress;
        if (!progress.find(p => p.racerId === id)!.done) {
          expect(other).toBeLessThanOrEqual(winnerProg + 0.01);
        }
      }
    }
  });

  it("winnerDone before allDone — no wait for last place", () => {
    const finishOrder = [2, 6, 1, 4, 3, 5];
    let winnerDoneAt = 0;
    let allDoneAt = 0;
    for (let ms = 7000; ms <= 16000; ms += 50) {
      const { winnerDone, allDone } = computeRaceProgress(ms, finishOrder);
      if (winnerDone && !winnerDoneAt) winnerDoneAt = ms;
      if (allDone && !allDoneAt) allDoneAt = ms;
    }
    expect(winnerDoneAt).toBeGreaterThan(0);
    expect(allDoneAt).toBeGreaterThan(winnerDoneAt);
    expect(allDoneAt - winnerDoneAt).toBeGreaterThan(2000);
  });
});
