import { Router } from "express";
import { db, jackpotPoolTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { creditBalance } from "../lib/balance-service.js";
import { recordLedgerStandalone } from "../services/ledger.js";

export const jackpotRouter = Router();

export const JACKPOT_SEEDS_CENTS: Record<string, number> = {
  mini:  5_000,    // $50.00
  minor: 25_000,   // $250.00
  major: 125_000,  // $1,250.00
  grand: 500_000,  // $5,000.00
};

// Base odds per tier per $1 wagered (scales with bet, capped at $250)
const JACKPOT_ODDS_PER_DOLLAR: Record<string, number> = {
  mini:  1 / 500,      // ~1 in 500 per $1 bet
  minor: 1 / 5_000,    // ~1 in 5,000 per $1 bet
  major: 1 / 50_000,   // ~1 in 50,000 per $1 bet
  grand: 1 / 500_000,  // ~1 in 500,000 per $1 bet
};

// Maximum bet amount that counts toward jackpot odds (prevents whale abuse)
const MAX_JACKPOT_BET = 250;

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

// GET /api/jackpot/winners — recent jackpot winners (public)
jackpotRouter.get("/winners", async (req, res) => {
  try {
    const rows = await db.execute(
      sql`SELECT wl.user_id, u.username, wl.amount, wl.note, wl.created_at
          FROM wallet_ledger wl
          JOIN users u ON u.id = wl.user_id
          WHERE wl.reason = 'jackpot_win'
          ORDER BY wl.created_at DESC
          LIMIT 10`
    );
    res.json({ winners: rows.rows });
  } catch (err) {
    req.log.error({ err }, "Get jackpot winners error");
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

export interface JackpotWinResult {
  tier: string;
  amount: number;
  newBalance: number;
}

/**
 * After each bet, roll for jackpot wins using provably-fair hash.
 * Returns the win result if a jackpot was hit, null otherwise.
 *
 * Odds scale with bet size (capped at $250 to prevent abuse).
 * Uses atomic CTE UPDATE to prevent double-wins.
 */
export async function tryJackpotWin(
  userId: number,
  betAmount: number,
  serverSeed: string,
  clientSeed: string,
  gameSlug: string
): Promise<JackpotWinResult | null> {
  const effectiveBet = Math.min(betAmount, MAX_JACKPOT_BET);

  // Check each tier from smallest to largest
  const tiers = ["mini", "minor", "major", "grand"] as const;

  for (const tier of tiers) {
    const odds = JACKPOT_ODDS_PER_DOLLAR[tier] * effectiveBet;

    // Provably fair roll: hash(serverSeed:clientSeed:gameSlug:jackpot:tier)
    const combined = `${serverSeed}:${clientSeed}:${gameSlug}:jackpot:${tier}`;
    const hash = createHash("sha256").update(combined).digest("hex");
    const roll = parseInt(hash.slice(0, 8), 16) / 0xffffffff;

    if (roll < odds) {
      try {
        // Atomic: read current value, reset to seed, return old value
        // Only succeeds if pool is above seed (prevents double-win)
        const winResult = await db.execute(
          sql`WITH locked AS (
                SELECT value_cents FROM jackpot_pool WHERE key = ${tier} FOR UPDATE
              ),
              updated AS (
                UPDATE jackpot_pool
                SET value_cents = ${JACKPOT_SEEDS_CENTS[tier]},
                    updated_at  = NOW()
                WHERE key = ${tier}
                  AND value_cents > ${JACKPOT_SEEDS_CENTS[tier]}
                RETURNING (SELECT value_cents FROM locked) AS won_cents
              )
              SELECT won_cents FROM updated`
        );

        if (!winResult.rows || winResult.rows.length === 0) continue;

        const wonCents = Number((winResult.rows[0] as any).won_cents);
        if (!wonCents || wonCents <= JACKPOT_SEEDS_CENTS[tier]) continue;

        const wonAmount = wonCents / 100;

        // Get user balance before credit
        const [user] = await db.select({ balance: usersTable.balance })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);

        const balanceBefore = user ? parseFloat(user.balance) : 0;
        const newBalance = await creditBalance(userId, wonAmount);

        // Record in ledger as jackpot_win
        await recordLedgerStandalone({
          userId,
          amount: wonAmount,
          balanceBefore,
          balanceAfter: newBalance,
          reason: "jackpot_win" as any,
          note: `${tier.toUpperCase()} JACKPOT WIN on ${gameSlug} — $${wonAmount.toFixed(2)}`,
        });

        return { tier, amount: wonAmount, newBalance };
      } catch (err) {
        // Log but don't crash the bet — jackpot win failure is non-fatal
        console.error(`Jackpot win error for tier ${tier}:`, err);
        continue;
      }
    }
  }

  return null;
}
