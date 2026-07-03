import { Router } from "express";
import { db, usersTable, referralsTable } from "@workspace/db";
import { eq, and, count, sum, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

export const referralsRouter = Router();

// ── DGC Arcade Affiliate Tier System ─────────────────────────────────────────
// 13 public tiers (3 Bronze + 3 Silver + 3 Gold + 3 Platinum) + 1 private contract tier
// Tier is based on number of ACTIVE referrals (users who have deposited)
//
// Commission = % of monthly net casino profit (house win) from referred users
//
export interface Affiliatetier {
  tier: string;
  group: "Bronze" | "Silver" | "Gold" | "Platinum" | "Private";
  commissionRate: number;
  nextTierAt: number | null;
  color: string;
  emoji: string;
  isPrivate: boolean;
  description: string;
}

export function getReferralTier(activeCount: number): Affiliatetier {
  // Private / Contract tier (invite-only, negotiated rate — shown as locked)
  if (activeCount >= 200) return {
    tier: "Specialty", group: "Private", commissionRate: 0, nextTierAt: null,
    color: "#ff6aff", emoji: "🔒", isPrivate: true,
    description: "Contract-based. Invite only."
  };
  // Platinum III
  if (activeCount >= 100) return {
    tier: "Platinum III", group: "Platinum", commissionRate: 0.30, nextTierAt: 200,
    color: "#b9f2ff", emoji: "💠", isPrivate: false,
    description: "30% monthly commission"
  };
  // Platinum II
  if (activeCount >= 60) return {
    tier: "Platinum II", group: "Platinum", commissionRate: 0.25, nextTierAt: 100,
    color: "#c8e6ff", emoji: "💎", isPrivate: false,
    description: "25% monthly commission"
  };
  // Platinum I
  if (activeCount >= 35) return {
    tier: "Platinum I", group: "Platinum", commissionRate: 0.20, nextTierAt: 60,
    color: "#e5e4e2", emoji: "🏆", isPrivate: false,
    description: "20% monthly commission"
  };
  // Gold III — GOAT
  if (activeCount >= 20) return {
    tier: "Goat", group: "Gold", commissionRate: 0.15, nextTierAt: 35,
    color: "#ffd700", emoji: "🐐", isPrivate: false,
    description: "15% monthly commission"
  };
  // Gold II — Icon
  if (activeCount >= 12) return {
    tier: "Icon", group: "Gold", commissionRate: 0.12, nextTierAt: 20,
    color: "#ffc53d", emoji: "⭐", isPrivate: false,
    description: "12% monthly commission"
  };
  // Gold I — Pro
  if (activeCount >= 7) return {
    tier: "Pro", group: "Gold", commissionRate: 0.10, nextTierAt: 12,
    color: "#ffaa00", emoji: "🥇", isPrivate: false,
    description: "10% monthly commission"
  };
  // Silver III — Shark
  if (activeCount >= 4) return {
    tier: "Shark", group: "Silver", commissionRate: 0.08, nextTierAt: 7,
    color: "#a0cfff", emoji: "🦈", isPrivate: false,
    description: "8% monthly commission"
  };
  // Silver II — Whale
  if (activeCount >= 2) return {
    tier: "Whale", group: "Silver", commissionRate: 0.06, nextTierAt: 4,
    color: "#c0c0c0", emoji: "🐋", isPrivate: false,
    description: "6% monthly commission"
  };
  // Silver I — High Roller
  if (activeCount >= 1) return {
    tier: "High Roller", group: "Silver", commissionRate: 0.05, nextTierAt: 2,
    color: "#b0d0ff", emoji: "🎰", isPrivate: false,
    description: "5% monthly commission"
  };
  // Bronze III — Baller
  if (activeCount >= 0) {
    // sub-tiers within Bronze based on pending referrals concept — all start here
  }
  // Default: Bronze I — Hustler (0 active referrals)
  return {
    tier: "Hustler", group: "Bronze", commissionRate: 0.03, nextTierAt: 1,
    color: "#cd7f32", emoji: "🥉", isPrivate: false,
    description: "3% monthly commission"
  };
}

// All tiers in order — used for the tier ladder display
export const ALL_TIERS: Affiliatetier[] = [
  { tier: "Hustler",     group: "Bronze",  commissionRate: 0.03, nextTierAt: 1,   color: "#cd7f32", emoji: "🥉", isPrivate: false, description: "3% monthly commission" },
  { tier: "Grinder",     group: "Bronze",  commissionRate: 0.04, nextTierAt: 2,   color: "#c67a28", emoji: "💪", isPrivate: false, description: "4% monthly commission" },
  { tier: "Baller",      group: "Bronze",  commissionRate: 0.05, nextTierAt: 4,   color: "#b06520", emoji: "🔥", isPrivate: false, description: "5% monthly commission — upgrade to Silver" },
  { tier: "High Roller", group: "Silver",  commissionRate: 0.05, nextTierAt: 4,   color: "#b0d0ff", emoji: "🎰", isPrivate: false, description: "5% monthly commission" },
  { tier: "Whale",       group: "Silver",  commissionRate: 0.06, nextTierAt: 7,   color: "#c0c0c0", emoji: "🐋", isPrivate: false, description: "6% monthly commission" },
  { tier: "Shark",       group: "Silver",  commissionRate: 0.08, nextTierAt: 12,  color: "#a0cfff", emoji: "🦈", isPrivate: false, description: "8% monthly commission" },
  { tier: "Pro",         group: "Gold",    commissionRate: 0.10, nextTierAt: 12,  color: "#ffaa00", emoji: "🥇", isPrivate: false, description: "10% monthly commission" },
  { tier: "Icon",        group: "Gold",    commissionRate: 0.12, nextTierAt: 20,  color: "#ffc53d", emoji: "⭐", isPrivate: false, description: "12% monthly commission" },
  { tier: "Goat",        group: "Gold",    commissionRate: 0.15, nextTierAt: 35,  color: "#ffd700", emoji: "🐐", isPrivate: false, description: "15% monthly commission" },
  { tier: "Platinum I",  group: "Platinum",commissionRate: 0.20, nextTierAt: 60,  color: "#e5e4e2", emoji: "🏆", isPrivate: false, description: "20% monthly commission" },
  { tier: "Platinum II", group: "Platinum",commissionRate: 0.25, nextTierAt: 100, color: "#c8e6ff", emoji: "💎", isPrivate: false, description: "25% monthly commission" },
  { tier: "Platinum III",group: "Platinum",commissionRate: 0.30, nextTierAt: 200, color: "#b9f2ff", emoji: "💠", isPrivate: false, description: "30% monthly commission — max public" },
  { tier: "Specialty",   group: "Private", commissionRate: 0,    nextTierAt: null, color: "#ff6aff", emoji: "🔒", isPrivate: true,  description: "Contract-based. Invite only." },
];

// GET /api/referrals/tiers — public endpoint to display the tier ladder
referralsRouter.get("/tiers", (_req, res) => {
  res.json({ tiers: ALL_TIERS });
});

// GET /api/referrals/my-code
referralsRouter.get("/my-code", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select({ 
        id: usersTable.id, 
        username: usersTable.username, 
        referralCode: usersTable.referralCode,
        commissionRate: usersTable.commissionRate 
      })
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
    
    // If user has a custom commission rate (specialty creator), use it.
    // Otherwise, use the tier-based rate.
    const customRate = user.commissionRate ? parseFloat(user.commissionRate) : null;
    const finalCommissionRate = customRate !== null ? customRate : tier.commissionRate;
    const finalTierName = customRate !== null ? "Specialty" : tier.tier;
    const finalTierEmoji = customRate !== null ? "💠" : tier.emoji;
    const finalTierColor = customRate !== null ? "#b9f2ff" : tier.color;

    const siteUrl = process.env.SITE_URL ?? "";
    res.json({
      code,
      link: siteUrl ? `${siteUrl}?ref=${code}` : `/?ref=${code}`,
      tier: finalTierName,
      group: customRate !== null ? "Private" : tier.group,
      color: finalTierColor,
      emoji: finalTierEmoji,
      commissionRate: finalCommissionRate,
      commissionPct: Math.round(finalCommissionRate * 100),
      nextTierAt: tier.nextTierAt,
      description: tier.description,
      isPrivate: tier.isPrivate,
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
    const referrerId = req.user!.userId;

    // Fetch referrer's commission rate (specialty override or tier-based)
    const [referrer] = await db
      .select({ commissionRate: usersTable.commissionRate })
      .from(usersTable)
      .where(eq(usersTable.id, referrerId))
      .limit(1);

    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));

    const tier = getReferralTier(activeCount);
    const commissionRate = referrer?.commissionRate ? parseFloat(referrer.commissionRate) : tier.commissionRate;

    const rows = await db
      .select({
        id: referralsTable.id,
        referredUsername: usersTable.username,
        status: referralsTable.status,
        earnedAmount: referralsTable.earnedAmount,
        createdAt: referralsTable.createdAt,
        totalDeposited: usersTable.totalDeposited,
        totalWagered: usersTable.totalWageredAmount,
        totalWon: usersTable.totalWon,
      })
      .from(referralsTable)
      .innerJoin(usersTable, eq(referralsTable.referredId, usersTable.id))
      .where(eq(referralsTable.referrerId, referrerId))
      .orderBy(sql`${referralsTable.createdAt} DESC`)
      .limit(100);

    res.json(rows.map(r => {
      const wagered = parseFloat(r.totalWagered || "0");
      const won = parseFloat(r.totalWon || "0");
      const houseProfit = Math.max(0, wagered - won);
      return {
        id: r.id,
        username: r.referredUsername,
        status: r.status,
        earned: parseFloat(r.earnedAmount),
        joinedAt: r.createdAt.toISOString(),
        // ── Extended stats ──
        totalDeposited: parseFloat(r.totalDeposited || "0"),
        totalWagered: wagered,
        houseProfit: houseProfit,
        estimatedCommission: houseProfit * commissionRate,
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Referrals my-referrals error");
    res.status(500).json({ error: "Internal server error" });
  }
});
