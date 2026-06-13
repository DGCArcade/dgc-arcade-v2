import { Router } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq, and, count, sum, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

export const referralsRouter = Router();

// ── Affiliate tier system ────────────────────────────────────────────────────
// Tier is based on number of ACTIVE referrals (referred users who have deposited)
export function getReferralTier(activeCount: number): {
  tier: string;
  commissionRate: number;
  nextTierAt: number | null;
  color: string;
  emoji: string;
} {
  if (activeCount >= 50) return { tier: "Platinum", commissionRate: 0.10, nextTierAt: null,  color: "#e5e4e2", emoji: "💎" };
  if (activeCount >= 20) return { tier: "Gold",     commissionRate: 0.07, nextTierAt: 50,    color: "#ffd700", emoji: "🥇" };
  if (activeCount >= 5)  return { tier: "Silver",   commissionRate: 0.05, nextTierAt: 20,    color: "#c0c0c0", emoji: "🥈" };
  return                        { tier: "Bronze",   commissionRate: 0.03, nextTierAt: 5,     color: "#cd7f32", emoji: "🥉" };
}

// GET /api/referrals/my-code
referralsRouter.get("/my-code", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({ id: usersTable.id, username: usersTable.username, referralCode: usersTable.referralCode })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const code = user.referralCode ?? `DGC${user.id}`;
    const [{ activeCount }] = await db.select({ activeCount: count() })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, user.id), eq(referralsTable.status, "active")));
    const [{ pendingCount }] = await db.select({ pendingCount: count() })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, user.id), eq(referralsTable.status, "pending")));
    const [{ totalEarned }] = await db.select({ totalEarned: sum(referralsTable.earnedAmount) })
      .from(referralsTable)
      .where(eq(referralsTable.referrerId, user.id));

    const tier = getReferralTier(activeCount);
    const siteUrl = process.env.SITE_URL ?? "";

    res.json({
      code,
      link: siteUrl ? `${siteUrl}?ref=${code}` : `/?ref=${code}`,
      tier: tier.tier,
      color: tier.color,
      emoji: tier.emoji,
      commissionRate: tier.commissionRate,
      commissionPct: Math.round(tier.commissionRate * 100),
      nextTierAt: tier.nextTierAt,
      activeReferrals: activeCount,
      pendingReferrals: pendingCount,
      totalEarned: parseFloat(totalEarned ?? "0"),
    });
  } catch (err) {
    req.log.error({ err }, "Referrals my-code error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/referrals/my-referrals
referralsRouter.get("/my-referrals", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: referralsTable.id,
        referredUsername: usersTable.username,
        status: referralsTable.status,
        earnedAmount: referralsTable.earnedAmount,
        createdAt: referralsTable.createdAt,
      })
      .from(referralsTable)
      .innerJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
      .where(eq(referralsTable.referrerId, req.user!.userId))
      .orderBy(sql`${referralsTable.createdAt} DESC`)
      .limit(100);

    res.json(rows.map(r => ({
      id: r.id,
      username: r.referredUsername,
      status: r.status,
      earned: parseFloat(r.earnedAmount),
      joinedAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Referrals my-referrals error");
    res.status(500).json({ error: "Internal server error" });
  }
});
