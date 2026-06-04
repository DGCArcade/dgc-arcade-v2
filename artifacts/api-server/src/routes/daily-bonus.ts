import { Router } from "express";
import { db, usersTable, dailyBonusClaimsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

export const dailyBonusRouter = Router();

function todayStr(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function getBonusAmount(totalBets: number, totalWon: number): number {
  // VIP tier bonus
  if (totalWon >= 100000) return 100;
  if (totalWon >= 10000) return 25;
  if (totalWon >= 1000) return 10;
  if (totalBets >= 100) return 5;
  return 2; // base daily bonus
}

// GET /api/daily-bonus/status
dailyBonusRouter.get("/status", requireAuth, async (req, res) => {
  try {
    const today = todayStr();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const claimed = await db.select().from(dailyBonusClaimsTable)
      .where(and(
        eq(dailyBonusClaimsTable.userId, req.user!.userId),
        eq(dailyBonusClaimsTable.claimedDate, today)
      )).limit(1);

    const bonusAmount = getBonusAmount(user.totalBets, parseFloat(user.totalWon));

    res.json({
      claimed: claimed.length > 0,
      bonusAmount,
      claimedDate: claimed.length > 0 ? today : null,
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const existing = await db.select().from(dailyBonusClaimsTable)
      .where(and(
        eq(dailyBonusClaimsTable.userId, req.user!.userId),
        eq(dailyBonusClaimsTable.claimedDate, today)
      )).limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "Already claimed today" });
      return;
    }

    const bonusAmount = getBonusAmount(user.totalBets, parseFloat(user.totalWon));
    const newBalance = parseFloat(user.balance) + bonusAmount;

    await db.update(usersTable).set({ balance: String(newBalance) }).where(eq(usersTable.id, user.id));
    await db.insert(dailyBonusClaimsTable).values({
      userId: user.id, amount: String(bonusAmount), claimedDate: today,
    });

    res.json({ claimed: true, bonusAmount, newBalance });
  } catch (err) {
    req.log.error({ err }, "Daily bonus claim error");
    res.status(500).json({ error: "Internal server error" });
  }
});
