import { Router } from "express";
import { db, usersTable, dailyBonusClaimsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

export const dailyBonusRouter = Router();

function todayStr(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

// Base bonus based on VIP tier (unmodified by streak)
function getBaseBonusAmount(totalBets: number, totalWon: number): number {
  if (totalWon >= 100000) return 100;
  if (totalWon >= 10000)  return 25;
  if (totalWon >= 1000)   return 10;
  if (totalBets >= 100)   return 5;
  return 2;
}

// Streak multiplier: +10% per consecutive day, capped at 2× (11+ days)
function applyStreakMultiplier(base: number, streakDay: number): number {
  const mult = Math.min(1 + 0.1 * (streakDay - 1), 2.0);
  return Math.round(base * mult * 100) / 100;
}

// GET /api/daily-bonus/status
dailyBonusRouter.get("/status", requireAuth, async (req, res) => {
  try {
    const today = todayStr();
    const yesterday = yesterdayStr();

    const [user] = await db
      .select({ id: usersTable.id, totalBets: usersTable.totalBets, totalWon: usersTable.totalWon })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    // Last two claims to determine today's claim + streak continuity
    const lastTwo = await db
      .select({ claimedDate: dailyBonusClaimsTable.claimedDate, streakDay: dailyBonusClaimsTable.streakDay })
      .from(dailyBonusClaimsTable)
      .where(eq(dailyBonusClaimsTable.userId, user.id))
      .orderBy(desc(dailyBonusClaimsTable.createdAt))
      .limit(2);

    const todayClaim   = lastTwo.find(r => r.claimedDate === today);
    const yesterdayClaim = lastTwo.find(r => r.claimedDate === yesterday);

    // If today already claimed → show existing streak
    // If yesterday claimed → streak continues (streakDay = yesterday + 1)
    // Otherwise streak resets to 1
    let streakDay: number;
    if (todayClaim) {
      streakDay = todayClaim.streakDay;
    } else if (yesterdayClaim) {
      streakDay = yesterdayClaim.streakDay + 1;
    } else {
      streakDay = 1;
    }

    const base = getBaseBonusAmount(user.totalBets, parseFloat(user.totalWon));
    const bonusAmount = applyStreakMultiplier(base, streakDay);
    const nextStreakAmount = applyStreakMultiplier(base, Math.min(streakDay + 1, 11));

    res.json({
      claimed: !!todayClaim,
      bonusAmount,
      baseAmount: base,
      streakDay,
      maxStreak: streakDay >= 11,
      nextStreakAmount: !todayClaim ? nextStreakAmount : applyStreakMultiplier(base, Math.min(streakDay + 1, 11)),
      claimedDate: todayClaim ? today : null,
    });
  } catch (err) {
    req.log.error({ err }, "Daily bonus status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/daily-bonus/claim
dailyBonusRouter.post("/claim", requireAuth, async (req, res) => {
  try {
    const today = todayStr();
    const yesterday = yesterdayStr();

    const [user] = await db
      .select({ id: usersTable.id, balance: usersTable.balance, totalBets: usersTable.totalBets, totalWon: usersTable.totalWon })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    // Check today
    const existing = await db
      .select({ id: dailyBonusClaimsTable.id })
      .from(dailyBonusClaimsTable)
      .where(and(eq(dailyBonusClaimsTable.userId, user.id), eq(dailyBonusClaimsTable.claimedDate, today)))
      .limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "Already claimed today" });
      return;
    }

    // Determine streak
    const [yesterdayClaim] = await db
      .select({ streakDay: dailyBonusClaimsTable.streakDay })
      .from(dailyBonusClaimsTable)
      .where(and(eq(dailyBonusClaimsTable.userId, user.id), eq(dailyBonusClaimsTable.claimedDate, yesterday)))
      .limit(1);

    const streakDay = yesterdayClaim ? yesterdayClaim.streakDay + 1 : 1;
    const base = getBaseBonusAmount(user.totalBets, parseFloat(user.totalWon));
    const bonusAmount = applyStreakMultiplier(base, streakDay);
    const [updatedUser] = await db.update(usersTable)
      .set({ balance: sql`balance + ${bonusAmount}` })
      .where(eq(usersTable.id, user.id))
      .returning({ balance: usersTable.balance });
    const newBalance = parseFloat(updatedUser?.balance ?? "0");
    await db.insert(dailyBonusClaimsTable).values({
      userId: user.id,
      amount: String(bonusAmount),
      claimedDate: today,
      streakDay,
    });

    req.log.info({ userId: user.id, bonusAmount, streakDay, newBalance }, "Daily bonus claimed");
    res.json({ claimed: true, bonusAmount, streakDay, newBalance });
  } catch (err) {
    req.log.error({ err }, "Daily bonus claim error");
    res.status(500).json({ error: "Internal server error" });
  }
});
