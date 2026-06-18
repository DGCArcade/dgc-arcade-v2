import { Router } from "express";
import { db, jackpotPoolTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export const jackpotRouter = Router();

export const JACKPOT_SEEDS_CENTS: Record<string, number> = {
  mini:  5_000,    // $50.00
  minor: 25_000,   // $250.00
  major: 125_000,  // $1,250.00
  grand: 500_000,  // $5,000.00
};

async function ensureJackpots(): Promise<void> {
  for (const [key, seed] of Object.entries(JACKPOT_SEEDS_CENTS)) {
    await db.insert(jackpotPoolTable)
      .values({ key, valueCents: seed })
      .onConflictDoNothing();
  }
}

async function readJackpots(): Promise<Record<string, number>> {
  const rows = await db.select().from(jackpotPoolTable);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = r.valueCents / 100;
  return {
    mini:  map.mini  ?? JACKPOT_SEEDS_CENTS.mini  / 100,
    minor: map.minor ?? JACKPOT_SEEDS_CENTS.minor / 100,
    major: map.major ?? JACKPOT_SEEDS_CENTS.major / 100,
    grand: map.grand ?? JACKPOT_SEEDS_CENTS.grand / 100,
  };
}

// GET /api/jackpot — public, returns live pool values
jackpotRouter.get("/", async (req, res) => {
  try {
    await ensureJackpots();
    const jackpots = await readJackpots();
    res.json(jackpots);
  } catch (err) {
    req.log.error({ err }, "Get jackpot error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Internal helper: contribute a fraction of every bet to the pool
// Rate: mini 0.01%, minor 0.02%, major 0.05%, grand 0.10%
export async function contributeToJackpot(betAmount: number): Promise<void> {
  const cents = Math.round(betAmount * 100);
  const add = {
    mini:  Math.max(1, Math.round(cents * 0.0001)),
    minor: Math.max(1, Math.round(cents * 0.0002)),
    major: Math.max(1, Math.round(cents * 0.0005)),
    grand: Math.max(1, Math.round(cents * 0.0010)),
  };
  for (const [key, amount] of Object.entries(add)) {
    await db.insert(jackpotPoolTable)
      .values({ key, valueCents: JACKPOT_SEEDS_CENTS[key] + amount })
      .onConflictDoUpdate({
        target: jackpotPoolTable.key,
        set: {
          valueCents: sql`${jackpotPoolTable.valueCents} + ${amount}`,
          updatedAt: new Date(),
        },
      });
  }
}
