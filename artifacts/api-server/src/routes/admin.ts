import { Router } from "express";
import crypto from "crypto";
import { db, usersTable, betsTable, transactionsTable, platformSettingsTable, tournamentsTable, tournamentEntriesTable, adminMessagesTable, creatorMessagesTable, creatorMessageReadsTable, fraudReviewsTable, referralsTable, userBalancesTable, creatorBankTxnsTable, slotThemesTable, adminAuditLogsTable, deviceHistoryTable, activityLogsTable } from "@workspace/db";
import { eq, desc, ilike, and, sql, count, or, gt, ne } from "drizzle-orm";
// Using native fetch available in Node.js 18+
import { requireAdmin } from "../middlewares/auth.js";
import { getPlatformSettings } from "../lib/platform-settings.js";
import { invalidatePublicGamesCache } from "./games.js";
import { logAudit } from "../services/audit.js";
import { recordLedger, recordLedgerStandalone } from "../services/ledger.js";
import { getUserBalance, creditBalance } from "../lib/balance-service.js";
import { getPlisioPayoutReadiness, sendPlisioPayout } from "../lib/plisio-payout.js";
import { getDailyWinLoss, getDailyWithdrawals, getDailyDeposits } from "../services/stats-service.js";
import { getCryptoPrice } from "../lib/price-service.js";
import {
  canCreditFromPlisioData,
  computePlisioCreditUsd,
  extractPlisioReceivedCrypto,
  extractPlisioSourceUsd,
} from "../lib/plisio-amounts.js";

// Rate limiting to prevent double-clicks and abuse
const requestTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS_PER_WINDOW = 1; // 1 request per second per action

function getRateLimitKey(userId: number, action: string): string {
  return `${userId}:${action}`;
}

function checkRateLimit(userId: number, action: string): boolean {
  const key = getRateLimitKey(userId, action);
  const now = Date.now();
  const timestamps = requestTimestamps.get(key) || [];
  
  // Remove old timestamps outside the window
  const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limited
  }
  
  recentTimestamps.push(now);
  requestTimestamps.set(key, recentTimestamps);
  return true; // Allowed
}

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// ── Owner identity ──
// There is exactly one platform owner, identified by username "fanodgc".
// Centralized here so owner checks never drift between username/role again.
const OWNER_USERNAME = "fanodgc";
async function callerIsOwner(req: { user?: { userId: number } }): Promise<boolean> {
  const [caller] = await db
    .select({ username: usersTable.username, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);
  return (caller?.username ?? "").toLowerCase() === OWNER_USERNAME || caller?.role === "owner";
}

// True if the target row is the protected platform owner. Matches by case-insensitive
// username OR the "owner" role so no mutation path can ever ban/demote/delete/modify it.
function isOwnerAccount(
  target: { username?: string | null; role?: string | null } | undefined | null,
): boolean {
  if (!target) return false;
  return target.role === "owner" || (target.username ?? "").toLowerCase() === OWNER_USERNAME;
}

// Generates a 10-digit DGC Bank PIN guaranteed not to collide with an existing one.
async function generateUniqueBankPin(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pin = String(crypto.randomInt(1000000000, 9999999999));
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.dgcBankPin, pin))
      .limit(1);
    if (!existing) return pin;
  }
  throw new Error("Unable to generate a unique DGC Bank PIN");
}

// ── DGC Bank PIN session gate ──
// The platform owner (fanodgc) has permanent, PIN-free access to the bank.
// All other admins must present a valid bank session token (from /verify-bank-pin).
async function requireBankSession(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  // Owner bypass — no PIN ever required for fanodgc
  const [caller] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);
  if ((caller?.username ?? "").toLowerCase() === OWNER_USERNAME) {
    next();
    return;
  }

  // Non-owner admins require a live bank session token
  const token = req.header("x-bank-session");
  if (!token) {
    res.status(401).json({ error: "DGC Bank locked. Enter your PIN to continue.", code: "BANK_LOCKED" });
    return;
  }
  const sessions = ((global as any).__bankSessions ??= {}) as Record<
    string,
    { userId: number; expiresAt: string }
  >;
  const sess = sessions[token];
  if (!sess) {
    res.status(401).json({ error: "DGC Bank locked. Enter your PIN to continue.", code: "BANK_LOCKED" });
    return;
  }
  if (new Date(sess.expiresAt).getTime() <= Date.now()) {
    delete sessions[token];
    res.status(401).json({ error: "DGC Bank session expired. Enter your PIN again.", code: "BANK_EXPIRED" });
    return;
  }
  if (sess.userId !== req.user!.userId) {
    res.status(403).json({ error: "Bank session does not match your account." });
    return;
  }
  next();
}


function getSiteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  }
  return "";
}

