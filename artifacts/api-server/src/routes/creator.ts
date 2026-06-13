import { Router } from "express";
import { db, usersTable, creatorBankTxnsTable, referralsTable } from "@workspace/db";
import { eq, and, desc, sum, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getReferralTier } from "./referrals.js";

export const creatorRouter = Router();

// All creator routes require auth. Account type is checked per-route.
creatorRouter.use(requireAuth);

function requireCreator(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  // Creators and admins/owners may access the creator dashboard
  const allowed = ["creator", "admin", "owner"];
  // We do a fresh DB check below — this is a guard against stale JWT role
  next();
}

// GET /api/creator/dashboard
creatorRouter.get("/dashboard", requireCreator, async (req, res) => {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        accountType: usersTable.accountType,
        promoBalance: usersTable.promoBalance,
        referralCode: usersTable.referralCode,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.accountType !== "creator" && user.accountType !== "normal") {
      // allow any type — creators + normal users with referrals can both use this
    }

    // Referral stats
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
    const code = user.referralCode ?? `DGC${user.id}`;
    const siteUrl = process.env.SITE_URL ?? "";

    // Creator bank history (last 50)
    const bankHistory = await db
      .select({
        id: creatorBankTxnsTable.id,
        type: creatorBankTxnsTable.type,
        amount: creatorBankTxnsTable.amount,
        description: creatorBankTxnsTable.description,
        createdAt: creatorBankTxnsTable.createdAt,
        toUserId: creatorBankTxnsTable.toUserId,
      })
      .from(creatorBankTxnsTable)
      .where(eq(creatorBankTxnsTable.creatorId, user.id))
      .orderBy(desc(creatorBankTxnsTable.createdAt))
      .limit(50);

    res.json({
      username: user.username,
      accountType: user.accountType,
      promoBalance: parseFloat(user.promoBalance),
      referralCode: code,
      referralLink: siteUrl ? `${siteUrl}?ref=${code}` : `/?ref=${code}`,
      tier: tier.tier,
      color: tier.color,
      emoji: tier.emoji,
      commissionRate: tier.commissionRate,
      commissionPct: Math.round(tier.commissionRate * 100),
      nextTierAt: tier.nextTierAt,
      activeReferrals: activeCount,
      pendingReferrals: pendingCount,
      totalCommissionEarned: parseFloat(totalEarned ?? "0"),
      bankHistory: bankHistory.map(h => ({
        id: h.id,
        type: h.type,
        amount: parseFloat(h.amount),
        description: h.description ?? "",
        createdAt: h.createdAt.toISOString(),
        toUserId: h.toUserId,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Creator dashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/creator/bank/tip
// Creator sends promoBalance to another user as a promo gift
creatorRouter.post("/bank/tip", requireCreator, async (req, res) => {
  const { toUsername, amount } = req.body as { toUsername?: string; amount?: number };
  if (!toUsername || typeof toUsername !== "string" || !amount || amount <= 0) {
    res.status(400).json({ error: "toUsername and amount > 0 required" });
    return;
  }

  try {
    const [creator] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      accountType: usersTable.accountType,
      promoBalance: usersTable.promoBalance,
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    if (!creator) { res.status(404).json({ error: "User not found" }); return; }
    if (creator.accountType !== "creator") {
      res.status(403).json({ error: "Only creator accounts can send promo tips" });
      return;
    }
    if (parseFloat(creator.promoBalance) < amount) {
      res.status(400).json({ error: "Insufficient Creator Bank balance" });
      return;
    }

    const [target] = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.username, toUsername.trim()))
      .limit(1);
    if (!target) { res.status(404).json({ error: "Recipient not found" }); return; }
    if (target.id === creator.id) { res.status(400).json({ error: "Cannot tip yourself" }); return; }

    // Atomic: deduct creator promoBalance, credit recipient promoBalance
    await db.transaction(async (txn) => {
      await txn.update(usersTable)
        .set({ promoBalance: `${parseFloat(creator.promoBalance) - amount}` })
        .where(eq(usersTable.id, creator.id));
      await txn.update(usersTable)
        .set({ promoBalance: `${parseFloat((await txn.select({ p: usersTable.promoBalance }).from(usersTable).where(eq(usersTable.id, target.id)).limit(1))[0]?.p ?? "0") + amount}` })
        .where(eq(usersTable.id, target.id));
      await txn.insert(creatorBankTxnsTable).values({
        creatorId: creator.id,
        type: "promo_tip",
        amount: String(amount),
        toUserId: target.id,
        description: `Promo tip to @${target.username}`,
      });
    });

    req.log.info({ from: creator.username, to: target.username, amount }, "Creator promo tip sent");
    res.json({ success: true, newPromoBalance: parseFloat(creator.promoBalance) - amount });
  } catch (err) {
    req.log.error({ err }, "Creator bank tip error");
    res.status(500).json({ error: "Internal server error" });
  }
});
