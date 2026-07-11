import { db, pool, systemCachesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { mapEventToFixture } from "./sportsgameodds.js";

export const LIVE_ODDS_CACHE_KEY = "sportsbook_live_odds";
export const LIVE_ODDS_STALE_AFTER_MS = 90_000;
const LIVE_ODDS_ADVISORY_LOCK_ID = 1_806_244_721;

export type LiveOddsFixture = ReturnType<typeof mapEventToFixture>;

export interface LiveOddsSnapshot {
  fixtures: LiveOddsFixture[];
  updatedAt: string | null;
  sourceUpdatedAt: string | null;
  version: number;
  stale: boolean;
  configured: boolean;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function emptyLiveOddsSnapshot(configured: boolean): LiveOddsSnapshot {
  return {
    fixtures: [],
    updatedAt: null,
    sourceUpdatedAt: null,
    version: 0,
    stale: true,
    configured,
  };
}

export async function readLiveOddsSnapshot(
  configured: boolean,
  now = Date.now(),
): Promise<LiveOddsSnapshot> {
  const rows = await db
    .select()
    .from(systemCachesTable)
    .where(eq(systemCachesTable.cacheKey, LIVE_ODDS_CACHE_KEY))
    .limit(1);
  const row = rows[0];
  if (!row) return emptyLiveOddsSnapshot(configured);

  const updatedAt = toIso(row.updatedAt);
  const sourceUpdatedAt = toIso(row.sourceUpdatedAt);
  const fixtures = Array.isArray(row.data)
    ? (row.data as LiveOddsFixture[])
    : [];
  const freshnessTime = sourceUpdatedAt ? Date.parse(sourceUpdatedAt) : 0;

  return {
    fixtures,
    updatedAt,
    sourceUpdatedAt,
    version: row.version,
    stale: !freshnessTime || now - freshnessTime > LIVE_ODDS_STALE_AFTER_MS,
    configured,
  };
}

export async function writeLiveOddsSnapshot(
  fixtures: LiveOddsFixture[],
  sourceUpdatedAt = new Date(),
  configured = true,
): Promise<LiveOddsSnapshot> {
  const [row] = await db
    .insert(systemCachesTable)
    .values({
      cacheKey: LIVE_ODDS_CACHE_KEY,
      data: fixtures,
      version: 1,
      sourceUpdatedAt,
      updatedAt: new Date(),
      metadata: { provider: "sportsgameodds", fixtureCount: fixtures.length },
    })
    .onConflictDoUpdate({
      target: systemCachesTable.cacheKey,
      set: {
        data: fixtures,
        version: sql`${systemCachesTable.version} + 1`,
        sourceUpdatedAt,
        updatedAt: new Date(),
        metadata: { provider: "sportsgameodds", fixtureCount: fixtures.length },
      },
    })
    .returning();

  return {
    fixtures,
    updatedAt: toIso(row.updatedAt),
    sourceUpdatedAt: toIso(row.sourceUpdatedAt),
    version: row.version,
    stale: false,
    configured,
  };
}

/**
 * Prevents duplicate upstream requests when the service is briefly running more
 * than one process during deploys or later grows beyond a single instance.
 */
export async function withLiveOddsSyncLock<T>(
  task: () => Promise<T>,
): Promise<T | null> {
  const client = await pool.connect();
  let locked = false;

  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [LIVE_ODDS_ADVISORY_LOCK_ID],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) return null;
    return await task();
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [LIVE_ODDS_ADVISORY_LOCK_ID])
        .catch(() => undefined);
    }
    client.release();
  }
}
