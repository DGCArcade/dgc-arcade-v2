import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable, creatorBankTxnsTable, referralsTable, creatorLinkedAccountsTable, creatorMessagesTable, creatorMessageReadsTable } from "@workspace/db";
import { eq, and, desc, sum, count, or, inArray, sql, not } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getReferralTier } from "./referrals.js";

export const creatorRouter = Router();

creatorRouter.use(requireAuth);

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme-secret";

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

// GET /api/creator/dashboard
creatorRouter.get("/dashboard", async (req, res) => {
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

    const tier = getReferralTier(activeCount);
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

    const { getUserBalance } = await import("../lib/balance-service.js");
    const { totalBalance } = await getUserBalance(user.id);

    res.json({
      username: user.username,
      accountType: user.accountType,
      balance: totalBalance,
      promoBalance: parseFloat(user.promoBalance ?? "0"),
      vaultBalance: parseFloat(user.vaultBalance ?? "0"),
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

// POST /api/creator/bank/tip
creatorRouter.post("/bank/tip", async (req, res) => {
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
creatorRouter.post("/link-account", async (req, res) => {
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

    const token = jwt.sign(
      { userId: personal.id, role: personal.role ?? "player" },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

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

// GET /api/creator/linked-account
// Returns info about this creator's linked personal account (if any)
creatorRouter.get("/linked-account", async (req, res) => {
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

// GET /api/creator/messages
// Creator inbox — DMs sent to them + broadcasts to all or creators
creatorRouter.get("/messages", async (req, res) => {
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

// POST /api/creator/messages/read
creatorRouter.post("/messages/read", async (req, res) => {
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

// GET /api/creator/messages/unread-count
creatorRouter.get("/messages/unread-count", async (req, res) => {
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
