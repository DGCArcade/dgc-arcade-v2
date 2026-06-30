import type { RacerDef } from "./derby-horse";

export type RacerProgress = { racerId: number; progress: number; done: boolean };

export const TRACK_LEN = 100;

export type Standing = {
  r: RacerDef;
  prog: number;
  done: boolean;
  rank: number;
  gapBehind: number;
};

export function buildStandings(racers: RacerDef[], progress: RacerProgress[]): Standing[] {
  const leaderProg = progress.reduce((max, p) => Math.max(max, p.progress), 0);
  return [...racers]
    .map(r => {
      const p = progress.find(x => x.racerId === r.id);
      return {
        r,
        prog: p?.progress ?? 0,
        done: p?.done ?? false,
        rank: 0,
        gapBehind: 0,
      };
    })
    .sort((a, b) => b.prog - a.prog)
    .map((x, i) => ({
      ...x,
      rank: i + 1,
      gapBehind: Math.max(0, leaderProg - x.prog),
    }));
}

export function getRankMap(standings: Standing[]): Map<number, Standing> {
  return new Map(standings.map(s => [s.r.id, s]));
}

export function getLeaderProgress(progress: RacerProgress[]): number {
  return progress.reduce((max, p) => Math.max(max, p.progress), 0);
}

export function formatGap(gap: number): string {
  if (gap < 0.5) return "LEAD";
  return `−${Math.round(gap)}m`;
}

/** 0 = leader at front, 1 = max behind */
export function relativeBehind(prog: number, leaderProg: number): number {
  if (leaderProg <= 0) return 0;
  return Math.min(1, Math.max(0, (leaderProg - prog) / Math.max(leaderProg, 12)));
}
