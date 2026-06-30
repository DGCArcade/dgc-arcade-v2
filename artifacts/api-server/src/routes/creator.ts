import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, creatorBankTxnsTable, referralsTable, creatorLinkedAccountsTable, creatorMessagesTable, creatorMessageReadsTable, betsTable, transactionsTable } from "@workspace/db";
import { eq, and, desc, sum, count, or, inArray, sql, not } from "drizzle-orm";
import { requireAuth, signToken, requireCreator } from "../middlewares/auth.js";
import { getReferralTier } from "./referrals.js";

export const creatorRouter = Router();

creatorRouter.use(requireAuth);

const OWNER_USERNAME = "fanodgc";
function isProtectedAccount(u: { username?: string | null; role?: string | null }) {
  return u.role === "owner" || (u.username ?? "").toLowerCase() === OWNER_USERNAME;
}

async function formatUser(u: any) {
  const { getUserBalance } = await import("../lib/balance-service.js");
  const { totalBalance } = await getUserBalance(u.id);

  return {
    id: u.id,
    username: u.username,
    role: u.role,
    accountType: u.accountType,
    balance: totalBalance,
    promoBalance: parseFloat(u.promoBalance ?? "0"),
    vaultBalance: parseFloat(u.vaultBalance ?? "0"),
  };
}