// GET /api/admin/activity-logs — full platform audit trail (bets, deposits, withdrawals, logins, visitors)
adminRouter.get("/activity-logs", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const username = typeof req.query.username === "string" ? req.query.username : undefined;
  const actorType = typeof req.query.actorType === "string" ? req.query.actorType : undefined;

  try {
    const conditions = [];
    if (action) conditions.push(eq(activityLogsTable.action, action));
    if (username) conditions.push(ilike(activityLogsTable.username, `%${username}%`));
    if (actorType) conditions.push(eq(activityLogsTable.actorType, actorType));

    const rows = await db
      .select()
      .from(activityLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(activityLogsTable)
      .where(conditions.length ? and(...conditions) : undefined);

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.username,
        visitorId: r.visitorId,
        actorType: r.actorType,
        action: r.action,
        ip: r.ip,
        fingerprint: r.fingerprint,
        amount: r.amount != null ? parseFloat(String(r.amount)) : null,
        currency: r.currency,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      total: Number(total),
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "Activity logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/users
adminRouter.get("/users", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        balance: usersTable.balance,
        role: usersTable.role,
        isBanned: usersTable.isBanned,
        totalBets: usersTable.totalBets,
        totalWon: usersTable.totalWon,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(search ? ilike(usersTable.username, `%${search}%`) : undefined)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .where(search ? ilike(usersTable.username, `%${search}%`) : undefined);

    const usersWithLiveBalances = await Promise.all(rows.map(async (u) => {
      const { totalBalance } = await getUserBalance(u.id);
      return {
        ...u,
        balance: totalBalance,
        totalWon: parseFloat(u.totalWon),
        createdAt: u.createdAt.toISOString(),
      };
    }));

    res.json({
      users: usersWithLiveBalances,
      total: Number(count),
    });
  } catch (err) {
    req.log.error({ err }, "Admin list users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/users/:id
adminRouter.get("/stats/daily-win-loss", async (req, res) => {
  const dateStr = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }

  try {
    const stats = await getDailyWinLoss(date, req.log);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Admin daily win/loss error");
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/stats/daily-withdrawals", async (req, res) => {
  const dateStr = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }

  try {
    const stats = await getDailyWithdrawals(date, req.log);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Admin daily withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/stats/daily-deposits", async (req, res) => {
  const dateStr = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    return;
  }
  try {
    const stats = await getDailyDeposits(date, req.log);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Admin daily deposits error");
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/bank/platform-summary", requireBankSession, async (req, res) => {
  try {
    const [staticSumRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(balance::numeric), 0)` })
      .from(usersTable);

    const [totalUsersRow] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(usersTable);

    const [activeTodayRow] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(usersTable)
      .where(sql`last_seen >= NOW() - INTERVAL '24 hours'`);

    const cryptoRows = await db
      .select({
        currency: userBalancesTable.currency,
        total: sql<string>`SUM(amount::numeric)`,
      })
      .from(userBalancesTable)
      .groupBy(userBalancesTable.currency);

    let cryptoUsdTotal = 0;
    for (const row of cryptoRows) {
      const price = await getCryptoPrice(row.currency);
      cryptoUsdTotal += parseFloat(row.total ?? "0") * price;
    }

    const totalPlatformBalance = parseFloat(staticSumRow.total ?? "0") + cryptoUsdTotal;

    res.json({
      totalPlatformBalance,
      totalUsers: totalUsersRow.cnt ?? 0,
      activeToday: activeTodayRow.cnt ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Platform summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/bank/user-balances", requireBankSession, async (req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.id));

    const usersWithBalance = await Promise.all(
      users.map(async (u) => {
        try {
          const { totalBalance, staticBalance, cryptoBalances } = await getUserBalance(u.id);
          return {
            id: u.id,
            username: u.username,
            role: u.role,
            staticBalance,
            cryptoBalances,
            totalBalance,
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
          };
        } catch {
          return {
            id: u.id,
            username: u.username,
            role: u.role,
            staticBalance: 0,
            cryptoBalances: [],
            totalBalance: 0,
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
          };
        }
      })
    );

    usersWithBalance.sort((a, b) => b.totalBalance - a.totalBalance);
    res.json({ users: usersWithBalance });
  } catch (err) {
    req.log.error({ err }, "User balances error");
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.post("/test-email", async (req, res) => {
  const { email, emailType = "welcome" } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  
  try {
    const {
      sendWelcomeEmail,
      sendLoginSecurityEmail,
      sendDepositEmail,
      sendWithdrawalEmail,
      sendEmailVerificationEmail,
      sendPasswordResetEmail,
      sendSuspiciousActivityEmail
    } = await import("../lib/mail-service.js");

    const testUsername = "TestUser";
    const testToken = "test-token-" + Date.now();
    const siteUrl = process.env.SITE_URL || "https://dgcarcade.com";

    switch (emailType) {
      case "welcome":
        await sendWelcomeEmail(email, testUsername, "player");
        break;
      case "login-security":
        await sendLoginSecurityEmail(
          email,
          testUsername,
          "192.168.1.1",
          "San Francisco, CA, USA",
          "Chrome on macOS"
        );
        break;
      case "deposit":
        await sendDepositEmail(
          email,
          testUsername,
          "1.5 BTC",
          "0x123abc456def789ghi"
        );
        break;
      case "withdrawal":
        await sendWithdrawalEmail(
          email,
          testUsername,
          "0.5 ETH",
          "0xabcdef123456789ghijklmnop"
        );
        break;
      case "verification":
        await sendEmailVerificationEmail(
          email,
          testUsername,
          "ABC12345"
        );
        break;
      case "password-reset":
        await sendPasswordResetEmail(
          email,
          testUsername,
          `${siteUrl}/reset-password?token=${testToken}`
        );
        break;
      case "suspicious":
        await sendSuspiciousActivityEmail(
          email,
          testUsername,
          "Multiple failed login attempts from Moscow, Russia (Firefox on Windows)",
          `${siteUrl}/security`
        );
        break;
      default:
        return res.status(400).json({ 
          error: "Invalid email type",
          availableTypes: [
            "welcome",
            "login-security",
            "deposit",
            "withdrawal",
            "verification",
            "password-reset",
            "suspicious"
          ]
        });
    }

    return res.json({ 
      success: true, 
      message: `Test ${emailType} email sent successfully to ${email}!` 
    });
  } catch (err: any) {
    return res.status(500).json({ 
      success: false, 
      error: err.message, 
      details: "Check your Resend API key and domain configuration." 
    });
  }
});

adminRouter.get("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const callerIsOwnerUser = await callerIsOwner(req);
    const targetIsOwner = isOwnerAccount(user);

    const { totalBalance, cryptoBalances } = await getUserBalance(userId);

    const bets = await db
      .select()
      .from(betsTable)
      .where(eq(betsTable.userId, userId))
      .orderBy(desc(betsTable.createdAt))
      .limit(20);

    const transactions = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(20);

    const deviceHistory = await db
      .select()
      .from(deviceHistoryTable)
      .where(eq(deviceHistoryTable.userId, userId))
      .orderBy(desc(deviceHistoryTable.lastSeen))
      .limit(50);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        balance: totalBalance,
        cryptoBalances,
        role: user.role,
        isBanned: user.isBanned,
        totalBets: user.totalBets,
        totalWon: parseFloat(user.totalWon),
        createdAt: user.createdAt.toISOString(),
        accountType: user.accountType,
        withdrawalsEnabled: user.withdrawalsEnabled,
        promoBalance: parseFloat(user.promoBalance ?? "0"),
        totalDeposited: parseFloat(user.totalDeposited ?? "0"),
        totalWageredAmount: parseFloat(user.totalWageredAmount ?? "0"),
        // ── Specialty Creator Fields ──
        commissionRate: user.commissionRate != null ? parseFloat(user.commissionRate) : null,
        commissionPct: user.commissionRate != null ? Math.round(parseFloat(user.commissionRate) * 100) : null,
        displayName: user.displayName ?? null,
        // ── Location / geo (redacted for owner account unless caller is owner) ──
        locationVerified: targetIsOwner && !callerIsOwnerUser ? undefined : user.locationVerified,
        geoIp: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoIp,
        geoCountry: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoCountry,
        geoCountryCode: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoCountryCode,
        geoRegion: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoRegion,
        geoCity: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoCity,
        geoHostname: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoHostname,
        geoAsn: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoAsn,
        geoIsp: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoIsp,
        geoLat: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoLat,
        geoLon: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoLon,
        geoTimezone: targetIsOwner && !callerIsOwnerUser ? undefined : user.geoTimezone,
        vpnDetected: targetIsOwner && !callerIsOwnerUser ? undefined : user.vpnDetected,
        vpnProvider: targetIsOwner && !callerIsOwnerUser ? undefined : user.vpnProvider,
        // ── Device (redacted for owner account unless caller is owner) ──
        deviceFingerprint: targetIsOwner && !callerIsOwnerUser ? undefined : user.deviceFingerprint,
        deviceName: targetIsOwner && !callerIsOwnerUser ? undefined : user.deviceName,
        deviceOs: targetIsOwner && !callerIsOwnerUser ? undefined : user.deviceOs,
        deviceBrowser: targetIsOwner && !callerIsOwnerUser ? undefined : user.deviceBrowser,
        deviceType: targetIsOwner && !callerIsOwnerUser ? undefined : user.deviceType,
      },
      deviceHistory: targetIsOwner && !callerIsOwnerUser ? [] : deviceHistory.map((d) => ({
        id: d.id,
        fingerprint: d.fingerprint,
        deviceName: d.deviceName,
        deviceOs: d.deviceOs,
        deviceBrowser: d.deviceBrowser,
        deviceType: d.deviceType,
        ip: d.ip,
        country: d.country,
        city: d.city,
        vpnDetected: d.vpnDetected,
        vpnProvider: d.vpnProvider,
        firstSeen: d.firstSeen?.toISOString(),
        lastSeen: d.lastSeen?.toISOString(),
        loginCount: d.loginCount,
      })),
      bets: bets.map((b) => ({
        id: b.id,
        gameId: b.gameId,
        amount: parseFloat(b.amount),
        payout: parseFloat(b.payout),
        outcome: b.won ? "win" : "loss",
        createdAt: b.createdAt.toISOString(),
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        currency: t.currency,
        status: t.status,
        address: t.address,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin get user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/create-user  — create a new user or admin
adminRouter.post("/create-user", async (req, res) => {
  const { username, password, email, role, balance } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    role?: string;
    balance?: number;
  };

  if (!username || !password || !email) {
    res.status(400).json({ error: "Username, password, and email are required" });
    return;
  }
  if (!email.includes("@")) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (username.toLowerCase() === "fanodgc") {
    res.status(403).json({ error: "That username is reserved." });
    return;
  }
  // Only the owner may create admin accounts (and therefore see a new admin's PIN).
  if (role === "admin" && !(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can create admin accounts." });
    return;
  }
  // Only the owner may seed accounts with a non-zero balance.
  if (typeof balance === "number" && balance > 0 && !(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can create users with a starting balance." });
    return;
  }

  try {
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);
    const isAdminRole = role === "admin";
    // New admins get a unique DGC Bank PIN immediately so they can be granted access.
    const newAdminPin = isAdminRole ? await generateUniqueBankPin() : null;
    const [created] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash,
        email,
        role: isAdminRole ? "admin" : "player",
        balance: String(balance ?? 0),
        dgcBankPin: newAdminPin,
        dgcBankPinRevealed: false,
      })
      .returning();

    res.json({
      id: created.id,
      username: created.username,
      role: created.role,
      balance: parseFloat(created.balance),
      ...(newAdminPin ? { newAdminPin } : {}),
    });
  } catch (err: unknown) {
    // Drizzle wraps the underlying pg error, so the unique-violation signal
    // (code 23505 / "unique constraint") lives on err.cause, not err.message.
    const e = err as { message?: string; code?: string; cause?: { message?: string; code?: string } };
    const combined = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
    const code = e.code ?? e.cause?.code;
    if (code === "23505" || combined.includes("unique")) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    req.log.error({ err }, "Admin create user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/create-specialty-creator — owner only
adminRouter.post("/create-specialty-creator", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can create specialty creator accounts." });
    return;
  }

  const { username, password, email, displayName, platform, platformHandle, promoBalance, customCommissionPct, notes } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    displayName?: string;
    platform?: string;
    platformHandle?: string;
    promoBalance?: number;
    customCommissionPct?: number;
    notes?: string;
  };

  if (!username || !password || !email) {
    res.status(400).json({ error: "Username, password, and email are required" });
    return;
  }
  if (!email.includes("@")) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (username.toLowerCase() === "fanodgc") {
    res.status(403).json({ error: "That username is reserved." });
    return;
  }

  try {
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);
    const promo = String(promoBalance ?? 0);

    const [created] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash,
        email,
        role: "creator",
        accountType: "creator",
        balance: promo,
        promoBalance: promo,
        withdrawalsEnabled: false,
        // commissionRate stored as decimal fraction (0.10 = 10%).
        // customCommissionPct is expected as a percentage (e.g. 10 = 10%).
        commissionRate: String((customCommissionPct ?? 10) / 100),
        displayName: displayName || null,
      })
      .returning();

    // Send verification email via Resend
    if (created.email) {
      try {
        const { sendEmailVerificationEmail } = await import("../lib/mail-service");
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.update(usersTable).set({ 
          emailVerificationCode: verificationCode, 
          emailVerificationExpiresAt: expiresAt 
        }).where(eq(usersTable.id, created.id));
        void sendEmailVerificationEmail(created.email, created.username, verificationCode);
      } catch (mailErr) { req.log.warn({ mailErr }, 'Verification email sending failed on admin creator creation'); }
    }

    res.json({
      id: created.id,
      username: created.username,
      role: created.role,
      accountType: created.accountType,
      promoBalance: parseFloat(created.promoBalance ?? "0"),
      displayName: displayName ?? null,
      platform: platform ?? null,
      platformHandle: platformHandle ?? null,
      customCommissionPct: customCommissionPct ?? 10,
      notes: notes ?? null,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string; cause?: { message?: string; code?: string } };
    const combined = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
    const code = e.code ?? e.cause?.code;
    if (code === "23505" || combined.includes("unique")) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    req.log.error({ err }, "Admin create specialty creator error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/users/:id
adminRouter.patch("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { balance, role, isBanned, currency = "USD" } = req.body as {
    balance?: number;
    role?: string;
    isBanned?: boolean;
    currency?: string;
  };

  // Protect superadmin
  const [target] = await db
    .select({ username: usersTable.username, role: usersTable.role, dgcBankPin: usersTable.dgcBankPin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (isOwnerAccount(target)) {
    res.status(403).json({ error: "This account is protected and cannot be modified." });
    return;
  }
  // Only the owner can change a user's role (promote/demote admin status).
  if (role !== undefined && role !== target?.role && !(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can change a user's role." });
    return;
  }
  // Only the owner can directly set balances — prevents admin balance inflation.
  if (balance !== undefined && !(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can set user balances directly." });
    return;
  }

  try {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (balance !== undefined && currency === "USD") updates.balance = String(balance);
    if (role !== undefined) updates.role = role;
    if (isBanned !== undefined) updates.isBanned = isBanned;

    // Sync accountType with role for creator accounts
    if (role === "creator") updates.accountType = "creator";
    if (role === "player") updates.accountType = "normal";

    // Keep DGC Bank PINs in sync with admin status, regardless of promotion path.
    if (role === "admin" && target && !target.dgcBankPin) {
      // Promoting to admin and no PIN yet — generate a unique one.
      updates.dgcBankPin = await generateUniqueBankPin();
      updates.dgcBankPinRevealed = false;
    } else if (role === "player" && target?.role === "admin") {
      // Demoting an admin — revoke their bank PIN.
      updates.dgcBankPin = null;
      updates.dgcBankPinRevealed = false;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    let updatedUser: any;
    if (Object.keys(updates).length > 0) {
      [updatedUser] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, userId))
        .returning();
    } else {
      [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    }

    if (!updatedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Handle crypto balance update if specified
    if (balance !== undefined && currency !== "USD") {
      const [oldCrypto] = await db.select().from(userBalancesTable).where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, currency))).limit(1);
      const oldAmt = oldCrypto ? parseFloat(oldCrypto.amount) : 0;
      
      await db.insert(userBalancesTable).values({
        userId,
        currency,
        amount: String(balance),
      }).onConflictDoUpdate({
        target: [userBalancesTable.userId, userBalancesTable.currency],
        set: { amount: String(balance) },
      });

      recordLedgerStandalone({
        userId,
        amount: balance - oldAmt,
        balanceBefore: oldAmt,
        balanceAfter: balance,
        reason: "admin_adjustment",
        note: `Admin set ${currency} balance to ${balance} by admin #${req.user!.userId}`,
      }).catch(() => {});
    }

    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      balance: parseFloat(updatedUser.balance),
      role: updatedUser.role,
      isBanned: updatedUser.isBanned,
      totalBets: updatedUser.totalBets,
      totalWon: parseFloat(updatedUser.totalWon),
    });
  } catch (err) {
    req.log.error({ err }, "Admin update user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/users/:id
adminRouter.delete("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const adminId = req.user!.userId;

  // Rate limiting: prevent double-clicks
  if (!checkRateLimit(adminId, `delete-user-${userId}`)) {
    res.status(429).json({ error: "Too many requests. Please wait before trying again." });
    return;
  }

  if (userId === adminId) {
    res.status(400).json({ error: "Cannot delete your own admin account" });
    return;
  }

  if (isNaN(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  try {
    // Protect superadmin
    const [target] = await db.select({ username: usersTable.username, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (isOwnerAccount(target)) {
      res.status(403).json({ error: "This account is protected and cannot be deleted." });
      return;
    }

    // Delete all related data in correct order
    await db.delete(transactionsTable).where(eq(transactionsTable.userId, userId));
    await db.delete(betsTable).where(eq(betsTable.userId, userId));
    await db.delete(userBalancesTable).where(eq(userBalancesTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    // Log the action
    await logAudit({
      adminId,
      adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, adminId)).limit(1))[0]?.username || "unknown",
      action: "delete_user",
      targetType: "user",
      targetId: userId,
      note: `Deleted user: ${target.username}`,
    });

    res.json({ success: true, message: `User ${target.username} deleted successfully` });
  } catch (err: any) {
    req.log.error({ err }, "Admin delete user error");
    res.status(500).json({ error: "Failed to delete user", details: err.message });
  }
});

// POST /api/admin/users/:id/reset — zero out a single user's balance, stats, and history
adminRouter.post("/users/:id/reset", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const [target] = await db
    .select({ username: usersTable.username, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (isOwnerAccount(target)) { res.status(403).json({ error: "This account is protected and cannot be reset." }); return; }

  try {
    const { blackjackHandsTable, minesSessionsTable, dailyBonusClaimsTable } = await import("@workspace/db");

    await db.transaction(async (tx) => {
      await tx.delete(betsTable).where(eq(betsTable.userId, userId));
      await tx.delete(transactionsTable).where(eq(transactionsTable.userId, userId));
      await tx.delete(blackjackHandsTable).where(eq(blackjackHandsTable.userId, userId));
      await tx.delete(minesSessionsTable).where(eq(minesSessionsTable.userId, userId));
      await tx.delete(dailyBonusClaimsTable).where(eq(dailyBonusClaimsTable.userId, userId));
      await tx.delete(userBalancesTable).where(eq(userBalancesTable.userId, userId));
      await tx.update(usersTable).set({
        balance: "0",
        promoBalance: "0",
        vaultBalance: "0",
        totalBets: 0,
        totalWon: "0",
        totalWageredAmount: "0",
        totalDeposited: "0",
        wagerRequirement: "0",
        rakebackClaimed: "0",
      }).where(eq(usersTable.id, userId));
    });

    await logAudit({
      adminId: req.user!.userId,
      adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
      action: "user.reset",
      targetType: "user",
      targetId: userId,
      oldValue: { username: target.username },
      newValue: { balance: 0, stats: "reset" },
      ip: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin reset user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/transactions
adminRouter.get("/transactions", requireBankSession, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  try {
    const conditions = [];
    if (status) conditions.push(eq(transactionsTable.status, status));
    if (type) conditions.push(eq(transactionsTable.type, type));

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const rows = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        username: usersTable.username,
        type: transactionsTable.type,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        status: transactionsTable.status,
        address: transactionsTable.address,
        txHash: transactionsTable.txHash,
        plisioTrackId: transactionsTable.plisioTrackId,
        orderId: transactionsTable.orderId,
        createdAt: transactionsTable.createdAt,
        metadata: transactionsTable.metadata,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      transactions: rows.map((t) => {
        // Parse deposit enrichment fields from stored metadata JSON
        let plisioReceivedCrypto: number | null = null;
        let plisioReceivedUsd: number | null = null;
        let plisioSourceUsd: number | null = null;
        if (t.type === "deposit" && t.metadata) {
          try {
            const meta = JSON.parse(t.metadata);
            plisioReceivedCrypto = meta.received_amount_crypto != null ? parseFloat(String(meta.received_amount_crypto)) : null;
            plisioReceivedUsd = meta.received_amount_usd != null ? parseFloat(String(meta.received_amount_usd)) : null;
            plisioSourceUsd = meta.requested_amount_usd != null ? parseFloat(String(meta.requested_amount_usd)) : null;
          } catch { /* ignore parse errors */ }
        }
        const { metadata: _meta, ...rest } = t;
        return {
          ...rest,
          amount: parseFloat(t.amount),
          createdAt: t.createdAt.toISOString(),
          ...(t.type === "deposit" ? { plisioReceivedCrypto, plisioReceivedUsd, plisioSourceUsd } : {}),
        };
      }),
      total: Number(totalCount?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Admin list transactions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/transactions/:id  — approve or reject a withdrawal
// Requires an unlocked DGC Bank session — approvals only happen inside the bank.
adminRouter.patch("/transactions/:id", requireBankSession, async (req, res) => {
  const txId = parseInt(String(req.params.id), 10);
  const { status } = req.body as { status: "completed" | "failed" };

  if (!["completed", "failed"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);

    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (tx.status !== "pending") {
      res.status(400).json({ error: "Transaction is not pending" });
      return;
    }

    // Reject a withdrawal → refund the held balance. Idempotent + transactional: the
    // guarded status flip (pending -> failed) gates the refund inside one DB transaction,
    // so concurrent/duplicate rejects block on the row lock and can't double-refund.
    if (status === "failed" && tx.type === "withdrawal") {
      const refundAmount = parseFloat(tx.amount);
      const refunded = await db.transaction(async (txn) => {
        const flipped = await txn
          .update(transactionsTable)
          .set({ status: "failed" })
          .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "pending")))
          .returning({ id: transactionsTable.id });
        if (flipped.length === 0) return false;
        await creditBalance(tx.userId, refundAmount, tx.currency ?? "USD", txn);
        const { totalBalance } = await getUserBalance(tx.userId);
        const balanceAfter = totalBalance;
        await recordLedger(txn, {
          userId: tx.userId,
          amount: refundAmount,
          balanceBefore: balanceAfter - refundAmount,
          balanceAfter,
          reason: "withdrawal_refund",
          referenceId: txId,
          referenceType: "transaction",
          note: `Withdrawal rejected by admin #${req.user!.userId}`,
        });
        return true;
      });
      if (!refunded) {
        res.status(400).json({ error: "Transaction is not pending" });
        return;
      }
      // Audit log
      logAudit({
        adminId: req.user!.userId,
        adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
        action: "reject_withdrawal",
        targetType: "transaction",
        targetId: txId,
        oldValue: { status: "pending", amount: refundAmount },
        newValue: { status: "failed" },
        ip: req.ip,
        note: `Refunded $${refundAmount} to user #${tx.userId}`,
      }).catch(() => {});
      res.json({ id: txId, status: "failed", amount: refundAmount });
      return;
    }

    // A withdrawal must have a payout address; never silently mark it completed
    // without sending funds. Fail loudly so the owner can reject + refund instead.
    if (status === "completed" && tx.type === "withdrawal" && !tx.address) {
      res.status(400).json({
        error: "This withdrawal has no payout address; funds were NOT sent. Reject it to refund the user.",
      });
      return;
    }

    // If approving a withdrawal, send via Plisio payout API (shared helper)
    if (status === "completed" && tx.type === "withdrawal" && tx.address) {
      const result = await sendPlisioPayout(txId, req.log);
      switch (result.outcome) {
        case "completed":
          // Audit log — withdrawal approved via Plisio
          logAudit({
            adminId: req.user!.userId,
            adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
            action: "approve_withdrawal",
            targetType: "transaction",
            targetId: txId,
            oldValue: { status: "pending", amount: parseFloat(tx.amount) },
            newValue: { status: "completed", txHash: result.txHash },
            ip: req.ip,
          }).catch(() => {});
          res.json({ id: result.id, status: "completed", amount: result.amount, txHash: result.txHash });
          return;
        case "needs_review":
          res.status(502).json({ error: result.message });
          return;
        case "reverted_pending":
          res.status(502).json({ error: result.message });
          return;
        case "provider_insufficient_funds":
          res.status(409).json({
            error: result.message,
            providerBalance: {
              currency: result.currency,
              requiredCrypto: result.requiredCrypto,
              availableCrypto: result.availableCrypto,
              requiredUsd: result.requiredUsd,
            },
          });
          return;
        case "already_processing":
          res.status(409).json({ error: "This withdrawal is already being processed." });
          return;
        case "no_key":
          res.status(500).json({ error: "Plisio API key not configured. Payout NOT sent." });
          return;
        case "no_address":
          res.status(400).json({ error: "This withdrawal has no payout address." });
          return;
      }
    }

    // Default: update status without Plisio call
    const [updated] = await db
      .update(transactionsTable)
      .set({ status })
      .where(eq(transactionsTable.id, txId))
      .returning();

    res.json({
      id: updated.id,
      status: updated.status,
      amount: parseFloat(updated.amount),
    });
  } catch (err) {
    req.log.error({ err }, "Admin update transaction error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// Look up a single Plisio operation by id to learn whether a payout actually went out. Used by
// the reconcile flow as a server-side safety check before refunding/requeuing money (and surfaced
// to the owner in the UI). Returns sent=true if Plisio reports it completed, sent=false if Plisio
// reports it failed/cancelled, sent=null if pending/unknown, and found=false when there is no
// reference or Plisio could not confirm. Only POSITIVE evidence (sent true/null) is acted on as a
// hard stop — an inconclusive result falls back to the owner's dashboard-based judgement.
type PlisioOpStatus = { found: boolean; status?: string; sent: boolean | null; reason?: string };
async function fetchPlisioOperationStatus(operationId: string): Promise<PlisioOpStatus> {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
  if (!PLISIO_KEY) return { found: false, sent: null, reason: "no_key" };
  if (!operationId) return { found: false, sent: null, reason: "no_reference" };
  try {
    const params = new URLSearchParams({ api_key: PLISIO_KEY });
    const resp = await fetch(
      `https://api.plisio.net/api/v1/operations/${encodeURIComponent(operationId)}?${params.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(15_000) },
    );
    const data = (await resp.json()) as { status?: string; data?: { status?: string } };
    if (data.status !== "success" || !data.data) {
      return { found: false, sent: null, reason: "not_found" };
    }
    const opStatus = String(data.data.status ?? "").toLowerCase();
    let sent: boolean | null;
    if (opStatus === "completed") sent = true;
    else if (opStatus === "error" || opStatus === "cancelled" || opStatus === "canceled") sent = false;
    else sent = null; // pending / new / unknown — not yet confirmed, unsafe to refund/requeue
    return { found: true, status: opStatus, sent };
  } catch {
    return { found: false, sent: null, reason: "lookup_failed" };
  }
}

// ── RECONCILE: withdrawals stuck in an ambiguous state ──────────────────────
// A withdrawal lands in `needs_review` when a Plisio payout outcome was ambiguous (network
// error, non-JSON, or an error that still returned a payout reference), or it can be left
// in `processing` if the server died mid-payout. These rows have ALREADY had the user's
// balance deducted, so the owner must verify in Plisio and resolve them explicitly.

// GET /api/admin/transactions/needs-review — the reconcile queue
adminRouter.get("/transactions/needs-review", requireBankSession, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        type: transactionsTable.type,
        status: transactionsTable.status,
        address: transactionsTable.address,
        txHash: transactionsTable.txHash,
        createdAt: transactionsTable.createdAt,
        updatedAt: transactionsTable.updatedAt,
        username: usersTable.username,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(
        and(
          eq(transactionsTable.type, "withdrawal"),
          // `processing` rows younger than 5 min may be a payout in flight RIGHT NOW —
          // exclude them so we never surface (or let the owner touch) an in-progress payout.
          sql`(${transactionsTable.status} = 'needs_review' OR (${transactionsTable.status} = 'processing' AND ${transactionsTable.updatedAt} < now() - interval '5 minutes'))`,
        ),
      )
      .orderBy(desc(transactionsTable.updatedAt))
      .limit(100);
    res.json({ withdrawals: rows });
  } catch (err) {
    req.log.error({ err }, "Needs-review withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/transactions/:id/plisio-status — ask Plisio directly whether this payout went
// out, so the owner can decide how to reconcile without leaving for the Plisio dashboard. Only
// works when we retained a payout reference (txHash); otherwise reports found:false.
adminRouter.get("/transactions/:id/plisio-status", requireBankSession, async (req, res) => {
  const txId = parseInt(String(req.params.id), 10);
  if (Number.isNaN(txId)) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }
  try {
    const [tx] = await db
      .select({ id: transactionsTable.id, txHash: transactionsTable.txHash, type: transactionsTable.type })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);
    if (!tx || tx.type !== "withdrawal") {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }
    if (!tx.txHash) {
      res.json({ found: false, sent: null, reason: "no_reference", operationId: null });
      return;
    }
    const status = await fetchPlisioOperationStatus(tx.txHash);
    res.json({ ...status, operationId: tx.txHash });
  } catch (err) {
    req.log.error({ err }, "Plisio operation status lookup error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/transactions/:id/reconcile — resolve an ambiguous withdrawal
// Body: { resolution: "mark_completed" | "cancel_refund" | "requeue", txHash?, confirmedNotSent? }
adminRouter.post("/transactions/:id/reconcile", requireBankSession, async (req, res) => {
  const txId = parseInt(String(req.params.id), 10);
  if (Number.isNaN(txId)) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }
  const { resolution, txHash, confirmedNotSent } = req.body as {
    resolution?: string;
    txHash?: string;
    confirmedNotSent?: boolean;
  };
  if (!["mark_completed", "cancel_refund", "requeue"].includes(resolution ?? "")) {
    res.status(400).json({ error: "Invalid resolution" });
    return;
  }
  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);
    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    if (tx.type !== "withdrawal") {
      res.status(400).json({ error: "Only withdrawals can be reconciled" });
      return;
    }
    if (tx.status !== "needs_review" && tx.status !== "processing") {
      res.status(400).json({ error: "This withdrawal is not awaiting review." });
      return;
    }
    // A 'processing' row may be an in-flight payout at Plisio right now. Only allow it to be
    // reconciled once it's been stuck long enough (>5 min) that the payout call has certainly
    // returned — mirrors the GET queue filter — so we never resolve a payout Plisio is about
    // to confirm (which would risk a refund/cancel on money that actually went out).
    if (tx.status === "processing") {
      const updatedAtMs = tx.updatedAt ? new Date(tx.updatedAt).getTime() : 0;
      if (Date.now() - updatedAtMs < 5 * 60 * 1000) {
        res.status(409).json({
          error:
            "This payout may still be in flight (processing for under 5 minutes). Wait until it appears in the Needs Review list before reconciling.",
        });
        return;
      }
    }

    // Shared guard: only a row STILL reconcilable may be resolved — needs_review always, but a
    // 'processing' row only once it is older than 5 min (an in-flight payout is younger). Mirrors
    // the GET queue filter. Combined with RETURNING, every resolution is idempotent and
    // TOCTOU-safe — a duplicate or in-flight-racing request finds 0 rows and is rejected (409),
    // so there is no double refund / double state change / resolving a live payout.
    const reconcilable = sql`(${transactionsTable.status} = 'needs_review' OR (${transactionsTable.status} = 'processing' AND ${transactionsTable.updatedAt} < now() - interval '5 minutes'))`;

    // Server-side safety net (on top of the owner's dashboard check): the two resolutions that
    // move money on the assumption the payout did NOT go out — cancel_refund (refund) and requeue
    // (pay again) — are the double-pay/loss risk. When we retained a Plisio reference, ask Plisio
    // directly and HARD-STOP on positive evidence the payout went out (sent) or is still pending
    // (unconfirmed). A confirmed failure, a missing reference, or an unreachable Plisio is
    // inconclusive and falls through to the human-gated path below — we never auto-loosen.
    if ((resolution === "cancel_refund" || resolution === "requeue") && tx.txHash) {
      const op = await fetchPlisioOperationStatus(tx.txHash);
      if (op.found && op.sent === true) {
        req.log.warn({ txId, op }, "Reconcile blocked: Plisio reports payout was sent");
        res.status(409).json({
          error: 'Plisio shows this payout WAS sent. Do NOT cancel/refund or retry — use "Sent" to mark it completed.',
          plisio: op,
        });
        return;
      }
      if (op.found && op.sent === null) {
        req.log.warn({ txId, op }, "Reconcile blocked: Plisio payout still pending");
        res.status(409).json({
          error: `Plisio shows this payout is still '${op.status}'. Wait until it settles, then re-check before cancel/refund or retry.`,
          plisio: op,
        });
        return;
      }
    }

    if (resolution === "mark_completed") {
      // Owner verified in Plisio the payout WAS sent. Funds were deducted at request time,
      // so there is NO balance change — just record the terminal state (+ optional txHash).
      const [updated] = await db
        .update(transactionsTable)
        .set({ status: "completed", ...(txHash ? { txHash: String(txHash) } : {}) })
        .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "withdrawal"), reconcilable))
        .returning();
      if (!updated) {
        res.status(409).json({ error: "This withdrawal is no longer awaiting review." });
        return;
      }
      req.log.info({ txId, by: req.user!.userId }, "Reconcile: marked completed");
      res.json({ id: updated.id, status: updated.status });
      return;
    }

    if (resolution === "cancel_refund") {
      // Owner verified the payout was NOT sent and wants to cancel it: flip to failed and
      // refund the held balance ATOMICALLY. The guarded flip gates the refund, so concurrent
      // duplicates block on the row lock and can never double-refund.
      const refunded = await db.transaction(async (txn) => {
        const flipped = await txn
          .update(transactionsTable)
          .set({ status: "failed" })
          .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "withdrawal"), reconcilable))
          .returning({ id: transactionsTable.id });
        if (flipped.length === 0) return false;
        await txn
          .update(usersTable)
          .set({ balance: sql`balance + ${parseFloat(tx.amount)}` })
          .where(eq(usersTable.id, tx.userId));
        return true;
      });
      if (!refunded) {
        res.status(409).json({ error: "This withdrawal is no longer awaiting review." });
        return;
      }
      req.log.info({ txId, by: req.user!.userId, amount: tx.amount }, "Reconcile: cancelled + refunded");
      res.json({ id: txId, status: "failed", amount: parseFloat(tx.amount) });
      return;
    }

    // resolution === "requeue": back to pending so the normal approve flow can retry the
    // payout. Only safe when the owner EXPLICITLY confirms Plisio did NOT send the funds —
    // a blind requeue after an ambiguous outcome is a double-pay hole.
    if (confirmedNotSent !== true) {
      res.status(400).json({
        error: "Requeue requires explicit confirmation that the payout was NOT sent (confirmedNotSent: true).",
      });
      return;
    }
    const [requeued] = await db
      .update(transactionsTable)
      .set({ status: "pending" })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "withdrawal"), reconcilable))
      .returning();
    if (!requeued) {
      res.status(409).json({ error: "This withdrawal is no longer awaiting review." });
      return;
    }
    req.log.info({ txId, by: req.user!.userId }, "Reconcile: requeued to pending");
    res.json({ id: requeued.id, status: requeued.status });
    return;
  } catch (err) {
    req.log.error({ err }, "Reconcile transaction error");
    res.status(500).json({ error: "Internal server error" });
  }
});


adminRouter.get("/bank/crypto-prices", requireBankSession, async (req, res) => {
  const COINS = ["BTC", "ETH", "LTC", "DOGE", "SOL", "BCH", "TRX", "XMR", "DASH", "TON", "USDT_TRX", "USDT_TON"];
  const prices: Record<string, number> = {};
  await Promise.all(
    COINS.map(async (coin) => {
      prices[coin] = await getCryptoPrice(coin);
    })
  );
  res.json({ prices, updatedAt: new Date().toISOString() });
});

// ── OWNER BANK: GET /api/admin/bank/balances — live balances ──
// Strategy:
//   1. Fetch the Plisio /balances endpoint (returns all wallet balances at once — most reliable).
//   2. Also fetch individual /currencies/{coin} endpoints for rate_usd and allowed flag.
//   3. Query our own DB to see which coins have had real deposit activity.
// A coin is shown as "Live" (allowed=1) if:
//   • It has a non-zero balance from Plisio, OR
//   • Plisio reports allowed=1, OR
//   • We have at least one completed deposit in that currency in the last 90 days, OR
//   • The coin is ETH or DOGE (always shown as Live — these are our primary currencies).
// Balance is taken from the Plisio /balances endpoint first (most accurate), then falls back
// to the individual /currencies/{coin} balance field.
// IMPORTANT: Any coin with a real non-zero balance is ALWAYS shown as Live (not Inactive).
const ALWAYS_LIVE_COINS = new Set(["ETH", "DOGE"]);

adminRouter.get("/bank/balances", requireBankSession, async (req, res) => {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";

  const ACCEPTED_COINS = [
    "BTC", "ETH", "LTC", "DOGE", "SOL", "BCH",
    "TRX", "XMR", "DASH", "TON", "USDT_TRX", "USDT_TON",
  ];

  try {
    // ── Query 1: our DB — which coins have seen real deposit activity (any status) ──
    // Use a broader window and include pending deposits so ETH/DOGE show active even
    // before a deposit is confirmed.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dbActivity = await db
      .select({
        currency: transactionsTable.currency,
        depositCount: sql<number>`count(*)`,
        totalUsd: sql<string>`coalesce(sum(${transactionsTable.amount}::numeric), 0)`,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          // Include completed AND pending deposits so coins show Live as soon as a user
          // initiates a deposit, not only after it clears.
          sql`${transactionsTable.status} IN ('completed', 'pending')`,
          sql`${transactionsTable.createdAt} >= ${ninetyDaysAgo.toISOString()}`,
        )
      )
      .groupBy(transactionsTable.currency);

    const dbActiveCoins = new Set(dbActivity.map(r => (r.currency ?? "").toUpperCase()));
    const dbTotals: Record<string, { count: number; totalUsd: string }> = {};
    for (const row of dbActivity) {
      const c = (row.currency ?? "").toUpperCase();
      dbTotals[c] = { count: Number(row.depositCount), totalUsd: row.totalUsd };
    }

    // ── Query 2a: Plisio /balances endpoint — most reliable source for wallet balances ──
    // This returns all coin balances in one call.
    const plisioWalletBalances: Record<string, string> = {};
    if (PLISIO_KEY) {
      try {
        const params = new URLSearchParams({ api_key: PLISIO_KEY });
        const resp = await fetch(
          `https://api.plisio.net/api/v1/balances?${params.toString()}`,
          { signal: AbortSignal.timeout(12_000) },
        );
        const data = await resp.json() as {
          status?: string;
          data?: Record<string, { balance?: string; psys_cid?: string }>;
        };
        if (data.status === "success" && data.data) {
          // The /balances response uses Plisio's internal coin IDs as keys.
          // Map them to our uppercase coin names.
          const plisioToOurCoin: Record<string, string> = {
            BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
            BCH: "BCH", TRX: "TRX", XMR: "XMR", DASH: "DASH", TON: "TON",
            USDT_TRX: "USDT_TRX", USDT_TON: "USDT_TON",
          };
          for (const [key, val] of Object.entries(data.data)) {
            const upperKey = key.toUpperCase();
            const ourCoin = plisioToOurCoin[upperKey] ?? upperKey;
            if (val?.balance && parseFloat(val.balance) > 0) {
              plisioWalletBalances[ourCoin] = val.balance;
            }
          }
        }
      } catch (balErr) {
        req.log.warn({ balErr }, "Plisio /balances endpoint failed — falling back to per-coin");
      }
    }

    // ── Query 2b: Plisio individual coin endpoints (for rate_usd + allowed flag) ──
    const plisioResults: Record<string, { balance: string; allowed: number; rate_usd?: string }> = {};
    if (PLISIO_KEY) {
      const fetches = await Promise.allSettled(
        ACCEPTED_COINS.map(async (coin) => {
          const params = new URLSearchParams({ api_key: PLISIO_KEY });
          const resp = await fetch(
            `https://api.plisio.net/api/v1/currencies/${coin}?${params.toString()}`,
            { signal: AbortSignal.timeout(10_000) },
          );
          const data = await resp.json() as {
            status?: string;
            data?: { balance?: string; allowed?: number; rate_usd?: string; price_usd?: string };
          };
          return { coin, data };
        })
      );
      for (const result of fetches) {
        if (result.status === "fulfilled") {
          const { coin, data } = result.value;
          if (data.status === "success" && data.data) {
            plisioResults[coin] = {
              balance: data.data.balance ?? "0",
              allowed: data.data.allowed ?? 0,
              rate_usd: data.data.rate_usd ?? data.data.price_usd ?? undefined,
            };
          }
        }
      }
    }

    // ── Merge: Plisio data + DB activity ──────────────────────────────────────
    const balances: Record<string, { balance: string; allowed: number; rate_usd?: string; depositCount?: number; totalUsd?: string }> = {};
    for (const coin of ACCEPTED_COINS) {
      const plisio = plisioResults[coin];
      const isDbActive = dbActiveCoins.has(coin);
      const isAlwaysLive = ALWAYS_LIVE_COINS.has(coin);
      // Balance priority: /balances endpoint > /currencies/{coin} balance field
      const balance = plisioWalletBalances[coin] ?? plisio?.balance ?? "0";
      const balanceNum = parseFloat(balance);
      const hasRealBalance = balanceNum > 0;
      // allowed=1 (show as "Live") if:
      //   • The coin has a non-zero balance (REAL DATA from Plisio), OR
      //   • ETH or DOGE (always live — our primary currencies), OR
      //   • Plisio reports allowed=1, OR
      //   • We have real deposit activity for this coin in the last 90 days
      // This ensures coins with real holdings are ALWAYS shown as Live, never Inactive.
      const allowed = (hasRealBalance || isAlwaysLive || plisio?.allowed === 1 || isDbActive) ? 1 : 0;
      balances[coin] = {
        balance,
        allowed,
        rate_usd: plisio?.rate_usd,
        depositCount: dbTotals[coin]?.count ?? 0,
        totalUsd: dbTotals[coin]?.totalUsd ?? "0",
      };
    }

    res.json({ balances });
  } catch (err) {
    req.log.error({ err }, "Bank balances error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/transactions/:id/decline-deposit — mark pending deposit as declined, no credit
adminRouter.post("/transactions/:id/decline-deposit", requireAdmin, async (req, res) => {
  const txId = parseInt(req.params.id as string, 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }
  try {
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
    if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
    if (tx.type !== "deposit" || tx.status !== "pending") {
      res.status(400).json({ error: "Only pending deposits can be declined" });
      return;
    }
    await db.update(transactionsTable).set({ status: "declined" }).where(eq(transactionsTable.id, txId));
    req.log.info({ txId, userId: tx.userId }, "Admin declined deposit without credit");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Decline deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/bank/invoices — real invoice feed from our database (OWNER ONLY)
// Enriches completed deposits with Plisio's actual received amount (sum_actual) so
// the admin can see exactly what arrived on-chain vs what was credited in the DB.
adminRouter.get("/bank/invoices", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Invoices are visible to the owner only." });
    return;
  }
  try {
    const pageNum = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10)));
    const offset = (pageNum - 1) * limitNum;

    const invoices = await db
      .select({
        id: transactionsTable.id,
        txn_id: transactionsTable.plisioTrackId,
        order_id: transactionsTable.orderId,
        type: transactionsTable.type,
        status: transactionsTable.status,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        address: transactionsTable.address,
        txHash: transactionsTable.txHash,
        metadata: transactionsTable.metadata,
        createdAt: transactionsTable.createdAt,
        updatedAt: transactionsTable.updatedAt,
        username: usersTable.username,
        userId: transactionsTable.userId,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(transactionsTable);

    // ── ENRICH WITH PLISIO ACTUAL RECEIVED AMOUNTS ─────────────────────────
    // Call Plisio API for each completed deposit to get the REAL sum_actual.
    // Limited to 12 calls per request to avoid rate limits.
    const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;
    const toEnrich = invoices
      .filter((inv) => inv.type === "deposit" && inv.status === "completed" && inv.txn_id && PLISIO_KEY)
      .slice(0, 12);

    const enrichMap = new Map<number, { plisioReceivedCrypto: number | null; plisioReceivedUsd: number | null; plisioSourceUsd: number | null }>();

    if (toEnrich.length > 0 && PLISIO_KEY) {
      await Promise.allSettled(
        toEnrich.map(async (inv) => {
          try {
            const resp = await fetch(
              `https://api.plisio.net/api/v1/operations/${inv.txn_id}?api_key=${PLISIO_KEY}`,
              { signal: AbortSignal.timeout(6000) }
            );
            const data = await resp.json() as any;
            if (data.status !== "success" || !data.data) return;
            const d = data.data as Record<string, unknown>;
            const cryptoReceived = extractPlisioReceivedCrypto(d);
            const sourceUsd = extractPlisioSourceUsd(d, parseFloat(String(inv.amount)));
            const creditCalc = await computePlisioCreditUsd(
              d,
              sourceUsd,
              (c) => getCryptoPrice(c),
              inv.currency ?? "ETH",
            );

            enrichMap.set(inv.id, {
              plisioReceivedCrypto: cryptoReceived > 0 ? cryptoReceived : null,
              plisioReceivedUsd: creditCalc.creditUsd > 0 ? creditCalc.creditUsd : null,
              plisioSourceUsd: sourceUsd > 0 ? sourceUsd : null,
            });
          } catch { /* enrichment is best-effort */ }
        })
      );
    }

    const enriched = invoices.map((inv) => ({
      ...inv,
      ...(enrichMap.get(inv.id) ?? {}),
    }));

    res.json({ invoices: enriched, total: Number(total) });
  } catch (err) {
    req.log.error({ err }, "Bank invoices error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/transactions/:id/credit-override
// Owner-only: manually set the exact USD amount credited for any deposit transaction.
// Use this to correct deposits where the auto-crediting used the invoice amount instead
// of the real Plisio sum_actual. Adjusts the user's balance by the difference.
adminRouter.post("/transactions/:id/credit-override", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the platform owner can override credit amounts." });
    return;
  }
  const txId = parseInt(String(req.params.id), 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }

  const { amount, note } = req.body as { amount?: number; note?: string };
  const newAmount = typeof amount === "number" ? amount : parseFloat(String(amount ?? ""));
  if (isNaN(newAmount) || newAmount < 0) {
    res.status(400).json({ error: "amount must be a non-negative number" });
    return;
  }

  try {
    const [tx] = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "deposit")))
      .limit(1);
    if (!tx) { res.status(404).json({ error: "Deposit transaction not found" }); return; }
    if (tx.status !== "completed") {
      res.status(400).json({ error: `Can only override a completed deposit (current status: ${tx.status})` });
      return;
    }

    const oldAmount = parseFloat(tx.amount);
    const diff = Math.round((newAmount - oldAmount) * 1e8) / 1e8;

    await db.transaction(async (txn) => {
      await txn.update(transactionsTable)
        .set({
          amount: String(newAmount),
          metadata: JSON.stringify({
            ...(tx.metadata ? (typeof tx.metadata === "string" ? JSON.parse(tx.metadata) : tx.metadata) : {}),
            credit_override_amount: newAmount,
            credit_override_previous: oldAmount,
            credit_override_by: req.user!.userId,
            credit_override_at: new Date().toISOString(),
            credit_override_note: note ?? "manual override",
          }),
        })
        .where(eq(transactionsTable.id, txId));

      if (diff !== 0) {
        await txn.update(usersTable)
          .set({
            balance: sql`balance + ${diff}`,
            totalDeposited: sql`coalesce(total_deposited, 0) + ${diff}`,
          })
          .where(eq(usersTable.id, tx.userId));
      }
    });

    req.log.info({ txId, oldAmount, newAmount, diff, userId: tx.userId, by: req.user!.userId, note }, "Admin credit override applied");
    res.json({ success: true, oldAmount, newAmount, diff });
  } catch (err) {
    req.log.error({ err }, "Credit override error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/bank/reconcile — manually trigger retroactive reconciliation
adminRouter.post("/bank/reconcile", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  
  try {
    // We'll run the reconciliation logic inline here for immediate feedback
    const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;
    if (!PLISIO_KEY) {
      res.status(500).json({ error: "Plisio API key not configured" });
      return;
    }

    const pendingDeposits = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "pending")
        )
      );

    let reconciledCount = 0;
    let failedCount = 0;

    for (const tx of pendingDeposits) {
      if (!tx.plisioTrackId) continue;
      try {
        req.log.info({ txId: tx.id, trackId: tx.plisioTrackId }, "Reconciling specific deposit");
        const resp = await fetch(`https://api.plisio.net/api/v1/operations/${tx.plisioTrackId}?api_key=${PLISIO_KEY}`);
        const data = await resp.json() as any;
        
        if (data.status !== "success" || !data.data) {
          req.log.warn({ txId: tx.id, data }, "Plisio reported failure or no data for reconciliation");
          continue;
        }

        const pStatus = String(data.data.status).toLowerCase();
        req.log.info({ txId: tx.id, pStatus, plisioData: data.data }, "Plisio status for reconciliation");
        // Be more inclusive of statuses that mean "paid"
        const creditStatuses = ["completed", "mismatch", "overpaid", "finished"];
        
        if (creditStatuses.includes(pStatus)) {
          const plisioData = data.data as Record<string, unknown>;
          if (!canCreditFromPlisioData(plisioData)) {
            req.log.warn(
              { txId: tx.id, pStatus, sourceUsd: tx.amount },
              "Reconcile: no actual_sum from Plisio — skipping, will retry when real data available",
            );
            continue;
          }

          const cryptoCurrency = tx.currency || String(plisioData.currency ?? "ETH");
          const sourceUsd = extractPlisioSourceUsd(plisioData, parseFloat(String(tx.amount)));
          const creditCalc = await computePlisioCreditUsd(
            plisioData,
            sourceUsd,
            (c) => getCryptoPrice(c),
            cryptoCurrency,
          );
          const receivedAmount = creditCalc.cryptoReceived;
          const invoicedAmount = creditCalc.cryptoInvoiced;
          const creditAmount = creditCalc.creditUsd;

          if (creditAmount <= 0) {
            req.log.warn({ txId: tx.id, pStatus }, "Reconcile: could not compute credit from sum_actual");
            continue;
          }

          await db.transaction(async (txn) => {
            const flipped = await txn.update(transactionsTable)
              .set({ 
                status: "completed", 
                amount: String(creditAmount),
                metadata: JSON.stringify({
                  invoice_amount_crypto: invoicedAmount,
                  received_amount_crypto: receivedAmount,
                  received_amount_usd: creditAmount,
                  requested_amount_usd: sourceUsd,
                  credit_amount_usd: creditAmount,
                  credit_calc_method: creditCalc.creditMethod,
                  paid_at: data.data.updated_at || new Date().toISOString(),
                  reconciled_at: new Date().toISOString()
                })
              })
              .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
              .returning({ id: transactionsTable.id });

            if (flipped.length === 0) return;

            const { creditCryptoBalance: creditCrypto } = await import("../lib/balance-service.js");
            if (receivedAmount > 0) {
              await creditCrypto(tx.userId, cryptoCurrency, receivedAmount, txn);
            } else {
              await txn.update(usersTable).set({ balance: sql`balance + ${creditAmount}` }).where(eq(usersTable.id, tx.userId));
            }

            const [updatedUser] = await txn.update(usersTable).set({
              totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
              wagerRequirement: sql`(coalesce(total_deposited, 0) + ${creditAmount}) * 1.0`,
            }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });

            if (updatedUser) {
              await recordLedger(txn, {
                userId: tx.userId, amount: creditAmount, balanceBefore: parseFloat(updatedUser.balance) - creditAmount,
                balanceAfter: parseFloat(updatedUser.balance), reason: "deposit", referenceId: tx.id, referenceType: "transaction",
                note: `Retroactively credited ${receivedAmount} ${cryptoCurrency}`
              });
            }
            
            // Handle Referral
            const [depositor] = await txn.select({ referredBy: usersTable.referredBy }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
            if (depositor?.referredBy) {
              const referrerId = depositor.referredBy;
              const [activeRow] = await txn.select({ n: count() }).from(referralsTable).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
              const active = activeRow?.n ?? 0;
              const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
              const commission = Math.round(creditAmount * commissionRate * 1e8) / 1e8;
              if (commission > 0) {
                await txn.update(usersTable).set({ balance: sql`balance + ${commission}` }).where(eq(usersTable.id, referrerId));
                await txn.update(referralsTable).set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` }).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
                await txn.insert(creatorBankTxnsTable).values({ creatorId: referrerId, type: "referral_commission", amount: String(commission), toUserId: tx.userId, description: `Retroactive commission from deposit ${tx.plisioTrackId || tx.id}` });
              }
            }
          });
          reconciledCount++;
        } else if (["expired", "cancelled", "error"].includes(pStatus)) {
          await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, tx.id));
          failedCount++;
        }
      } catch (err) {
        req.log.error({ err, txId: tx.id }, "Reconciliation error for individual tx");
      }
    }
    
    req.log.info({ reconciledCount, failedCount, checkedCount: pendingDeposits.length }, "Manual reconciliation finished");
    return res.json({ 
      success: true, 
      reconciledCount: Number(reconciledCount), 
      failedCount: Number(failedCount), 
      checkedCount: Number(pendingDeposits.length) 
    });
  } catch (err) {
    req.log.error({ err }, "Manual reconciliation error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/bank/smart-sync — manually sync a deposit using a pasted Plisio ID (OWNER ONLY)
adminRouter.post("/bank/smart-sync", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  
  const { plisioId, txId } = req.body as { plisioId?: string; txId?: number };
  if (!plisioId && !txId) {
    res.status(400).json({ error: "Plisio ID or Transaction ID required" });
    return;
  }

  try {
    const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;
    if (!PLISIO_KEY) {
      res.status(500).json({ error: "Plisio API key not configured" });
      return;
    }

    // Find the transaction in our DB
    let tx;
    if (txId) {
      [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
    } else if (plisioId) {
      // Try searching by Plisio ID (txn_id) or Order ID (order_number)
      [tx] = await db.select().from(transactionsTable)
        .where(or(eq(transactionsTable.plisioTrackId, plisioId), eq(transactionsTable.orderId, plisioId)))
        .limit(1);
    }

    if (!tx) {
      res.status(404).json({ error: "Transaction not found in our system. Make sure you are pasting the correct Plisio ID or Order ID." });
      return;
    }

    const trackId = plisioId || tx.plisioTrackId;
    if (!trackId) {
      res.status(400).json({ error: "No Plisio Track ID found for this transaction" });
      return;
    }

    // Fetch REAL data from Plisio
    // Try searching by trackId (txn_id) first
    let resp = await fetch(`https://api.plisio.net/api/v1/operations/${trackId}?api_key=${PLISIO_KEY}`);
    let data = await resp.json() as any;
    
    // If not found by trackId, try searching by order_number if we have one
    if ((data.status !== "success" || !data.data) && tx.orderId) {
      req.log.info({ orderId: tx.orderId }, "Smart sync: not found by trackId, trying order_number");
      resp = await fetch(`https://api.plisio.net/api/v1/operations?api_key=${PLISIO_KEY}&order_number=${tx.orderId}`);
      const listData = await resp.json() as any;
      if (listData.status === "success" && listData.data && listData.data.length > 0) {
        data = { status: "success", data: listData.data[0] };
      }
    }
    
    if (data.status !== "success" || !data.data) {
      res.status(400).json({ error: "Could not find invoice on Plisio. Please verify the ID in your Plisio dashboard.", plisioResponse: data });
      return;
    }

    req.log.info({ plisioData: data.data }, "Smart Sync: Deep Debug Plisio Data");

    const pStatus = String(data.data.status).toLowerCase();
    const plisioData = data.data as Record<string, unknown>;

    req.log.info({
      event: "plisio_smart_sync_raw",
      plisioRaw: JSON.stringify(plisioData).substring(0, 4000),
    }, "Smart Sync: raw Plisio API response");

    const isPaid = ["completed", "mismatch", "overpaid", "finished", "overdue"].includes(pStatus);

    if (!isPaid) {
      res.json({
        success: false,
        message: `Plisio reports status: ${pStatus}. Not credited.`,
        plisioData: data.data,
      });
      return;
    }

    if (!canCreditFromPlisioData(plisioData)) {
      req.log.warn({ pStatus, plisioData }, "Smart Sync: no actual_sum from Plisio — cannot credit");
      res.status(400).json({
        error:
          "Plisio has not provided sum_actual (on-chain received amount) yet. " +
          "Cannot credit without verified actual payment — retry after confirmation.",
      });
      return;
    }

    const cryptoCurrency = tx.currency || String(plisioData.currency ?? "ETH");
    const sourceUsd = extractPlisioSourceUsd(plisioData, parseFloat(String(tx.amount)));
    const creditCalc = await computePlisioCreditUsd(
      plisioData,
      sourceUsd,
      (c) => getCryptoPrice(c),
      cryptoCurrency,
    );

    const receivedAmount = creditCalc.cryptoReceived;
    const invoicedAmount = creditCalc.cryptoInvoiced;
    const creditAmount = creditCalc.creditUsd;
    const ratioUsed = invoicedAmount > 0 && receivedAmount > 0 ? receivedAmount / invoicedAmount : 1;

    req.log.info({
      receivedAmount,
      invoicedAmount,
      sourceUsd,
      creditAmount,
      creditMethod: creditCalc.creditMethod,
    }, "Smart Sync: crediting sum_actual");

    if (creditAmount <= 0) {
      res.status(400).json({ error: `Calculated credit is $${creditAmount}. Not crediting.` });
      return;
    }

    if (tx.status === "completed") {
      res.json({ success: true, message: "Transaction was already completed.", alreadyDone: true, plisioData: data.data });
      return;
    }

    await db.transaction(async (txn) => {
      const flipped = await txn.update(transactionsTable)
        .set({ 
          status: "completed", 
          amount: String(creditAmount),
          plisioTrackId: trackId, // Update if we were searching by txId
          metadata: JSON.stringify({
            invoice_amount_crypto: invoicedAmount,
            received_amount_crypto: receivedAmount,
            received_amount_usd: creditAmount,
            requested_amount_usd: sourceUsd,
            credit_amount_usd: creditAmount,
            credit_calc_method: creditCalc.creditMethod,
            ratio: ratioUsed,
            paid_at: data.data.updated_at || new Date().toISOString(),
            smart_synced_at: new Date().toISOString(),
          }),
        })
        .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
        .returning({ id: transactionsTable.id });

      // Race condition guard: if another request already completed this tx, bail out
      if (flipped.length === 0) return;

      const cryptoCurrency = tx.currency || data.data.currency || "ETH";
      
      // 1. Credit Crypto-Native Balance (LIVE)
      // FIX: uses creditCryptoBalance from balance-service to ensure no double-crediting
      if (receivedAmount > 0) {
        // We import it locally to avoid circular dependencies if any, but it's safe here
        const { creditCryptoBalance: creditCrypto } = await import("../lib/balance-service.js");
        await creditCrypto(tx.userId, cryptoCurrency, receivedAmount, txn);
      } else {
        // Fallback to static balance if no crypto data
        await txn.update(usersTable).set({ balance: sql`balance + ${creditAmount}` }).where(eq(usersTable.id, tx.userId));
      }

      // 2. Update Stats
      const [updatedUser] = await txn.update(usersTable).set({
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
        wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmount}`,
      }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });

      if (updatedUser) {
        await recordLedger(txn, {
          userId: tx.userId, amount: creditAmount, balanceBefore: 0,
          balanceAfter: creditAmount, reason: "deposit", referenceId: tx.id, referenceType: "transaction",
          note: `Smart Synced: ${receivedAmount > 0 ? receivedAmount + " " + cryptoCurrency : "$" + creditAmount + " USD"} (Live Balance)`
        });
      }
      
      // Handle Referral
      const [depositor] = await txn.select({ referredBy: usersTable.referredBy }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
      if (depositor?.referredBy) {
        const referrerId = depositor.referredBy;
        const [activeRow] = await txn.select({ n: count() }).from(referralsTable).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
        const active = activeRow?.n ?? 0;
        const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
        const commission = Math.round(creditAmount * commissionRate * 1e8) / 1e8;
        if (commission > 0) {
          await txn.update(usersTable).set({ balance: sql`balance + ${commission}` }).where(eq(usersTable.id, referrerId));
          await txn.update(referralsTable).set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` }).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
          await txn.insert(creatorBankTxnsTable).values({ creatorId: referrerId, type: "referral_commission", amount: String(commission), toUserId: tx.userId, description: `Commission from Smart Synced deposit ${trackId}` });
        }
      }
    });

    res.json({ 
      success: true, 
      message: `Successfully synced! Credited $${creditAmount} (${receivedAmount} ${data.data.currency})`,
      creditAmount,
      receivedAmount,
      plisioData: data.data
    });
  } catch (err) {
    req.log.error({ err }, "Smart sync error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/bank/pending-withdrawals — our pending withdrawal queue
adminRouter.get("/bank/pending-withdrawals", requireBankSession, async (req, res) => {
  try {
    const pending = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "withdrawal"),
          eq(transactionsTable.status, "pending")
        )
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
    const readinessCache = new Map<string, Awaited<ReturnType<typeof getPlisioPayoutReadiness>>>();
    const withdrawals = await Promise.all(
      pending.map(async (tx) => {
        if (!PLISIO_KEY) {
          return {
            ...tx,
            payoutReadiness: {
              ok: false,
              reason: "no_key",
              message: "Plisio API key is not configured. This payout cannot be sent automatically.",
            },
          };
        }

        const amount = parseFloat(tx.amount);
        const currency = tx.currency ?? "BTC";
        const cacheKey = `${currency}:${amount}`;
        let readiness = readinessCache.get(cacheKey);
        if (!readiness) {
          readiness = await getPlisioPayoutReadiness(amount, currency, PLISIO_KEY, req.log);
          readinessCache.set(cacheKey, readiness);
        }
        return { ...tx, payoutReadiness: readiness };
      }),
    );

    res.json({ withdrawals });
  } catch (err) {
    req.log.error({ err }, "Pending withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});



// GET /api/admin/bank/settings — fanodgc only
adminRouter.get("/bank/settings", requireBankSession, async (req, res) => {
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || user.username !== "fanodgc") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const settings = await getPlatformSettings();
    res.json({ settings });
  } catch (err) {
    req.log.error({ err }, "Get bank settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/bank/settings — fanodgc only
adminRouter.put("/bank/settings", requireBankSession, async (req, res) => {
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || user.username !== "fanodgc") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const body = req.body as any;
    const updates: Record<string, string> = {};
    
    // Numeric settings
    const numericKeys = ["aiSensitivity", "autoApproveUnder", "requireManualOver", "minWithdrawal", "signupBonus"];
    for (const key of numericKeys) {
      if (typeof body[key] === "number" && body[key] >= 0) {
        let val = body[key];
        if (key === "autoApproveUnder") val = Math.min(val, 10000);
        updates[key] = String(val);
      }
    }

    // Boolean settings
    const booleanKeys = ["slotsEnabled", "raceEnabled", "leaderboardEnabled", "gamesEnabled", "maintenanceMode", "custom404Enabled"];
    for (const key of booleanKeys) {
      if (typeof body[key] === "boolean") {
        updates[key] = String(body[key]);
      }
    }

    const stringKeys = ["custom404Title", "custom404Message", "custom404ButtonText", "custom404ButtonUrl"];
    for (const key of stringKeys) {
      if (typeof body[key] === "string") {
        updates[key] = body[key];
      }
    }

    if (Array.isArray(body.disabledGameSlugs)) {
      updates.disabledGameSlugs = JSON.stringify(body.disabledGameSlugs.filter((s: unknown) => typeof s === "string"));
    }

    const { invalidatePlatformSettingsCache } = await import("../lib/platform-settings.js");
    for (const [key, value] of Object.entries(updates)) {
      await db.insert(platformSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value } });
    }
    invalidatePlatformSettingsCache();

    const settings = await getPlatformSettings();
    res.json({ success: true, settings });
  } catch (err) {
    req.log.error({ err }, "Update bank settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── OWNER BANK: GET /api/admin/bank/fraud-alerts ─────────────────────────────
// Two data sources merged for a comprehensive real-time fraud monitor:
//   Source A: fraudReviewsTable — saved AI decisions from auto-approval runs (history)
//   Source B: live scoring of ALL pending withdrawals (real-time queue)
adminRouter.get("/bank/fraud-alerts", requireBankSession, async (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const date = typeof req.query.date === "string" ? req.query.date : undefined;

  try {
    const settings = await getPlatformSettings();
    const sensitivityMultiplier = 0.5 + (settings.aiSensitivity / 100);

    // ── Source A: fraudReviewsTable — recent AI review records ───────────────
    const conditions = [];
    if (date) {
      conditions.push(sql`DATE(${fraudReviewsTable.createdAt}) = ${date}`);
    }

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(fraudReviewsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const fraudHistoryRows = await db
      .select({
        reviewId: fraudReviewsTable.id,
        withdrawalId: fraudReviewsTable.withdrawalId,
        userId: fraudReviewsTable.userId,
        amount: fraudReviewsTable.amount,
        score: fraudReviewsTable.score,
        flags: fraudReviewsTable.flags,
        decision: fraudReviewsTable.decision,
        metadata: fraudReviewsTable.metadata,
        createdAt: fraudReviewsTable.createdAt,
        username: usersTable.username,
        txStatus: transactionsTable.status,
        currency: transactionsTable.currency,
        address: transactionsTable.address,
      })
      .from(fraudReviewsTable)
      .leftJoin(usersTable, eq(fraudReviewsTable.userId, usersTable.id))
      .leftJoin(transactionsTable, eq(fraudReviewsTable.withdrawalId, transactionsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(fraudReviewsTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Map fraud history into alert shape — only show blocked/review decisions (not clean approvals)
    const historyAlerts = fraudHistoryRows
      .filter(r => r.decision === "blocked" || r.decision === "review" || (r.score ?? 0) >= 40)
      .map(r => ({
        id: r.withdrawalId ?? r.reviewId,
        reviewId: r.reviewId,
        userId: r.userId,
        username: r.username ?? `user_${r.userId}`,
        amount: String(r.amount ?? "0"),
        currency: r.currency ?? "?",
        type: "withdrawal" as const,
        status: r.txStatus ?? "unknown",
        address: r.address,
        riskScore: Number(r.score ?? 0),
        flags: (() => { try { return JSON.parse(r.flags ?? "[]") as string[]; } catch { return []; } })(),
        decision: r.decision,
        createdAt: r.createdAt,
        source: "history" as const,
      }));

    // ── Source B: Live scoring of ALL current pending withdrawals ────────────
    const pending = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        type: transactionsTable.type,
        status: transactionsTable.status,
        address: transactionsTable.address,
        createdAt: transactionsTable.createdAt,
        username: usersTable.username,
        userCreatedAt: usersTable.createdAt,
        userBalance: usersTable.balance,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(
        and(
          eq(transactionsTable.type, "withdrawal"),
          eq(transactionsTable.status, "pending")
        )
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    const liveAlerts = await Promise.all(
      pending.map(async (tx) => {
        const flags: string[] = [];
        let riskScore = 0;
        const amount = parseFloat(tx.amount ?? "0");

        if (amount > 500) {
          flags.push("large_amount");
          riskScore += amount > 2000 ? 35 : amount > 1000 ? 25 : 15;
        }

        const accountAgeDays = tx.userCreatedAt
          ? (Date.now() - new Date(tx.userCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
          : 999;
        if (accountAgeDays < 7) {
          flags.push("new_account");
          riskScore += accountAgeDays < 1 ? 40 : accountAgeDays < 3 ? 30 : 20;
        }

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [{ recentCount }] = await db
          .select({ recentCount: sql<number>`count(*)` })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.userId, tx.userId),
            eq(transactionsTable.type, "withdrawal"),
            sql`created_at > ${oneDayAgo.toISOString()}`
          ));
        if (Number(recentCount) > 2) {
          flags.push("velocity");
          riskScore += Number(recentCount) > 5 ? 35 : Number(recentCount) > 3 ? 25 : 15;
        }

        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const [{ recentLoss }] = await db
          .select({ recentLoss: sql<number>`coalesce(sum(amount::numeric), 0)` })
          .from(betsTable)
          .where(and(
            eq(betsTable.userId, tx.userId),
            eq(betsTable.won, false),
            sql`created_at > ${sixHoursAgo.toISOString()}`
          ));
        if (Number(recentLoss) > 200) {
          flags.push("suspicious_pattern");
          riskScore += Number(recentLoss) > 1000 ? 30 : Number(recentLoss) > 500 ? 20 : 12;
        }

        if (amount > 100 && amount % 100 === 0) {
          flags.push("round_amount");
          riskScore += 8;
        }

        const balance = parseFloat(tx.userBalance ?? "0");
        if (balance > 0 && amount / balance > 0.9) {
          flags.push("full_balance_withdrawal");
          riskScore += 15;
        }

        if (tx.address) {
          const [{ addrCount }] = await db
            .select({ addrCount: sql<number>`count(distinct user_id)` })
            .from(transactionsTable)
            .where(and(
              eq(transactionsTable.address, tx.address),
              eq(transactionsTable.type, "withdrawal"),
            ));
          if (Number(addrCount) > 1) {
            flags.push("shared_withdrawal_address");
            riskScore += Number(addrCount) > 3 ? 50 : 35;
          }
        }

        const [latestDeposit] = await db
          .select({ createdAt: transactionsTable.createdAt })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.userId, tx.userId),
            eq(transactionsTable.type, "deposit"),
            eq(transactionsTable.status, "completed"),
          ))
          .orderBy(desc(transactionsTable.createdAt))
          .limit(1);
        if (latestDeposit) {
          const minsAfterDeposit = (new Date(tx.createdAt).getTime() - new Date(latestDeposit.createdAt).getTime()) / 60000;
          if (minsAfterDeposit < 30 && minsAfterDeposit >= 0) {
            flags.push("immediate_withdrawal_after_deposit");
            riskScore += minsAfterDeposit < 5 ? 40 : 25;
          }
        }

        const [{ betCount }] = await db
          .select({ betCount: sql<number>`count(*)` })
          .from(betsTable)
          .where(eq(betsTable.userId, tx.userId));
        if (Number(betCount) === 0) {
          flags.push("no_play_withdrawal");
          riskScore += 30;
        }

        riskScore = Math.min(Math.round(riskScore * sensitivityMultiplier), 99);

        if (amount <= settings.autoApproveUnder && riskScore < 50) return null;

        if (amount > settings.requireManualOver && flags.length === 0) {
          flags.push("manual_review_threshold");
          riskScore = Math.max(riskScore, Math.round(20 * sensitivityMultiplier));
        }

        if (flags.length === 0) return null;

        return {
          id: tx.id,
          userId: tx.userId,
          username: tx.username ?? `user_${tx.userId}`,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type,
          status: tx.status,
          address: tx.address,
          riskScore,
          flags,
          decision: "pending_review" as const,
          createdAt: tx.createdAt,
          source: "live" as const,
        };
      })
    );

    // ── Merge: deduplicate by transaction ID, live takes priority over history ──
    const seenTxIds = new Set<number>();
    const merged: any[] = [];

    // Add live alerts first (highest priority — these need action NOW)
    for (const alert of liveAlerts) {
      if (alert) {
        seenTxIds.add(alert.id);
        merged.push(alert);
      }
    }
    // Add history alerts that aren't already shown live
    for (const alert of historyAlerts) {
      if (!seenTxIds.has(alert.id)) {
        merged.push(alert);
      }
    }

    // Sort: live pending first, then by risk score descending
    merged.sort((a, b) => {
      if (a?.source === "live" && b?.source !== "live") return -1;
      if (b?.source === "live" && a?.source !== "live") return 1;
      return (b?.riskScore ?? 0) - (a?.riskScore ?? 0);
    });

    res.json({ 
      alerts: merged, 
      total: Number(totalCount?.count ?? 0),
      stats: {
        livePending: liveAlerts.filter(Boolean).length,
        historyShown: historyAlerts.length,
        total: merged.length,
      }
    });
  } catch (err) {
    req.log.error({ err }, "Fraud alerts error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// POST /api/admin/tip — removed; tips use POST /api/users/tip (requireAuth, not admin)
adminRouter.post("/tip", (_req, res) => {
  res.status(410).json({ error: "Tips moved to POST /api/users/tip" });
});

// POST /api/admin/payout-callback — Plisio payout IPN
adminRouter.post("/payout-callback", async (req, res) => {
  const { trackId, status } = req.body as { trackId?: string; status?: string };
  req.log.info({ trackId, status }, "Plisio payout callback received");
  res.json({ success: true });
});

// POST /api/admin/transactions/:id/complete-deposit
// Owner-only: manually credit a stuck pending deposit to the user's balance.
// Use this when Plisio confirmed the deposit but the automatic IPN callback failed.
// Idempotent: safe to call twice — the second call is a no-op (already completed).
adminRouter.post("/transactions/:id/complete-deposit", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the platform owner can manually complete deposits." });
    return;
  }
  const txId = parseInt(req.params.id as string, 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }
  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "deposit")))
      .limit(1);
    if (!tx) { res.status(404).json({ error: "Deposit transaction not found" }); return; }
    if (tx.status === "completed") {
      res.json({ success: true, alreadyCompleted: true, creditAmount: parseFloat(tx.amount) });
      return;
    }
    if (tx.status !== "pending") {
      res.status(400).json({ error: `Cannot complete a deposit with status "${tx.status}"` });
      return;
    }

    const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
    if (!tx.plisioTrackId || !PLISIO_KEY) {
      res.status(400).json({
        error: "Cannot complete without Plisio verification. Use Smart Sync or ensure plisioTrackId is set.",
      });
      return;
    }

    const verifyResp = await fetch(
      `https://api.plisio.net/api/v1/operations/${tx.plisioTrackId}?api_key=${PLISIO_KEY}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const verifyData = await verifyResp.json() as { status?: string; data?: Record<string, unknown> };
    if (verifyData.status !== "success" || !verifyData.data) {
      res.status(400).json({ error: "Could not verify deposit with Plisio. Use Smart Sync instead." });
      return;
    }

    const plisioData = verifyData.data;
    const pStatus = String(plisioData.status ?? "").toLowerCase();
    if (!["completed", "mismatch", "overpaid", "finished", "overdue"].includes(pStatus)) {
      res.status(400).json({ error: `Plisio status is "${pStatus}" — not paid yet.` });
      return;
    }
    if (!canCreditFromPlisioData(plisioData)) {
      res.status(400).json({ error: "Plisio has no sum_actual yet — cannot credit invoice amount." });
      return;
    }

    const cryptoCurrency = tx.currency || String(plisioData.currency ?? "ETH");
    const sourceUsd = extractPlisioSourceUsd(plisioData, parseFloat(String(tx.amount)));
    const creditCalc = await computePlisioCreditUsd(
      plisioData,
      sourceUsd,
      (c) => getCryptoPrice(c),
      cryptoCurrency,
    );
    const creditAmount = creditCalc.creditUsd;
    const receivedCrypto = creditCalc.cryptoReceived;

    if (creditAmount <= 0) {
      res.status(400).json({ error: "Could not compute credit from Plisio sum_actual." });
      return;
    }

    const WAGER_MULT = 1.0;
    await db.transaction(async (txn) => {
      const flipped = await txn
        .update(transactionsTable)
        .set({
          status: "completed",
          amount: String(creditAmount),
          metadata: JSON.stringify({
            invoice_amount_crypto: creditCalc.cryptoInvoiced,
            received_amount_crypto: receivedCrypto,
            received_amount_usd: creditAmount,
            requested_amount_usd: sourceUsd,
            credit_amount_usd: creditAmount,
            credit_calc_method: creditCalc.creditMethod,
            manual_complete_at: new Date().toISOString(),
          }),
        })
        .where(and(eq(transactionsTable.id, tx.id), eq(transactionsTable.status, "pending")))
        .returning({ id: transactionsTable.id });
      if (flipped.length === 0) return;

      if (receivedCrypto > 0) {
        const { creditCryptoBalance } = await import("../lib/balance-service.js");
        await creditCryptoBalance(tx.userId, cryptoCurrency, receivedCrypto, txn);
      } else {
        await txn.update(usersTable).set({ balance: sql`balance + ${creditAmount}` }).where(eq(usersTable.id, tx.userId));
      }

      const [userAfter] = await txn.update(usersTable).set({
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
        wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmount * WAGER_MULT}`,
      }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });
      if (userAfter) {
        await recordLedger(txn, {
          userId: tx.userId,
          amount: creditAmount,
          balanceBefore: 0,
          balanceAfter: creditAmount,
          reason: "admin_deposit_manual",
          referenceId: txId,
          referenceType: "transaction",
          note: `Manual deposit by admin #${req.user!.userId}`,
        });
      }
    });
    // Audit log
    logAudit({
      adminId: req.user!.userId,
      adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
      action: "manual_complete_deposit",
      targetType: "transaction",
      targetId: txId,
      oldValue: { status: "pending" },
      newValue: { status: "completed", creditAmount },
      ip: req.ip,
      note: `IPN bypass — manually credited $${creditAmount} to user #${tx.userId}`,
    }).catch(() => {});
    req.log.info({ txId, creditAmount, userId: tx.userId, by: req.user!.userId }, "Admin manually completed deposit — IPN bypass");
    res.json({ success: true, creditAmount });
  } catch (err) {
    req.log.error({ err }, "Admin complete-deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});
// POST /api/admin/transactions/sync-plisio
// Owner-only: checks every pending deposit against Plisio's operations API and
// auto-credits any that Plisio already marked as paid. Rescues deposits where
// the IPN callback was unreachable (e.g. wrong SITE_URL pointing to Netlify).
// Idempotent: safe to run multiple times — credits use a guarded pending→completed flip.
adminRouter.post("/transactions/sync-plisio", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the platform owner can run the Plisio sync." });
    return;
  }
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
  if (!PLISIO_KEY) {
    res.status(500).json({ error: "Plisio API key not set (check PLISIO_SECRET_KEY, PLISIO_API_KEY, or API_KEY)" });
    return;
  }
  const WAGER_MULT = 1.0;
  const creditStatuses = new Set(["completed", "mismatch", "overpaid", "finished", "overdue"]);

  try {
    const pending = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "pending")));

    const results: Array<{
      id: number; userId: number; plisioTrackId: string | null;
      plisioStatus: string | null; action: string; creditAmount?: number; error?: string;
    }> = [];

    for (const tx of pending) {
      if (!tx.plisioTrackId) {
        results.push({ id: tx.id, userId: tx.userId, plisioTrackId: null, plisioStatus: null, action: "skipped_no_track_id" });
        continue;
      }
      try {
        const params = new URLSearchParams({ api_key: PLISIO_KEY });
        const plisioUrl = "https://api.plisio.net/api/v1/operations/" + tx.plisioTrackId + "?" + params.toString();
        const resp = await fetch(plisioUrl, { signal: AbortSignal.timeout(12_000) });
        const data = await resp.json() as {
          status?: string;
          data?: {
            status?: string;
            source_amount?: string | number;
            received_amount?: string | number;
            invoice_total_sum?: string | number;
          };
        };
        const plisioData = (data.data ?? {}) as Record<string, unknown>;
        const plisioStatus = String(plisioData.status ?? "").toLowerCase() || null;

        if (!plisioStatus) {
          results.push({ id: tx.id, userId: tx.userId, plisioTrackId: tx.plisioTrackId, plisioStatus: null, action: "no_status_from_plisio" });
          continue;
        }
        if (!creditStatuses.has(plisioStatus)) {
          results.push({ id: tx.id, userId: tx.userId, plisioTrackId: tx.plisioTrackId, plisioStatus, action: "not_paid_yet" });
          continue;
        }

        if (!canCreditFromPlisioData(plisioData)) {
          results.push({ id: tx.id, userId: tx.userId, plisioTrackId: tx.plisioTrackId, plisioStatus, action: "no_sum_actual" });
          continue;
        }

        const cryptoCurrency = tx.currency || String(plisioData.currency ?? "ETH");
        const sourceUsd = extractPlisioSourceUsd(plisioData, parseFloat(String(tx.amount)));
        const creditCalc = await computePlisioCreditUsd(
          plisioData,
          sourceUsd,
          (c) => getCryptoPrice(c),
          cryptoCurrency,
        );
        const finalCredit = creditCalc.creditUsd;
        const receivedCrypto = creditCalc.cryptoReceived;

        if (finalCredit < 0.01) {
          results.push({ id: tx.id, userId: tx.userId, plisioTrackId: tx.plisioTrackId, plisioStatus, action: "credit_too_small", creditAmount: finalCredit });
          continue;
        }

        await db.transaction(async (txn) => {
          const flipped = await txn
            .update(transactionsTable)
            .set({
              status: "completed",
              amount: String(finalCredit),
              metadata: JSON.stringify({
                invoice_amount_crypto: creditCalc.cryptoInvoiced,
                received_amount_crypto: receivedCrypto,
                received_amount_usd: finalCredit,
                requested_amount_usd: sourceUsd,
                credit_amount_usd: finalCredit,
                credit_calc_method: creditCalc.creditMethod,
                synced_at: new Date().toISOString(),
              }),
            })
            .where(and(eq(transactionsTable.id, tx.id), eq(transactionsTable.status, "pending")))
            .returning({ id: transactionsTable.id });
          if (flipped.length === 0) return;

          if (receivedCrypto > 0) {
            const { creditCryptoBalance } = await import("../lib/balance-service.js");
            await creditCryptoBalance(tx.userId, cryptoCurrency, receivedCrypto, txn);
          } else {
            await txn.update(usersTable).set({ balance: sql`balance + ${finalCredit}` }).where(eq(usersTable.id, tx.userId));
          }

          const [userAfter] = await txn.update(usersTable).set({
            totalDeposited: sql`coalesce(total_deposited, 0) + ${finalCredit}`,
            wagerRequirement: sql`coalesce(wager_requirement, 0) + ${finalCredit * WAGER_MULT}`,
          }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });

          if (userAfter) {
            const balanceAfter = parseFloat(userAfter.balance);
            await recordLedger(txn, {
              userId: tx.userId,
              amount: finalCredit,
              balanceBefore: balanceAfter - finalCredit,
              balanceAfter,
              reason: "admin_deposit_manual",
              referenceId: tx.id,
              referenceType: "transaction",
              note: "sync-plisio: plisio_status=" + plisioStatus + " confirmed by admin #" + req.user!.userId,
            });
          }
        });

        results.push({ id: tx.id, userId: tx.userId, plisioTrackId: tx.plisioTrackId, plisioStatus, action: "credited", creditAmount: finalCredit });

        logAudit({
          adminId: req.user!.userId,
          adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
          action: "sync_plisio_credit",
          targetType: "transaction",
          targetId: tx.id,
          oldValue: { status: "pending" },
          newValue: { status: "completed", creditAmount: finalCredit, plisioStatus },
          ip: req.ip,
          note: "sync-plisio credited $" + finalCredit + " to user #" + tx.userId,
        }).catch(() => {});
      } catch (txErr) {
        results.push({ id: tx.id, userId: tx.userId, plisioTrackId: tx.plisioTrackId, plisioStatus: null, action: "error", error: String(txErr) });
      }
    }

    const credited    = results.filter(r => r.action === "credited");
    const notPaid     = results.filter(r => r.action === "not_paid_yet");
    const errored     = results.filter(r => r.action === "error");
    const totalCredit = credited.reduce((sum, r) => sum + (r.creditAmount ?? 0), 0);
    req.log.info({ credited: credited.length, notPaid: notPaid.length, errored: errored.length, totalCredit }, "sync-plisio complete");
    res.json({
      results,
      summary: {
        total: pending.length,
        credited: credited.length,
        notPaid: notPaid.length,
        errored: errored.length,
        totalCreditedUsd: totalCredit,
      },
    });
  } catch (err) {
    req.log.error({ err }, "sync-plisio error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/live-users
// Returns a map of user IDs to their last seen page and timestamp
adminRouter.get("/live-users", async (req, res) => {
  if (!(global as any).__liveUsers) (global as any).__liveUsers = {};
  const now = Date.now();
  // Clean up stale users (inactive for > 1 min)
  for (const [uid, data] of Object.entries((global as any).__liveUsers)) {
    if (now - (data as any).lastSeen > 60000) delete (global as any).__liveUsers[uid];
  }
  res.json({ users: (global as any).__liveUsers });
});

// POST /api/admin/report-activity
// Publicly accessible beacon for users to report their current page
adminRouter.post("/report-activity", async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { page, timestamp } = req.body as { page: string; timestamp: number };
  if (!(global as any).__liveUsers) (global as any).__liveUsers = {};
  (global as any).__liveUsers[req.user.userId] = { 
    page, 
    lastSeen: timestamp || Date.now(),
    username: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user.userId)).limit(1))[0]?.username ?? "unknown"
  };
  res.json({ success: true });
});

// GET /api/admin/stats
adminRouter.get("/stats", async (req, res) => {
  try {
    const [{ totalUsers }] = await db
      .select({ totalUsers: sql<number>`count(*)` })
      .from(usersTable);

    const [{ totalBets }] = await db
      .select({ totalBets: sql<number>`count(*)` })
      .from(betsTable);

    const [{ totalWagered }] = await db
      .select({ totalWagered: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(betsTable);

    const [{ biggestWin }] = await db
      .select({ biggestWin: sql<number>`coalesce(max(payout::numeric), 0)` })
      .from(betsTable);

    const [{ pendingWithdrawals }] = await db
      .select({ pendingWithdrawals: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending")));

    const [{ pendingWithdrawalAmount }] = await db
      .select({ pendingWithdrawalAmount: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending")));

    // Withdrawals stuck in an ambiguous state (needs_review, or processing for >5 min) that
    // the owner must reconcile. Kept separate from the pending queue/counts on purpose.
    const needsReviewFilter = sql`(${transactionsTable.status} = 'needs_review' OR (${transactionsTable.status} = 'processing' AND ${transactionsTable.updatedAt} < now() - interval '5 minutes'))`;
    const [{ needsReviewWithdrawals }] = await db
      .select({ needsReviewWithdrawals: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), needsReviewFilter));

    const [{ needsReviewAmount }] = await db
      .select({ needsReviewAmount: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), needsReviewFilter));

    const [{ bannedUsers }] = await db
      .select({ bannedUsers: sql<number>`count(*)` })
      .from(usersTable)
      .where(eq(usersTable.isBanned, true));

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ activeToday }] = await db
      .select({ activeToday: sql<number>`count(distinct user_id)` })
      .from(betsTable)
      .where(sql`created_at > ${oneDayAgo}`);

    const [{ totalDeposited }] = await db
      .select({ totalDeposited: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "completed")));

    const [{ totalWithdrawn }] = await db
      .select({ totalWithdrawn: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "completed")));

    const [{ newUsersToday }] = await db
      .select({ newUsersToday: sql<number>`count(*)` })
      .from(usersTable)
      .where(sql`created_at > ${oneDayAgo}`);

    res.json({
      totalUsers: Number(totalUsers),
      totalBets: Number(totalBets),
      totalWagered: Number(totalWagered),
      biggestWin: Number(biggestWin),
      pendingWithdrawals: Number(pendingWithdrawals),
      pendingWithdrawalAmount: Number(pendingWithdrawalAmount),
      needsReviewWithdrawals: Number(needsReviewWithdrawals),
      needsReviewAmount: Number(needsReviewAmount),
      bannedUsers: Number(bannedUsers),
      activeToday: Number(activeToday),
      totalDeposited: Number(totalDeposited),
      totalWithdrawn: Number(totalWithdrawn),
      newUsersToday: Number(newUsersToday),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── ACCOUNT TYPE SYSTEM ───────────────────────────────────────────────────────

// PATCH /api/admin/users/:id/account-type
// Only the owner (fanodgc / role=owner) can set account types and promo balance
// When promoting to admin role, auto-generates a one-time-viewable DGC Bank PIN
adminRouter.patch("/users/:id/account-type", async (req, res) => {
  // Verify caller is owner
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the platform owner can change account types" });
    return;
  }

  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { accountType, promoBalance, role, commissionRate, displayName } = req.body as {
    accountType?: "normal" | "creator" | "tester";
    promoBalance?: number;
    role?: "player" | "admin";
    commissionRate?: number;
    displayName?: string;
  };

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Prevent changing the owner account
  if (isOwnerAccount(target)) {
    res.status(403).json({ error: "Cannot modify the owner account" });
    return;
  }

  const updates: Record<string, any> = {};
  let plainPin: string | null = null;

  // Set account type and withdrawal eligibility
  if (accountType) {
    updates.accountType = accountType;
    // creator and tester accounts cannot withdraw
    updates.withdrawalsEnabled = accountType === "normal";
  }

  // Specialty Creator Fields
  // commissionRate is stored as a decimal fraction (e.g. 0.10 = 10%).
  // Frontend sends percentage values (e.g. 10 for 10%), so we always divide by 100.
  if (commissionRate !== undefined) {
    if (commissionRate === null) {
      updates.commissionRate = null;
    } else {
      updates.commissionRate = String(commissionRate / 100);
    }
  }
  if (displayName !== undefined) {
    updates.displayName = displayName;
  }

  // Set promo balance (house credits)
  if (typeof promoBalance === "number" && promoBalance >= 0) {
    updates.promoBalance = String(promoBalance);
    // DO NOT mirror to balance — keep house credits separate from real money
  }

  // Promote to admin — auto-generate PIN
  if (role === "admin" && target.role !== "admin") {
    updates.role = "admin";
    // Generate a secure random 10-digit PIN — stored as plain text for owner visibility
    plainPin = String(crypto.randomInt(1000000000, 9999999999));
    updates.dgcBankPin = plainPin;
    updates.dgcBankPinRevealed = false;
  }

  // Demote from admin back to player
  if (role === "player" && target.role === "admin") {
    updates.role = "player";
    updates.dgcBankPin = null;
    updates.dgcBankPinRevealed = false;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    updated: { ...updates, dgcBankPin: undefined }, // never return hash
    // Return plaintext PIN exactly once — owner must note it down
    ...(plainPin ? { newAdminPin: plainPin, pinWarning: "Save this PIN now. It will never be shown again." } : {}),
  });
});

// GET /api/admin/users/:id/reveal-pin
// Owner only — reveals the plain PIN once, then marks it as revealed forever
adminRouter.get("/users/:id/reveal-pin", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can reveal admin PINs" });
    return;
  }

  const targetId = parseInt(req.params.id);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!target.dgcBankPin) { res.status(404).json({ error: "No PIN set for this user" }); return; }
  if (target.dgcBankPinRevealed) {
    res.status(410).json({ error: "PIN has already been revealed and cannot be shown again. Reset by demoting and re-promoting the admin." });
    return;
  }

  // Mark as revealed — this is irreversible
  await db.update(usersTable)
    .set({ dgcBankPinRevealed: true })
    .where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    warning: "This PIN will never be shown again. Write it down now.",
    // We cannot return the plaintext here — it was only available at creation
    // The owner must use the PIN shown at promotion time
    message: "PIN was shown at the time of admin promotion. This endpoint only confirms the PIN exists. To reset: demote the admin to player, then re-promote to generate a new PIN.",
  });
});

// GET /api/admin/users/:id/bank-pin — owner only, returns plain PIN anytime
adminRouter.get("/users/:id/bank-pin", requireAdmin, async (req, res) => {
  const [caller] = await db.select({ username: usersTable.username, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.username !== "fanodgc") {
    res.status(403).json({ error: "Owner only" }); return;
  }
  const targetId = parseInt(String(req.params.id), 10);
  const [target] = await db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, dgcBankPin: usersTable.dgcBankPin })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "User is not an admin" }); return; }
  res.json({ pin: target.dgcBankPin ?? null, username: target.username });
});

// POST /api/admin/users/:id/regenerate-pin — owner only, generates a fresh PIN
adminRouter.post("/users/:id/regenerate-pin", requireAdmin, async (req, res) => {
  const [caller] = await db.select({ username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.username !== "fanodgc") {
    res.status(403).json({ error: "Owner only" }); return;
  }
  const targetId = parseInt(String(req.params.id), 10);
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role, username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "User is not an admin" }); return; }
  const newPin = await generateUniqueBankPin();
  await db.update(usersTable).set({ dgcBankPin: newPin, dgcBankPinRevealed: false }).where(eq(usersTable.id, targetId));
  res.json({ success: true, pin: newPin, username: target.username });
});

const bankPinAttempts = new Map<number, number[]>();
const BANK_PIN_WINDOW_MS = 15 * 60 * 1000;
const BANK_PIN_MAX_ATTEMPTS = 5;

// POST /api/admin/verify-bank-pin
// Admin verifies their DGC Bank PIN to access the bank section
adminRouter.post("/verify-bank-pin", async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin || pin.length < 5 || pin.length > 15) {
    res.status(400).json({ error: "PIN must be 5 to 15 digits" });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    dgcBankPin: usersTable.dgcBankPin,
    role: usersTable.role,
  }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  if (!user.dgcBankPin) { res.status(403).json({ error: "No DGC Bank PIN set for your account" }); return; }

  const now = Date.now();
  const attempts = (bankPinAttempts.get(user.id) ?? []).filter((t) => now - t < BANK_PIN_WINDOW_MS);
  if (attempts.length >= BANK_PIN_MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many PIN attempts. Try again in 15 minutes." });
    return;
  }

  // Verify PIN — direct plain text comparison
  if (pin !== user.dgcBankPin) {
    attempts.push(now);
    bankPinAttempts.set(user.id, attempts);
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }
  bankPinAttempts.delete(user.id);

  // Issue a short-lived bank session token (valid 70 minutes — 1h10m)
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 70 * 60 * 1000).toISOString();

  // Store token temporarily in memory (simple approach — good enough for admin panel)
  if (!(global as any).__bankSessions) (global as any).__bankSessions = {};
  (global as any).__bankSessions[sessionToken] = { userId: user.id, expiresAt };

  res.json({ success: true, sessionToken, expiresAt });
});



// ── Tournament Admin Management ───────────────────────────────────────────────

// GET /api/admin/tournaments — list all with participant counts
adminRouter.get("/tournaments", async (req, res) => {
  try {
    const rows = await db.select().from(tournamentsTable).orderBy(desc(tournamentsTable.startAt)).limit(50);
    const now = new Date();
    const enriched = await Promise.all(rows.map(async (t) => {
      const [countRow] = await db.select({ n: count() }).from(tournamentEntriesTable).where(eq(tournamentEntriesTable.tournamentId, t.id));
      const liveStatus = now >= new Date(t.endAt) ? "ended" : now >= new Date(t.startAt) ? "active" : "upcoming";
      return {
        id: t.id, name: t.name, description: t.description,
        prize: parseFloat(t.prize), status: liveStatus,
        startAt: t.startAt.toISOString(), endAt: t.endAt.toISOString(),
        createdAt: t.createdAt.toISOString(), participants: Number(countRow?.n ?? 0),
      };
    }));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Admin list tournaments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/tournaments/:id/leaderboard
adminRouter.get("/tournaments/:id/leaderboard", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).limit(1);
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    const entries = await db
      .select({ userId: tournamentEntriesTable.userId, score: tournamentEntriesTable.score, username: usersTable.username })
      .from(tournamentEntriesTable)
      .innerJoin(usersTable, eq(tournamentEntriesTable.userId, usersTable.id))
      .where(eq(tournamentEntriesTable.tournamentId, id))
      .orderBy(desc(sql`CAST(${tournamentEntriesTable.score} AS DECIMAL)`))
      .limit(50);
    res.json({
      tournament: { id: tournament.id, name: tournament.name, prize: parseFloat(tournament.prize), status: tournament.status, startAt: tournament.startAt.toISOString(), endAt: tournament.endAt.toISOString() },
      leaderboard: entries.map((e, i) => ({ rank: i + 1, userId: e.userId, username: e.username, score: parseFloat(e.score) })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin tournament leaderboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/tournaments — create a tournament
adminRouter.post("/tournaments", async (req, res) => {
  const { name, description, prize, startAt, endAt } = req.body as { name?: string; description?: string; prize?: number; startAt?: string; endAt?: string };
  if (!name?.trim() || !startAt || !endAt) { res.status(400).json({ error: "name, startAt and endAt are required" }); return; }
  if (isNaN(Date.parse(startAt)) || isNaN(Date.parse(endAt))) { res.status(400).json({ error: "Invalid date format" }); return; }
  if (new Date(endAt) <= new Date(startAt)) { res.status(400).json({ error: "endAt must be after startAt" }); return; }
  try {
    const [created] = await db.insert(tournamentsTable).values({
      name: name.trim(),
      description: description?.trim() || null,
      prize: String(prize ?? 0),
      status: new Date(startAt) > new Date() ? "upcoming" : "active",
      startAt: new Date(startAt),
      endAt: new Date(endAt),
    }).returning();
    req.log.info({ tournamentId: created.id, name: created.name }, "Admin created tournament");
    res.json({ success: true, tournament: { ...created, prize: parseFloat(created.prize) } });
  } catch (err) {
    req.log.error({ err }, "Admin create tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/tournaments/:id — update tournament fields
adminRouter.patch("/tournaments/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { name, description, prize, startAt, endAt, status } = req.body as { name?: string; description?: string; prize?: number; startAt?: string; endAt?: string; status?: string };
  try {
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (prize !== undefined) updates.prize = String(prize);
    if (startAt) updates.startAt = new Date(startAt);
    if (endAt) updates.endAt = new Date(endAt);
    if (status) updates.status = status;
    const [updated] = await db.update(tournamentsTable).set(updates).where(eq(tournamentsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Tournament not found" }); return; }
    req.log.info({ tournamentId: id }, "Admin updated tournament");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin update tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/tournaments/:id
adminRouter.delete("/tournaments/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(tournamentEntriesTable).where(eq(tournamentEntriesTable.tournamentId, id));
    await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id));
    req.log.info({ tournamentId: id }, "Admin deleted tournament");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin delete tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/tournaments/:id/end — force-end a tournament now
adminRouter.post("/tournaments/:id/end", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).limit(1);
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    await db.update(tournamentsTable).set({ status: "ended", endAt: new Date() }).where(eq(tournamentsTable.id, id));
    const [top] = await db
      .select({ userId: tournamentEntriesTable.userId, score: tournamentEntriesTable.score, username: usersTable.username })
      .from(tournamentEntriesTable)
      .innerJoin(usersTable, eq(tournamentEntriesTable.userId, usersTable.id))
      .where(eq(tournamentEntriesTable.tournamentId, id))
      .orderBy(desc(sql`CAST(${tournamentEntriesTable.score} AS DECIMAL)`))
      .limit(1);
    req.log.info({ tournamentId: id, winner: top?.username }, "Admin force-ended tournament");
    res.json({ success: true, winner: top ? { userId: top.userId, username: top.username, score: parseFloat(top.score) } : null });
  } catch (err) {
    req.log.error({ err }, "Admin end tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/tournaments/:id/award — credit prize to a winner's balance
adminRouter.post("/tournaments/:id/award", requireBankSession, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, amount } = req.body as { userId?: number; amount?: number };
  if (!userId || !amount || amount <= 0) { res.status(400).json({ error: "userId and amount > 0 are required" }); return; }
  try {
    const [target] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) { res.status(404).json({ error: "User not found" }); return; }
    await creditBalance(userId, amount);
    await db.insert(transactionsTable).values({
      userId, type: "bet_win", amount: String(amount), currency: "USD", status: "completed",
      metadata: JSON.stringify({ source: "tournament_prize", tournamentId: id, awardedBy: req.user!.userId }),
    });
    req.log.info({ tournamentId: id, userId, amount, username: target.username }, "Admin awarded tournament prize");
    res.json({ success: true, username: target.username, amount });
  } catch (err) {
    req.log.error({ err }, "Admin award tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin Chat ─────────────────────────────────────────────────────────────

// GET /api/admin/chat?since=<id>  — poll for messages
adminRouter.get("/chat", async (req, res) => {
  const since = parseInt(String(req.query.since ?? "0"), 10) || 0;
  try {
    const msgs = await db
      .select()
      .from(adminMessagesTable)
      .orderBy(desc(adminMessagesTable.createdAt))
      .limit(100);
    const ordered = msgs.reverse();
    const result = since > 0 ? ordered.filter((m) => m.id > since) : ordered;
    res.json({ messages: result });
  } catch (err) {
    req.log.error({ err }, "Admin chat get error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/chat  — send a message
adminRouter.post("/chat", async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message?.trim() || message.trim().length > 1000) {
    res.status(400).json({ error: "Message required (max 1000 chars)" });
    return;
  }
  try {
    const [caller] = await db
      .select({ username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    const [msg] = await db
      .insert(adminMessagesTable)
      .values({
        userId: req.user!.userId,
        username: caller?.username ?? "Unknown",
        role: caller?.role ?? "admin",
        message: message.trim(),
      })
      .returning();
    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "Admin chat post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/chat/:id  — owner only
adminRouter.delete("/chat/:id", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const msgId = parseInt(req.params.id, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(adminMessagesTable).where(eq(adminMessagesTable.id, msgId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin chat delete error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Messaging (DMs + Broadcasts to Creators/Admins) ─────────────────────────

// GET /api/admin/chat/recipients  — list all admins + creators for DM selection
adminRouter.get("/chat/recipients", async (req, res) => {
  try {
    const admins = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "owner")));

    const creators = await db
      .select({ id: usersTable.id, username: usersTable.username, accountType: usersTable.accountType })
      .from(usersTable)
      .where(eq(usersTable.accountType, "creator"));

    const myId = req.user!.userId;
    res.json({
      admins: admins.filter(a => a.id !== myId).map(a => ({ id: a.id, username: a.username, role: a.role })),
      creators: creators.map(c => ({ id: c.id, username: c.username, accountType: c.accountType })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin chat recipients error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/messages  — send a DM or broadcast
adminRouter.post("/messages", async (req, res) => {
  const { recipientType, recipientId, message } = req.body as {
    recipientType?: string;
    recipientId?: number;
    message?: string;
  };

  const validTypes = ["direct", "broadcast_all", "broadcast_admins", "broadcast_creators"];
  if (!recipientType || !validTypes.includes(recipientType)) {
    res.status(400).json({ error: "recipientType must be one of: " + validTypes.join(", ") });
    return;
  }
  if (recipientType === "direct" && !recipientId) {
    res.status(400).json({ error: "recipientId required for direct messages" });
    return;
  }
  if (!message?.trim() || message.trim().length > 2000) {
    res.status(400).json({ error: "Message required (max 2000 chars)" });
    return;
  }

  try {
    const [caller] = await db
      .select({ username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    const [msg] = await db
      .insert(creatorMessagesTable)
      .values({
        senderId: req.user!.userId,
        senderUsername: caller?.username ?? "Admin",
        senderRole: caller?.role ?? "admin",
        recipientType,
        recipientId: recipientType === "direct" ? recipientId : null,
        message: message.trim(),
      })
      .returning();

    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "Admin messages post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/messages?recipientType=direct&recipientId=x  — fetch DM thread or broadcast history
adminRouter.get("/messages", async (req, res) => {
  const { recipientType, recipientId } = req.query as { recipientType?: string; recipientId?: string };
  const myId = req.user!.userId;

  try {
    let msgs: any[];

    if (recipientType === "direct" && recipientId) {
      const targetId = parseInt(recipientId, 10);
      msgs = await db
        .select()
        .from(creatorMessagesTable)
        .where(
          and(
            eq(creatorMessagesTable.recipientType, "direct"),
            or(
              and(eq(creatorMessagesTable.senderId, myId), eq(creatorMessagesTable.recipientId, targetId)),
              and(eq(creatorMessagesTable.senderId, targetId), eq(creatorMessagesTable.recipientId, myId)),
            ),
          ),
        )
        .orderBy(desc(creatorMessagesTable.createdAt))
        .limit(100);
    } else if (recipientType) {
      msgs = await db
        .select()
        .from(creatorMessagesTable)
        .where(eq(creatorMessagesTable.recipientType, recipientType))
        .orderBy(desc(creatorMessagesTable.createdAt))
        .limit(100);
    } else {
      msgs = await db
        .select()
        .from(creatorMessagesTable)
        .orderBy(desc(creatorMessagesTable.createdAt))
        .limit(100);
    }

    res.json({ messages: msgs.reverse() });
  } catch (err) {
    req.log.error({ err }, "Admin messages get error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/chat/unread  — unread count: group chat + DMs for this admin
adminRouter.get("/chat/unread", async (req, res) => {
  const lastGroupId = parseInt(String(req.query.lastGroupId ?? "0"), 10) || 0;
  const myId = req.user!.userId;

  try {
    const [{ groupUnread }] = await db
      .select({ groupUnread: count() })
      .from(adminMessagesTable)
      .where(
        and(
          gt(adminMessagesTable.id, lastGroupId),
          ne(adminMessagesTable.userId, myId),
        ),
      );

    const dmMessages = await db
      .select({ id: creatorMessagesTable.id })
      .from(creatorMessagesTable)
      .where(
        and(
          eq(creatorMessagesTable.recipientType, "direct"),
          eq(creatorMessagesTable.recipientId, myId),
        ),
      );

    const dmIds = dmMessages.map(m => m.id);
    let dmUnread = 0;
    if (dmIds.length > 0) {
      const reads = await db
        .select({ messageId: creatorMessageReadsTable.messageId })
        .from(creatorMessageReadsTable)
        .where(eq(creatorMessageReadsTable.userId, myId));
      const readSet = new Set(reads.map(r => r.messageId));
      dmUnread = dmIds.filter(id => !readSet.has(id)).length;
    }

    res.json({ groupUnread, dmUnread, total: groupUnread + dmUnread });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/messages/read  — mark DMs as read
adminRouter.post("/messages/read", async (req, res) => {
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
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Commission Tracking ──────────────────────────────────────────────────────

// GET /api/admin/creators?month=YYYY-MM
// Returns all creator/affiliate users with commission stats for the given month.
// Defaults to the current calendar month.
adminRouter.get("/creators", async (req, res) => {
  try {
    const monthParam = typeof req.query.month === "string" ? req.query.month : null;
    let monthStart: Date;
    let monthEnd: Date;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      monthStart = new Date(y, m - 1, 1);
      monthEnd = new Date(y, m, 1);
    } else {
      const now = new Date();
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // All users who are creators or affiliates (role or accountType = creator, exclude owner)
    const creators = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        accountType: usersTable.accountType,
        role: usersTable.role,
        promoBalance: usersTable.promoBalance,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.accountType, "creator"),
          eq(usersTable.role, "creator"),
        ),
      )
      .orderBy(desc(usersTable.createdAt));

    const { getReferralTier } = await import("./referrals.js");

    const results = await Promise.all(
      creators.map(async (c) => {
        // Active referral count
        const [{ activeCount }] = await db
          .select({ activeCount: count() })
          .from(referralsTable)
          .where(and(eq(referralsTable.referrerId, c.id), eq(referralsTable.status, "active")));

        // Commission earned THIS month (referral_commission type only)
        const [{ monthlyEarned }] = await db
          .select({ monthlyEarned: sql<string>`COALESCE(SUM(CAST(${creatorBankTxnsTable.amount} AS DECIMAL)), 0)` })
          .from(creatorBankTxnsTable)
          .where(
            and(
              eq(creatorBankTxnsTable.creatorId, c.id),
              eq(creatorBankTxnsTable.type, "referral_commission"),
              sql`${creatorBankTxnsTable.createdAt} >= ${monthStart.toISOString()}`,
              sql`${creatorBankTxnsTable.createdAt} < ${monthEnd.toISOString()}`,
            ),
          );

        // Total lifetime commission earned (referral_commission only)
        const [{ lifetimeEarned }] = await db
          .select({ lifetimeEarned: sql<string>`COALESCE(SUM(CAST(${creatorBankTxnsTable.amount} AS DECIMAL)), 0)` })
          .from(creatorBankTxnsTable)
          .where(
            and(
              eq(creatorBankTxnsTable.creatorId, c.id),
              eq(creatorBankTxnsTable.type, "referral_commission"),
            ),
          );

        // Total admin deposits ever (for context)
        const [{ totalDeposited }] = await db
          .select({ totalDeposited: sql<string>`COALESCE(SUM(CAST(${creatorBankTxnsTable.amount} AS DECIMAL)), 0)` })
          .from(creatorBankTxnsTable)
          .where(
            and(
              eq(creatorBankTxnsTable.creatorId, c.id),
              eq(creatorBankTxnsTable.type, "admin_deposit"),
            ),
          );

        const [specialty] = await db.select({ commissionRate: usersTable.commissionRate }).from(usersTable).where(eq(usersTable.id, c.id)).limit(1);
        const tier = getReferralTier(activeCount);
        const commissionRate = specialty?.commissionRate ? parseFloat(specialty.commissionRate) : tier.commissionRate;

        return {
          id: c.id,
          username: c.username,
          accountType: c.accountType,
          role: c.role,
          promoBalance: parseFloat(c.promoBalance ?? "0"),
          activeReferrals: activeCount,
          monthlyCommission: parseFloat(monthlyEarned ?? "0"),
          lifetimeCommission: parseFloat(lifetimeEarned ?? "0"),
          totalAdminDeposits: parseFloat(totalDeposited ?? "0"),
          tier: specialty?.commissionRate ? "Specialty" : tier.tier,
          group: specialty?.commissionRate ? "Partner" : tier.group,
          color: specialty?.commissionRate ? "#ec4899" : tier.color,
          emoji: specialty?.commissionRate ? "💎" : tier.emoji,
          commissionPct: Math.round(commissionRate * 100),
          joinedAt: c.createdAt.toISOString(),
        };
      }),
    );

    res.json({ creators: results, month: monthParam ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}` });
  } catch (err) {
    req.log?.error({ err }, "Admin creators list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/creators/:id/deposit
// Owner-only: manually deposit to a creator's promo balance.
adminRouter.post("/creators/:id/deposit", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const creatorId = parseInt(req.params.id, 10);
  if (isNaN(creatorId)) { res.status(400).json({ error: "Invalid creator id" }); return; }

  const { amount, note } = req.body as { amount?: number; note?: string };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount > 0 required" });
    return;
  }

  try {
    const [target] = await db
      .select({ id: usersTable.id, username: usersTable.username, promoBalance: usersTable.promoBalance })
      .from(usersTable)
      .where(eq(usersTable.id, creatorId))
      .limit(1);

    if (!target) { res.status(404).json({ error: "Creator not found" }); return; }

    const newBalance = parseFloat(target.promoBalance ?? "0") + amount;

    await db.transaction(async (txn) => {
      await txn.update(usersTable)
        .set({ promoBalance: String(newBalance) })
        .where(eq(usersTable.id, creatorId));

      await txn.insert(creatorBankTxnsTable).values({
        creatorId,
        type: "admin_deposit",
        amount: String(amount),
        description: note?.trim() || `Admin commission deposit`,
      });
    });

    await logAudit({
      adminId: req.user!.userId,
      adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
      action: "admin_commission_deposit",
      targetType: "user",
      targetId: creatorId,
      oldValue: { promoBalance: target.promoBalance },
      newValue: { amount, note, newBalance },
      ip: req.ip,
    });

    res.json({ success: true, newPromoBalance: newBalance, username: target.username });
  } catch (err) {
    req.log?.error({ err }, "Admin creator deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/messages/:id  — owner only
adminRouter.delete("/messages/:id", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const msgId = parseInt(req.params.id, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(creatorMessagesTable).where(eq(creatorMessagesTable.id, msgId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── SLOT ENGINE: THEME MANAGEMENT ──────────────────────────────────────────

// GET /api/admin/slots/themes
adminRouter.get("/slots/themes", async (req, res) => {
  try {
    const themes = await db.select().from(slotThemesTable).orderBy(desc(slotThemesTable.createdAt));
    res.json({ themes });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/slots/themes
adminRouter.post("/slots/themes", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const { slug, name, config, assets } = req.body;
  if (!slug || !name || !config || !assets) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  try {
    const [theme] = await db.insert(slotThemesTable).values({
      slug,
      name,
      config,
      assets,
    }).returning();

    const adminUsername = (
      await db.select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.userId))
        .limit(1)
    )[0]?.username ?? "admin";
    logAudit({
      adminId: req.user!.userId,
      adminUsername,
      action: "slot_theme_create",
      targetType: "platform",
      targetId: theme.id,
      newValue: { slug: theme.slug, name: theme.name },
      ip: req.ip,
    }).catch(() => {});

    invalidatePublicGamesCache();
    res.json({ theme });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/slots/themes/:id
adminRouter.patch("/slots/themes/:id", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  const { name, config, assets, active } = req.body;
  try {
    const [before] = await db.select().from(slotThemesTable).where(eq(slotThemesTable.id, id)).limit(1);
    if (!before) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }

    const updates: any = {};
    if (name) updates.name = name;
    if (config) updates.config = config;
    if (assets) updates.assets = assets;
    if (active !== undefined) updates.active = String(active);
    updates.updatedAt = new Date();

    const [updated] = await db.update(slotThemesTable).set(updates).where(eq(slotThemesTable.id, id)).returning();

    if (!updated) {
      res.status(500).json({ error: "Update failed" });
      return;
    }

    const isToggleOnly = active !== undefined && !name && !config && !assets;
    const action = isToggleOnly ? "slot_theme_toggle" : "slot_theme_update";

    // Build per-field diff: only include fields that actually changed
    const oldDiff: Record<string, unknown> = {};
    const newDiff: Record<string, unknown> = {};
    if (name && name !== before.name)       { oldDiff.name   = before.name;   newDiff.name   = updated.name;   }
    if (config)                             { oldDiff.config = before.config; newDiff.config = updated.config; }
    if (assets)                             { oldDiff.assets = before.assets; newDiff.assets = updated.assets; }
    if (active !== undefined)               { oldDiff.active = before.active; newDiff.active = updated.active; }

    const adminUsername = (
      await db.select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.userId))
        .limit(1)
    )[0]?.username ?? "admin";
    logAudit({
      adminId: req.user!.userId,
      adminUsername,
      action,
      targetType: "platform",
      targetId: id,
      oldValue: oldDiff,
      newValue: newDiff,
      ip: req.ip,
      note: `Theme slug: ${before.slug}`,
    }).catch(() => {});

    invalidatePublicGamesCache();
    res.json({ theme: updated });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/audit-logs — paginated admin audit log viewer
// Query: ?page=1&limit=50&action=&adminId=&targetType=
adminRouter.get("/audit-logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"))));
    const offset = (page - 1) * limit;
    const actionFilter = String(req.query.action ?? "").trim();
    const adminIdFilter = req.query.adminId ? parseInt(String(req.query.adminId)) : null;
    const targetTypeFilter = String(req.query.targetType ?? "").trim();

    const conditions: any[] = [];
    if (actionFilter) conditions.push(ilike(adminAuditLogsTable.action, `%${actionFilter}%`));
    if (adminIdFilter) conditions.push(eq(adminAuditLogsTable.adminId, adminIdFilter));
    if (targetTypeFilter) conditions.push(eq(adminAuditLogsTable.targetType as any, targetTypeFilter));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, [{ total }]] = await Promise.all([
      db
        .select()
        .from(adminAuditLogsTable)
        .where(whereClause)
        .orderBy(desc(adminAuditLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(adminAuditLogsTable)
        .where(whereClause),
    ]);

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        adminId: l.adminId,
        adminUsername: l.adminUsername,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        oldValue: l.oldValue ? JSON.parse(l.oldValue) : null,
        newValue: l.newValue ? JSON.parse(l.newValue) : null,
        ip: l.ip,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
