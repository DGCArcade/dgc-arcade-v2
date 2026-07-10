import { logger } from "./logger.js";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SportsGameOdds API Client (https://sportsgameodds.com)
 *
 * Pro Plan Integration: 53 leagues, 82 bookmakers, all market types
 * Replaces the previous The Odds API integration. Set SPORTSGAMEODDS_API_KEY
 * in your environment to enable this.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SPORTSGAMEODDS_API_KEY = process.env.SPORTS_GAME_ODDS_API_KEY || process.env.SPORTSGAMEODDS_API_KEY || "";
const SPORTSGAMEODDS_BASE = "https://api.sportsgameodds.com/v2";

export function isSportsGameOddsConfigured(): boolean {
  return Boolean(SPORTSGAMEODDS_API_KEY);
}

/**
 * Maps the frontend's display categories to SportsGameOdds leagueIDs.
 * Pro Plan: 53 leagues across 25+ sports
 */
export const CATEGORY_LEAGUES: Record<string, string[]> = {
  Football: ["NFL", "NCAAF", "CFL", "XFL", "USFL"],
  Soccer: [
    "EPL",
    "UEFA_CHAMPIONS_LEAGUE",
    "UEFA_EUROPA_LEAGUE",
    "MLS",
    "LA_LIGA",
    "BUNDESLIGA",
    "SERIE_A",
    "LIGUE_1",
    "EREDIVISIE",
    "PRIMEIRA_LIGA",
    "SCOTTISH_PREMIERSHIP",
    "SUPER_LIGA",
    "SUPER_LIG",
    "SERIE_B",
    "CHAMPIONSHIP",
    "LEAGUE_ONE",
    "LEAGUE_TWO",
    "COPA_LIBERTADORES",
    "BRAZIL_SERIE_A",
    "MEXICO_LIGA_MX",
  ],
  Basketball: ["NBA", "NCAAB", "WNBA", "EUROLEAGUE", "LIGA_ACB", "BSL", "NBL"],
  Baseball: ["MLB", "NPB", "KBO", "LMB"],
  Hockey: ["NHL", "SHL", "KHL", "LIIGA", "DEL"],
  Tennis: ["ATP", "WTA", "GRAND_SLAMS", "ITF_MEN", "ITF_WOMEN"],
  MMA: ["MMA", "UFC", "BELLATOR", "PFL"],
  Boxing: ["BOXING"],
  Golf: ["PGA", "EUROPEAN_TOUR", "LPGA", "LIV"],
  Cricket: ["IPL", "BIG_BASH", "TEST", "ODI", "T20I", "THE_HUNDRED"],
  Rugby: ["PREMIERSHIP", "TOP_14", "SUPER_RUGBY", "SIX_NATIONS", "RUGBY_CHAMPIONSHIP"],
  Esports: ["VALORANT", "CS2", "DOTA2", "LOL", "OVERWATCH", "RAINBOW_SIX"],
  Other: ["AUSSIE_RULES", "HANDBALL", "VOLLEYBALL", "DARTS", "SNOOKER", "TABLE_TENNIS"],
};

/** Flat list of every leagueID this app ever queries. */
export const ALL_LEAGUE_IDS = Array.from(
  new Set(Object.values(CATEGORY_LEAGUES).flat())
);

export interface SgoEvent {
  eventID: string;
  sportID?: string;
  leagueID?: string;
  teams?: {
    home?: { teamID?: string; names?: { long?: string; short?: string } };
    away?: { teamID?: string; names?: { long?: string; short?: string } };
  };
  status?: {
    startsAt?: string;
    started?: boolean;
    ended?: boolean;
    finalized?: boolean;
    live?: boolean;          // TRUE only while the game is in-progress RIGHT NOW
    cancelled?: boolean;
    inBreak?: boolean;       // half-time, timeouts, etc.
    currentPeriodID?: string; // "1q","2q","3q","4q","1h","2h","game"
    displayShort?: string;   // e.g. "Q3 4:22"
    displayLong?: string;    // e.g. "3rd Quarter"
    oddsAvailable?: boolean;
    oddsPresent?: boolean;
  };
  results?: {
    game?: { home?: { points?: string | number }; away?: { points?: string | number } };
    reg?: { home?: { points?: string | number }; away?: { points?: string | number } };
    ot?: { home?: { points?: string | number }; away?: { points?: string | number } };
    so?: { home?: { points?: string | number }; away?: { points?: string | number } };
    "1h"?: { home?: { points?: string | number }; away?: { points?: string | number } };
    "2h"?: { home?: { points?: string | number }; away?: { points?: string | number } };
    "1q"?: { home?: { points?: string | number }; away?: { points?: string | number } };
    "2q"?: { home?: { points?: string | number }; away?: { points?: string | number } };
    "3q"?: { home?: { points?: string | number }; away?: { points?: string | number } };
    "4q"?: { home?: { points?: string | number }; away?: { points?: string | number } };
    [key: string]: any;
  };
  odds?: Record<
    string,
    {
      oddID?: string;
      score?: string;
      closeOverUnder?: string;
      byBookmaker?: Record<
        string,
        {
          odds?: string;
          available?: boolean;
          spread?: string;
          overUnder?: string;
          deeplink?: string;
          altLines?: Array<{
            odds?: string;
            available?: boolean;
            spread?: string;
            overUnder?: string;
            lastUpdatedAt?: string;
          }>;
        }
      >;
    }
  >;
  [key: string]: unknown;
}

interface SgoEventsResponse {
  data?: SgoEvent[];
  nextCursor?: string | null;
}

/**
 * Fetches events for a single league from SportsGameOdds, following
 * pagination cursors. Capped to a handful of pages per league so a single
 * request can't run away against the API quota.
 */
export async function fetchLeagueEvents(
  leagueID: string,
  params: Record<string, string> = {},
  maxPages = 3
): Promise<SgoEvent[]> {
  if (!SPORTSGAMEODDS_API_KEY) return [];

  const events: SgoEvent[] = [];
  let cursor: string | null = null;
  let page = 0;

  do {
    const url = new URL(`${SPORTSGAMEODDS_BASE}/events`);
    url.searchParams.set("leagueID", leagueID);
    url.searchParams.set("limit", "100");
    // Pro plan: include alt lines and all market data
    url.searchParams.set("includeAltLines", "true");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (cursor) url.searchParams.set("cursor", cursor);

    try {
      const response = await fetch(url.toString(), {
        headers: { "x-api-key": SPORTSGAMEODDS_API_KEY },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status, leagueID },
          "[SportsGameOdds] Request failed"
        );
        break;
      }

      const body = (await response.json()) as SgoEventsResponse;
      events.push(...(body.data ?? []));
      cursor = body.nextCursor ?? null;
    } catch (error) {
      logger.error({ error, leagueID }, "[SportsGameOdds] Fetch error");
      break;
    }

    page += 1;
  } while (cursor && page < maxPages);

  return events;
}