// GET /api/creator/dashboard — creators only
creatorRouter.get("/dashboard", requireCreator, async (req, res) => {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        accountType: usersTable.accountType,
        promoBalance: usersTable.promoBalance,
        vaultBalance: usersTable.vaultBalance,
        referralCode: usersTable.referralCode,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [{ activeCount }] = await db.select({ activeCount: count() })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, user.id), eq(referralsTable.status, "active")));
    const [{ pendingCount }] = await db.select({ pendingCount: count() })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, user.id), eq(referralsTable.status, "pending")));
    const [{ totalEarned }] = await db.select({ totalEarned: sum(referralsTable.earnedAmount) })
      .from(referralsTable)
      .where(eq(referralsTable.referrerId, user.id));

    const [specialty] = await db.select({ 
      commissionRate: usersTable.commissionRate, 
      displayName: usersTable.displayName 
    }).from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

    const tier = getReferralTier(activeCount);
    
    // Override with specialty rates if set
    const commissionRate = specialty?.commissionRate ? parseFloat(specialty.commissionRate) : tier.commissionRate;
    const displayName = specialty?.displayName || user.username;

    const code = user.referralCode ?? `DGC${user.id}`;
    const siteUrl = process.env.SITE_URL ?? "";

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

    let realWalletBalance = 0;
    try {
      const { getUserBalance } = await import("../lib/balance-service.js");
      const bal = await getUserBalance(user.id);
      realWalletBalance = bal.totalBalance;
    } catch {
      realWalletBalance = 0;
    }

    res.json({
      username: user.username,
      displayName: displayName,
      accountType: user.accountType,
      balance: realWalletBalance, // Spendable/Withdrawable money
      promoBalance: parseFloat(user.promoBalance ?? "0"), // House credits (casino balance)
      vaultBalance: parseFloat(user.vaultBalance ?? "0"),
      referralCode: code,
      referralLink: siteUrl ? `${siteUrl}?ref=${code}` : `/?ref=${code}`,
      tier: specialty?.commissionRate ? "Specialty" : tier.tier,
      group: specialty?.commissionRate ? "Partner" : tier.group,
      color: specialty?.commissionRate ? "#ec4899" : tier.color,
      emoji: specialty?.commissionRate ? "💎" : tier.emoji,
      commissionRate: commissionRate,
      commissionPct: Math.round(commissionRate * 100),
      nextTierAt: tier.nextTierAt,
      description: tier.description,
      isPrivate: tier.isPrivate,
      activeReferrals: activeCount,
      pendingReferrals: pendingCount,
      totalCommissionEarned: parseFloat(totalEarned ?? "0"),
      bankHistory: bankHistory.map(h => ({
        id: h.id,
        type: h.type,
        amount: parseFloat(h.amount ?? "0"),
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

// POST /api/creator/request-payout — creators only
creatorRouter.post("/request-payout", requireCreator, async (req, res) => {
  const { coin, address, amount } = req.body as { coin?: string; address?: string; amount?: number };
  if (!coin || !address || !amount || amount <= 0) {
    res.status(400).json({ error: "coin, address, and amount > 0 required" });
    return;
  }

  try {
    const [user] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      accountType: usersTable.accountType,
      role: usersTable.role,
      promoBalance: usersTable.promoBalance,
      balance: usersTable.balance,
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const isSpecialtyCreator = user.accountType === "creator" || user.role === "creator";

    if (isSpecialtyCreator) {
      const available = parseFloat(user.promoBalance ?? "0");
      if (available < amount) {
        res.status(400).json({ error: "Insufficient commission balance" }); return;
      }
      if (coin === "platform") {
        await db.transaction(async (txn) => {
          await txn.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
          const [locked] = await txn
            .select({ promoBalance: usersTable.promoBalance, balance: usersTable.balance })
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1);
          const lockedPromo = parseFloat(locked?.promoBalance ?? "0");
          if (lockedPromo < amount) throw new Error("INSUFFICIENT_COMMISSION");
          await txn.update(usersTable).set({
            promoBalance: String(lockedPromo - amount),
            balance: String(parseFloat(locked?.balance ?? "0") + amount),
          }).where(eq(usersTable.id, user.id));
          await txn.insert(creatorBankTxnsTable).values({
            creatorId: user.id,
            type: "commission_payout",
            amount: String(amount),
            description: `Commission payout → platform wallet`,
          });
        });
      } else {
        await db.insert(creatorBankTxnsTable).values({
          creatorId: user.id,
          type: "payout_request",
          amount: String(amount),
          description: `Payout request → ${coin} ${address}`,
        });
      }
      res.json({ success: true, message: coin === "platform" ? "Deployed to your wallet." : "Payout request submitted. We will process it within 24h." });
    } else {
      await db.transaction(async (txn) => {
        await txn.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
        const earned = await txn.select({ total: sum(referralsTable.earnedAmount) })
          .from(referralsTable)
          .where(eq(referralsTable.referrerId, user.id));
        const totalEarned = parseFloat(String(earned[0]?.total ?? "0"));
        if (totalEarned <= 0) {
          throw new Error("NO_COMMISSION");
        }
        const [fresh] = await txn.select({ balance: usersTable.balance })
          .from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
        await txn.update(usersTable).set({
          balance: String(parseFloat(fresh?.balance ?? "0") + totalEarned),
        }).where(eq(usersTable.id, user.id));
        await txn.update(referralsTable)
          .set({ earnedAmount: "0" })
          .where(eq(referralsTable.referrerId, user.id));
        await txn.insert(creatorBankTxnsTable).values({
          creatorId: user.id,
          type: "commission_payout",
          amount: String(totalEarned),
          description: "Affiliate commission deployed to wallet",
        });
      });
      res.json({ success: true, message: "Commission deployed to your wallet." });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NO_COMMISSION") {
      res.status(400).json({ error: "No commission earned yet" });
      return;
    }
    if (err instanceof Error && err.message === "INSUFFICIENT_COMMISSION") {
      res.status(400).json({ error: "Insufficient commission balance" });
      return;
    }
    req.log.error({ err }, "Creator request-payout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatCurrencyServer(n: number) {
  return "$" + n.toFixed(2);
}

// POST /api/creator/bank/tip
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
    if (parseFloat(creator.promoBalance ?? "0") < amount) {
      res.status(400).json({ error: "Insufficient Creator Bank balance" });
      return;
    }

    const [target] = await db.select({ id: usersTable.id, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.username, toUsername.trim()))
      .limit(1);
    if (!target) { res.status(404).json({ error: "Recipient not found" }); return; }
    if (target.id === creator.id) { res.status(400).json({ error: "Cannot tip yourself" }); return; }

    await db.transaction(async (txn) => {
      await txn.update(usersTable)
        .set({ promoBalance: String(parseFloat(creator.promoBalance ?? "0") - amount) })
        .where(eq(usersTable.id, creator.id));
      const [tgt] = await txn.select({ p: usersTable.promoBalance }).from(usersTable).where(eq(usersTable.id, target.id)).limit(1);
      await txn.update(usersTable)
        .set({ promoBalance: String(parseFloat(tgt?.p ?? "0") + amount) })
        .where(eq(usersTable.id, target.id));
      await txn.insert(creatorBankTxnsTable).values({
        creatorId: creator.id,
        type: "promo_tip",
        amount: String(amount),
        toUserId: target.id,
        description: `Promo tip to @${target.username}`,
      });
    });

    res.json({ success: true, newPromoBalance: parseFloat(creator.promoBalance ?? "0") - amount });
  } catch (err) {
    req.log.error({ err }, "Creator bank tip error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/creator/link-account
// Creator links a personal (regular) account by providing its credentials
creatorRouter.post("/link-account", requireCreator, async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  try {
    const [caller] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      accountType: usersTable.accountType,
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    if (!caller || caller.accountType !== "creator") {
      res.status(403).json({ error: "Only creator accounts can link a personal account" });
      return;
    }

    const [personal] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      passwordHash: usersTable.passwordHash,
      accountType: usersTable.accountType,
      role: usersTable.role,
      balance: usersTable.balance,
      promoBalance: usersTable.promoBalance,
      vaultBalance: usersTable.vaultBalance,
    }).from(usersTable).where(eq(usersTable.username, username.trim())).limit(1);

    if (!personal) { res.status(404).json({ error: "Account not found" }); return; }
    if (personal.id === caller.id) { res.status(400).json({ error: "Cannot link your own account" }); return; }
    if (personal.accountType === "creator") { res.status(400).json({ error: "Cannot link another creator account" }); return; }
    if (isProtectedAccount(personal)) { res.status(403).json({ error: "Cannot link a protected account" }); return; }

    const passwordMatch = await bcrypt.compare(password, personal.passwordHash ?? "");
    if (!passwordMatch) { res.status(401).json({ error: "Incorrect password" }); return; }

    const [existing] = await db.select({ id: creatorLinkedAccountsTable.id })
      .from(creatorLinkedAccountsTable)
      .where(eq(creatorLinkedAccountsTable.creatorUserId, caller.id))
      .limit(1);

    if (existing) {
      await db.update(creatorLinkedAccountsTable)
        .set({ personalUserId: personal.id })
        .where(eq(creatorLinkedAccountsTable.id, existing.id));
    } else {
      await db.insert(creatorLinkedAccountsTable).values({
        creatorUserId: caller.id,
        personalUserId: personal.id,
      });
    }

    const token = signToken({
      userId: personal.id,
      username: personal.username,
      role: personal.role ?? "player",
    });

    res.json({
      success: true,
      personalToken: token,
      personalUser: await formatUser(personal),
    });
  } catch (err) {
    req.log.error({ err }, "Creator link-account error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/creator/linked-account — creators only
creatorRouter.get("/linked-account", requireCreator, async (req, res) => {
  try {
    const [link] = await db.select()
      .from(creatorLinkedAccountsTable)
      .where(eq(creatorLinkedAccountsTable.creatorUserId, req.user!.userId))
      .limit(1);

    if (!link) { res.json({ linked: false }); return; }

    const [personal] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      accountType: usersTable.accountType,
      balance: usersTable.balance,
    }).from(usersTable).where(eq(usersTable.id, link.personalUserId)).limit(1);

    if (!personal) { res.json({ linked: false }); return; }

    const { getUserBalance } = await import("../lib/balance-service.js");
    const { totalBalance } = await getUserBalance(personal.id);

    res.json({
      linked: true,
      personalUser: {
        id: personal.id,
        username: personal.username,
        role: personal.role,
        balance: totalBalance,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Creator linked-account error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/creator/check-linked-creator
// Called by personal accounts — checks if this user is a linked personal account for any creator
creatorRouter.get("/check-linked-creator", async (req, res) => {
  try {
    const [link] = await db.select({
      creatorUserId: creatorLinkedAccountsTable.creatorUserId,
    })
      .from(creatorLinkedAccountsTable)
      .where(eq(creatorLinkedAccountsTable.personalUserId, req.user!.userId))
      .limit(1);

    if (!link) { res.json({ hasCreatorAccount: false }); return; }

    const [creator] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      accountType: usersTable.accountType,
    }).from(usersTable).where(eq(usersTable.id, link.creatorUserId)).limit(1);

    if (!creator) { res.json({ hasCreatorAccount: false }); return; }

    res.json({
      hasCreatorAccount: true,
      creatorUser: {
        id: creator.id,
        username: creator.username,
        accountType: creator.accountType,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Creator check-linked-creator error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/creator/messages — creators only
creatorRouter.get("/messages", requireCreator, async (req, res) => {
  try {
    const msgs = await db.select()
      .from(creatorMessagesTable)
      .where(
        or(
          and(
            eq(creatorMessagesTable.recipientType, "direct"),
            eq(creatorMessagesTable.recipientId, req.user!.userId),
          ),
          eq(creatorMessagesTable.recipientType, "broadcast_all"),
          eq(creatorMessagesTable.recipientType, "broadcast_creators"),
        ),
      )
      .orderBy(desc(creatorMessagesTable.createdAt))
      .limit(100);

    const reads = await db.select({ messageId: creatorMessageReadsTable.messageId })
      .from(creatorMessageReadsTable)
      .where(eq(creatorMessageReadsTable.userId, req.user!.userId));

    const readSet = new Set(reads.map(r => r.messageId));

    res.json({
      messages: msgs.map(m => ({
        id: m.id,
        senderId: m.senderId,
        senderUsername: m.senderUsername,
        senderRole: m.senderRole,
        recipientType: m.recipientType,
        recipientId: m.recipientId,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
        read: readSet.has(m.id),
      })).reverse(),
    });
  } catch (err) {
    req.log.error({ err }, "Creator messages get error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/creator/messages/read — creators only
creatorRouter.post("/messages/read", requireCreator, async (req, res) => {
  const { messageIds } = req.body as { messageIds?: number[] };
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    res.status(400).json({ error: "messageIds array required" });
    return;
  }
  try {
    for (const messageId of messageIds) {
      await db.insert(creatorMessageReadsTable)
        .values({ messageId, userId: req.user!.userId })
        .onConflictDoNothing();
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Creator messages read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/creator/analytics — creators only
creatorRouter.get("/analytics", requireCreator, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const refs = await db
      .select({
        referredId: referralsTable.referredId,
        status: referralsTable.status,
        earnedAmount: referralsTable.earnedAmount,
      })
      .from(referralsTable)
      .where(eq(referralsTable.referrerId, userId));

    const registrations = refs.length;
    const ftds = refs.filter(r => r.status === "active").length;
    const totalCommission = refs.reduce(
      (s, r) => s + parseFloat(String(r.earnedAmount ?? "0")),
      0
    );

    if (refs.length === 0) {
      res.json({ registrations: 0, ftds: 0, deposits: 0, totalDeposited: 0, totalWagered: 0, revenue: 0, commission: 0 });
      return;
    }

    const referredIds = refs.map(r => r.referredId);

    // Deposits from referred users
    const [depStats] = await db
      .select({ cnt: count(), total: sum(transactionsTable.amount) })
      .from(transactionsTable)
      .where(
        and(
          inArray(transactionsTable.userId, referredIds),
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "completed")
        )
      );

    // Bets from referred users (wager + payout → house revenue)
    const [betStats] = await db
      .select({ totalWager: sum(betsTable.amount), totalPayout: sum(betsTable.payout) })
      .from(betsTable)
      .where(inArray(betsTable.userId, referredIds));

    const totalDeposited = parseFloat(String(depStats?.total ?? "0"));
    const depositCount = Number(depStats?.cnt ?? 0);
    const totalWagered = parseFloat(String(betStats?.totalWager ?? "0"));
    const totalPayout = parseFloat(String(betStats?.totalPayout ?? "0"));
    const revenue = Math.max(0, totalWagered - totalPayout);

    res.json({
      registrations,
      ftds,
      deposits: depositCount,
      totalDeposited,
      totalWagered,
      revenue,
      commission: totalCommission,
    });
  } catch (err) {
    req.log.error({ err }, "Creator analytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/creator/messages/unread-count — creators only
creatorRouter.get("/messages/unread-count", requireCreator, async (req, res) => {
  try {
    const msgs = await db.select({ id: creatorMessagesTable.id })
      .from(creatorMessagesTable)
      .where(
        or(
          and(
            eq(creatorMessagesTable.recipientType, "direct"),
            eq(creatorMessagesTable.recipientId, req.user!.userId),
          ),
          eq(creatorMessagesTable.recipientType, "broadcast_all"),
          eq(creatorMessagesTable.recipientType, "broadcast_creators"),
        ),
      );

    const reads = await db.select({ messageId: creatorMessageReadsTable.messageId })
      .from(creatorMessageReadsTable)
      .where(eq(creatorMessageReadsTable.userId, req.user!.userId));

    const readSet = new Set(reads.map(r => r.messageId));
    const unread = msgs.filter(m => !readSet.has(m.id)).length;

    res.json({ unread });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
