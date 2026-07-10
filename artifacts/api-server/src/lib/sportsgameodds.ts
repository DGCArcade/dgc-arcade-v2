import { logger } from "./logger.js";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SportsGameOdds API Client (https://sportsgameodds.com)
 *
 * Replaces the previous The Odds API integration. Set SPORTSGAMEODDS_API_KEY
 * in your environment to enable this.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SPORTSGAMEODDS_API_KEY = process.env.SPORTSGAMEODDS_API_KEY || "";
const SPORTSGAMEODDS_BASE = "https://api.sportsgameodds.com/v2";

export function isSportsGameOddsConfigured(): boolean {
  return Boolean(SPORTSGAMEODDS_API_KEY);
}

/** Maps the frontend's display categories to SportsGameOdds leagueIDs. */
export const CATEGORY_LEAGUES: Record<string, string[]> = {
  Football: ["NFL", "NCAAF"],
  Soccer: [
    "EPL",
    "UEFA_CHAMPIONS_LEAGUE",
    "MLS",
    "LA_LIGA",
    "BUNDESLIGA",
    "SERIE_A",
    "LIGUE_1",
  ],
  Basketball: ["NBA", "NCAAB", "WNBA"],
  Baseball: ["MLB"],
  Hockey: ["NHL"],
  Tennis: ["ATP", "WTA"],
  MMA: ["MMA"],
  Boxing: ["BOXING"],
  Golf: ["PGA"],
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
};

/**
 * Normalizes a SportsGameOdds event into the same shape the frontend already
 * expects (the-odds-api "fixture" shape) so existing UI code keeps working.
 */
export function mapEventToFixture(event: SgoEvent, sportKey: string) {
  const homeTeam = teamDisplayName(event.teams?.home);
  const awayTeam = teamDisplayName(event.teams?.away);

  const bookmakerMap: Record<
    string,
    { key: string; title: string; markets: Record<string, { key: string; outcomes: { name: string; price: number; point?: number }[] }> }
  > = {};

  for (const [oddID, oddObj] of Object.entries(event.odds ?? {})) {
    const parts = oddID.split("-");
    const betTypeID = parts[3];
    const sideID = parts[4];
    const marketKey = MARKET_KEY_BY_BET_TYPE[betTypeID];
    if (!marketKey) continue;

    for (const [bookmakerID, bm] of Object.entries(oddObj.byBookmaker ?? {})) {
      if (!bm || bm.available === false || bm.odds === undefined) continue;

      bookmakerMap[bookmakerID] ??= { key: bookmakerID, title: bookmakerID, markets: {} };
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

      bookmakerMap[bookmakerID].markets[marketKey].outcomes.push({
        name: outcomeName,
        price,
        ...(point !== undefined && !Number.isNaN(point) ? { point } : {}),
      });
    }
  }

  return {
    id: event.eventID,
    sport_key: sportKey,
    sport_title: event.leagueID ?? sportKey,
    commence_time: event.status?.startsAt ?? new Date().toISOString(),
    completed: Boolean(event.status?.ended),
    home_team: homeTeam,
    away_team: awayTeam,
    bookmakers: Object.values(bookmakerMap).map((bm) => ({
      key: bm.key,
      title: bm.title,
      markets: Object.values(bm.markets),
    })),
  };
}