/** Fetches events for every leagueID in a category, in parallel. */
export async function fetchCategoryEvents(
  category: string,
  params: Record<string, string> = {}
): Promise<SgoEvent[]> {
  const leagueIDs = CATEGORY_LEAGUES[category] ?? [];
  const results = await Promise.all(
    leagueIDs.map((leagueID) => fetchLeagueEvents(leagueID, params))
  );
  return results.flat();
}

function teamDisplayName(team?: { teamID?: string; names?: { long?: string; short?: string } }): string {
  return team?.names?.long || team?.names?.short || team?.teamID || "Unknown";
}

/** betTypeID -> the-odds-api-style market key, kept for frontend compatibility. */
const MARKET_KEY_BY_BET_TYPE: Record<string, string> = {
  ml: "h2h",
  ml3way: "h2h",
  sp: "spreads",
  ou: "totals",
  prop: "props",
};

/**
 * Extract live score from event results object
 */
function extractLiveScore(event: SgoEvent): { homeScore?: number; awayScore?: number; period?: string } {
  if (!event.results) return {};

  const toScore = (v: string | number | undefined): number | undefined => {
    const n = Number(v);
    return v !== undefined && !isNaN(n) ? n : undefined;
  };

  // Try to get the most recent score available
  const gameScore = event.results.game;
  const gHome = toScore(gameScore?.home?.points);
  const gAway = toScore(gameScore?.away?.points);
  if (gHome !== undefined && gAway !== undefined) {
    return { homeScore: gHome, awayScore: gAway, period: "game" };
  }

  // Try quarter/half scores (most recent period first)
  for (const period of ["4q", "3q", "2q", "1q", "2h", "1h"]) {
    const periodScore = (event.results as any)[period];
    const pH = toScore(periodScore?.home?.points);
    const pA = toScore(periodScore?.away?.points);
    if (pH !== undefined && pA !== undefined) {
      return { homeScore: pH, awayScore: pA, period };
    }
  }

  return {};
}

/**
 * Normalizes a SportsGameOdds event into the same shape the frontend already
 * expects (the-odds-api "fixture" shape) so existing UI code keeps working.
 * Enhanced with live scores, alt lines, and all market types.
 */
export function mapEventToFixture(event: SgoEvent, sportKey: string) {
  const homeTeam = teamDisplayName(event.teams?.home);
  const awayTeam = teamDisplayName(event.teams?.away);
  const liveScore = extractLiveScore(event);

  const bookmakerMap: Record<
    string,
    {
      key: string;
      title: string;
      markets: Record<
        string,
        {
          key: string;
          outcomes: Array<{
            name: string;
            price: number;
            point?: number;
            altLines?: Array<{ odds: number; spread?: number; overUnder?: number }>;
          }>;
        }
      >;
      deeplinks?: Record<string, string>;
    }
  > = {};

  for (const [oddID, oddObj] of Object.entries(event.odds ?? {})) {
    const parts = oddID.split("-");
    const betTypeID = parts[3];
    const sideID = parts[4];
    const marketKey = MARKET_KEY_BY_BET_TYPE[betTypeID];
    if (!marketKey) continue;

    for (const [bookmakerID, bm] of Object.entries(oddObj.byBookmaker ?? {})) {
      if (!bm || bm.available === false || bm.odds === undefined) continue;

      bookmakerMap[bookmakerID] ??= { key: bookmakerID, title: bookmakerID, markets: {}, deeplinks: {} };
      bookmakerMap[bookmakerID].markets[marketKey] ??= { key: marketKey, outcomes: [] };

      const outcomeName =
        sideID === "home"
          ? homeTeam
          : sideID === "away"
          ? awayTeam
          : sideID === "draw"
          ? "Draw"
          : sideID === "over"
          ? "Over"
          : sideID === "under"
          ? "Under"
          : sideID;

      const price = Number(bm.odds);
      if (Number.isNaN(price)) continue;

      const point =
        marketKey === "spreads" && bm.spread !== undefined
          ? Number(bm.spread)
          : marketKey === "totals" && bm.overUnder !== undefined
          ? Number(bm.overUnder)
          : undefined;

      // Extract alt lines if available
      const altLines =
        bm.altLines?.map((alt) => ({
          odds: Number(alt.odds ?? 0),
          spread: alt.spread ? Number(alt.spread) : undefined,
          overUnder: alt.overUnder ? Number(alt.overUnder) : undefined,
        })) ?? [];

      bookmakerMap[bookmakerID].markets[marketKey].outcomes.push({
        name: outcomeName,
        price,
        ...(point !== undefined && !Number.isNaN(point) ? { point } : {}),
        ...(altLines.length > 0 ? { altLines } : {}),
      });

      // Store deeplink for bookmaker
      if (bm.deeplink) {
        bookmakerMap[bookmakerID].deeplinks![oddID] = bm.deeplink;
      }
    }
  }

  // Ensure bookmakers are sorted by title for consistent UI
  const bookmakers = Object.values(bookmakerMap).sort((a, b) => a.title.localeCompare(b.title));

  return {
    id: event.eventID,
    sport_key: sportKey,
    sport_title: event.leagueID || sportKey,
    commence_time: event.status?.startsAt || new Date().toISOString(),
    completed: Boolean(event.status?.ended),
    // Real live-status fields — passed through directly from the API response
    live: Boolean(event.status?.live),
    started: Boolean(event.status?.started),
    inBreak: Boolean(event.status?.inBreak),
    currentPeriod: event.status?.currentPeriodID || undefined,
    periodDisplay: event.status?.displayShort || event.status?.displayLong || undefined,
    home_team: homeTeam,
    away_team: awayTeam,
    // Only attach liveScore when the game is actually in-progress with real data
    liveScore: (event.status?.started && !event.status?.ended && liveScore.homeScore !== undefined)
      ? liveScore
      : undefined,
    bookmakers: bookmakers.map((bm) => ({
      key: bm.key,
      title: bm.title,
      markets: Object.values(bm.markets),
      deeplinks: bm.deeplinks,
    })),
  };
}

/**
 * Fetches all currently LIVE events across every configured league.
 * Uses a short cache (15 s) so the live tab stays fresh.
 */
export async function fetchAllLiveEvents(): Promise<ReturnType<typeof mapEventToFixture>[]> {
  if (!SPORTSGAMEODDS_API_KEY) return [];

  const results = await Promise.all(
    ALL_LEAGUE_IDS.map(async (leagueID) => {
      try {
        const url = new URL(`${SPORTSGAMEODDS_BASE}/events`);
        url.searchParams.set("leagueID", leagueID);
        url.searchParams.set("limit", "50");
        url.searchParams.set("includeAltLines", "true");
        // Only fetch events that have started (the API doesn't have a ?live= param,
        // so we fetch started events and filter on status.live below)
        url.searchParams.set("finalized", "false");

        const response = await fetch(url.toString(), {
          headers: { "x-api-key": SPORTSGAMEODDS_API_KEY },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return [];

        const body = (await response.json()) as SgoEventsResponse;
        return (body.data ?? [])
          .filter((ev) => ev.status?.live === true)
          .map((ev) => mapEventToFixture(ev, leagueID));
      } catch {
        return [];
      }
    })
  );

  return results.flat();
}
