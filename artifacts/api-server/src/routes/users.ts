import { Router } from "express";
import crypto from "crypto";
import { db, usersTable, userBalancesTable, transactionsTable } from "@workspace/db";
import { eq, ilike, sql } from "drizzle-orm";
import { getCryptoPrice } from "../lib/price-service.js";
import { deductBalance, creditBalance, getUserBalance } from "../lib/balance-service.js";
import { requireAuth, isOwnerUser, isProtectedAccount } from "../middlewares/auth.js";
import { requireLocationVerified } from "../middlewares/location.js";
import { evaluateIpAccess } from "../lib/geo-policy.js";
import { lookupGeoByIp } from "../lib/geo-lookup.js";
import { sendEmailVerificationEmail } from "../lib/mail-service.js";
import { recordLedgerStandalone } from "../services/ledger.js";
import { logFinancialActivity, logActivity, linkVisitorToUser } from "../services/activity-log.js";
import { getRequestContext } from "../lib/request-context.js";
import {
  getGamblingLimitsState,
  updateGamblingLimits,
  type GamblingLimits,
} from "../services/gambling-limits.js";
export const usersRouter = Router();

const verifyResendAttempts = new Map<number, number[]>();
const VERIFY_RESEND_WINDOW_MS = 60_000;
const VERIFY_RESEND_MAX = 3;

const verifyCodeAttempts = new Map<number, number[]>();
const VERIFY_CODE_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_CODE_MAX = 10;

const VIP_TIERS = [
  { id: 0, min: 0,         rakebackPct: 5  },
  { id: 1, min: 1_000,      rakebackPct: 8  },
  { id: 2, min: 10_000,     rakebackPct: 12 },
  { id: 3, min: 50_000,     rakebackPct: 14 },
  { id: 4, min: 100_000,    rakebackPct: 17 },
  { id: 5, min: 250_000,    rakebackPct: 21 },
  { id: 6, min: 500_000,    rakebackPct: 26 },
  { id: 7, min: 1_000_000,  rakebackPct: 30 },
];
function getVipTier(wagered: number) {
  return VIP_TIERS.slice().reverse().find(t => wagered >= t.min) ?? VIP_TIERS[0];
}

usersRouter.get("/owner/plisio-balance", requireAuth, async (req, res) => {
  if (!req.user || !isOwnerUser(req.user)) { res.status(403).json({ error: "Owner access required" }); return; }
  try {
    const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
    if (!PLISIO_SECRET_KEY) { res.status(500).json({ error: "Plisio API key not configured (check PLISIO_SECRET_KEY, PLISIO_API_KEY, or API_KEY)" }); return; }
    const balances: Record<string, string> = {};
    
    // Try the /balances endpoint first (most reliable, returns all balances at once)
    try {
      const params = new URLSearchParams({ api_key: PLISIO_SECRET_KEY });
      const resp = await fetch(
        `https://api.plisio.net/api/v1/balances?${params.toString()}`,
        { signal: AbortSignal.timeout(12_000) },
      );
      const data = await resp.json() as {
        status?: string;
        data?: Record<string, { balance?: string; psys_cid?: string }>;
      };
      if (data.status === "success" && data.data) {
        // Map Plisio's internal coin IDs to our coin names
        const plisioToOurCoin: Record<string, string> = {
          BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
          BCH: "BCH", TRX: "TRX", XMR: "XMR", DASH: "DASH", TON: "TON",
          USDT_TRX: "USDT_TRX", USDT_TON: "USDT_TON",
        };
        for (const [key, val] of Object.entries(data.data)) {
          const upperKey = key.toUpperCase();
          const ourCoin = plisioToOurCoin[upperKey] ?? upperKey;
          const balance = val?.balance ?? "0";
          // Only include coins with non-zero balances (real data)
          if (parseFloat(balance) > 0) {
            balances[ourCoin] = balance;
          }
        }
      }
    } catch (balErr) {
      // Fallback to individual coin endpoints if /balances fails
      const COINS = ["BTC","ETH","LTC","DOGE","SOL","BCH","TRX","TON","USDT_TRX","USDT_TON","XMR","DASH"];
      await Promise.all(COINS.map(async (coin) => {
        try {
          const params = new URLSearchParams({ api_key: PLISIO_SECRET_KEY });
          const resp = await fetch(`https://api.plisio.net/api/v1/currencies/${coin}?${params.toString()}`);
          const data = await resp.json() as { status?: string; data?: { balance?: string } };
          if (data.status === "success" && data.data) {
            const balance = data.data.balance ?? "0";
            // Only include coins with non-zero balances (real data)
            if (parseFloat(balance) > 0) {
              balances[coin] = balance;
            }
          }
        } catch {}
      }));
    }
    
    res.json({ success: true, balances });
  } catch { res.status(500).json({ error: "Failed to fetch Plisio balances" }); }
});

usersRouter.post("/geo", requireAuth, async (req, res) => {
  const { deviceName, deviceOs, deviceBrowser, deviceType, vpnDetected, vpnProvider, fingerprint } = req.body;
  try {
    const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v : undefined);
    const serverGeo = await lookupGeoByIp(req.ip ?? "");
    if (!serverGeo?.country_code) {
      res.status(400).json({ error: "Unable to verify location from server IP", locationVerified: false });
      return;
    }

    const cc = serverGeo.country_code.toUpperCase();
    const access = evaluateIpAccess(serverGeo);
    const locationVerified = access.allowed;

    const updates = {
      geoCountry: serverGeo.country_name,
      geoCountryCode: cc,
      geoRegion: serverGeo.region,
      geoCity: serverGeo.city,
      geoIp: serverGeo.ip,
      geoAsn: serverGeo.asn,
      geoIsp: serverGeo.org,
      geoLat: serverGeo.latitude != null ? String(serverGeo.latitude) : undefined,
      geoLon: serverGeo.longitude != null ? String(serverGeo.longitude) : undefined,
      geoTimezone: serverGeo.timezone,
      deviceName: str(deviceName),
      deviceOs: str(deviceOs),
      deviceBrowser: str(deviceBrowser),
      deviceType: str(deviceType),
      vpnProvider: access.stateActor
        ? "State network"
        : access.vpn
          ? str(vpnProvider) ?? serverGeo.org
          : str(vpnProvider),
      deviceFingerprint: str(fingerprint),
      vpnDetected: access.vpn || access.datacenter || access.tor || access.stateActor,
      locationVerified,
    };
    if (Object.values(updates).some((v) => v !== undefined)) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId));
    }

    logActivity({
      userId: req.user!.userId,
      username: req.user!.username,
      action: locationVerified ? "geo_verified" : "geo_denied",
      ctx: getRequestContext(req),
      metadata: { countryCode: cc, region: serverGeo.region, city: serverGeo.city, code: access.code, signals: access.signals },
    });

    res.json({
      success: locationVerified,
      locationVerified,
      code: access.code,
      error: locationVerified ? undefined : access.reason,
    });
  } catch (err) { req.log.error({ err }, "Save geo error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.patch("/me/username", requireAuth, async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username || username.length < 3 || username.length > 20) { res.status(400).json({ error: "Username must be 3-20 characters" }); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" }); return; }
  if (username.toLowerCase() === "fanodgc") { res.status(403).json({ error: "That username is reserved" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.usernameChangedAt) {
      const daysSince = (Date.now() - new Date(user.usernameChangedAt).getTime()) / (1000*60*60*24);
      if (daysSince < 90) { const daysLeft = Math.ceil(90 - daysSince); res.status(429).json({ error: `You can change your username in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` }); return; }
    }
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.username, username)).limit(1);
    if (existing) { res.status(409).json({ error: "Username already taken" }); return; }
    const [updated] = await db.update(usersTable).set({ username, usernameChangedAt: new Date() }).where(eq(usersTable.id, req.user!.userId)).returning({ id: usersTable.id, username: usersTable.username, usernameChangedAt: usersTable.usernameChangedAt });
    res.json({ success: true, username: updated.username, usernameChangedAt: updated.usernameChangedAt });
  } catch (err: any) {
    if (err?.message?.includes("unique")) { res.status(409).json({ error: "Username already taken" }); return; }
    res.status(500).json({ error: "Internal server error" });
  }
});

usersRouter.patch("/me/profile", requireAuth, async (req, res) => {
  const { telegramUsername, email } = req.body as { telegramUsername?: string; email?: string };
  const updates: any = {};
  
  if (telegramUsername !== undefined) {
    if (telegramUsername === "") { updates.telegramUsername = null; }
    else {
      const cleaned = telegramUsername.replace(/^@/, "").trim();
      if (!/^[a-zA-Z0-9_]{5,32}$/.test(cleaned)) { res.status(400).json({ error: "Invalid Telegram username" }); return; }
      updates.telegramUsername = cleaned;
    }
  }

    if (email !== undefined) {
    if (email === "") { updates.email = null; updates.emailVerified = false; }
    else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Invalid email address" }); return; }
      // Check if email is taken
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.email, email)).limit(1);
      if (existing && existing.id !== req.user!.userId) { res.status(409).json({ error: "Email already taken" }); return; }
      updates.email = email;
      updates.emailVerified = false; // Reset verification on change
      
      // Send verification email
      const [currentUser] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
      if (currentUser) {
        // Generate 6-digit verification code with 24-hour expiry
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
        await db.update(usersTable).set({ emailVerificationCode: code, emailVerificationExpiresAt: expiresAt }).where(eq(usersTable.id, req.user!.userId));
        void sendEmailVerificationEmail(email, currentUser.username, code);
      }
    }
  }

  try {
    await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true, ...updates });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// Resend verification email
usersRouter.post("/me/verify/resend", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ 
      id: usersTable.id, 
      username: usersTable.username, 
      email: usersTable.email, 
      emailVerified: usersTable.emailVerified 
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.emailVerified) { res.status(400).json({ error: "Email already verified" }); return; }
    if (!user.email) { res.status(400).json({ error: "No email set" }); return; }

    const now = Date.now();
    const attempts = (verifyResendAttempts.get(req.user!.userId) ?? []).filter((t) => now - t < VERIFY_RESEND_WINDOW_MS);
    if (attempts.length >= VERIFY_RESEND_MAX) {
      res.status(429).json({ error: "Too many verification emails. Try again in a minute." });
      return;
    }
    attempts.push(now);
    verifyResendAttempts.set(req.user!.userId, attempts);

    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    await db.update(usersTable).set({ emailVerificationCode: code, emailVerificationExpiresAt: expiresAt }).where(eq(usersTable.id, req.user!.userId));
    
    await sendEmailVerificationEmail(user.email, user.username, code);
    res.json({ success: true, message: "Verification email sent" });
  } catch (err: any) {
    req.log.error({ err }, "Resend verification error");
    res.status(500).json({ error: "Failed to send email", details: err.message });
  }
});

// Verify email with code
usersRouter.post("/me/verify/code", requireAuth, async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "Verification code required" }); return; }
  
  try {
    const now = Date.now();
    const attempts = (verifyCodeAttempts.get(req.user!.userId) ?? []).filter((t) => now - t < VERIFY_CODE_WINDOW_MS);
    if (attempts.length >= VERIFY_CODE_MAX) {
      res.status(429).json({ error: "Too many verification attempts. Try again later." });
      return;
    }

    const [user] = await db.select({
      id: usersTable.id,
      emailVerificationCode: usersTable.emailVerificationCode,
      emailVerificationExpiresAt: usersTable.emailVerificationExpiresAt,
      emailVerified: usersTable.emailVerified
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.emailVerified) { res.status(400).json({ error: "Email already verified" }); return; }
    if (!user.emailVerificationCode) { res.status(400).json({ error: "No verification code sent" }); return; }
    
    if (user.emailVerificationExpiresAt && new Date() > user.emailVerificationExpiresAt) {
      res.status(400).json({ error: "Verification code expired" });
      return;
    }
    
    if (user.emailVerificationCode !== code) {
      attempts.push(now);
      verifyCodeAttempts.set(req.user!.userId, attempts);
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }
    verifyCodeAttempts.delete(req.user!.userId);
    
    await db.update(usersTable).set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null
    }).where(eq(usersTable.id, req.user!.userId));
    
    res.json({ success: true, message: "Email verified successfully" });
  } catch (err: any) {
    req.log.error({ err }, "Email verification error");
    res.status(500).json({ error: "Verification failed", details: err.message });
  }
});

// Verify email with link (from email) - JSON endpoint for API calls
usersRouter.get("/verify/:code", async (req, res) => {
  const { code } = req.params;
  if (!code) { res.status(400).json({ error: "Verification code required" }); return; }
  
  try {
    const [user] = await db.select({
      id: usersTable.id,
      emailVerificationCode: usersTable.emailVerificationCode,
      emailVerificationExpiresAt: usersTable.emailVerificationExpiresAt,
      emailVerified: usersTable.emailVerified
    }).from(usersTable).where(eq(usersTable.emailVerificationCode, code)).limit(1);

    if (!user) { res.status(404).json({ error: "Invalid verification code" }); return; }
    if (user.emailVerified) { res.status(400).json({ error: "Email already verified" }); return; }
    
    if (user.emailVerificationExpiresAt && new Date() > user.emailVerificationExpiresAt) {
      res.status(400).json({ error: "Verification code expired" });
      return;
    }
    
    await db.update(usersTable).set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null
    }).where(eq(usersTable.id, user.id));
    
    res.json({ success: true, message: "Email verified successfully" });
  } catch (err: any) {
    req.log.error({ err }, "Email verification link error");
    res.status(500).json({ error: "Verification failed", details: err.message });
  }
});

// Verify email with link (from email) - HTML response for browser clicks
usersRouter.get("/verify-link/:code", async (req, res) => {
  const { code } = req.params;
  if (!code) { res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verification Error</title><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#050507;color:#e7e7ee}h1{color:#FF6B6B}a{color:#39FF14;text-decoration:none;font-weight:bold}</style></head><body><h1>❌ Invalid Code</h1><p>No verification code provided.</p><a href="/">Back to DGC Arcade</a></body></html>`); return; }
  
  try {
    const [user] = await db.select({
      id: usersTable.id,
      emailVerificationCode: usersTable.emailVerificationCode,
      emailVerificationExpiresAt: usersTable.emailVerificationExpiresAt,
      emailVerified: usersTable.emailVerified
    }).from(usersTable).where(eq(usersTable.emailVerificationCode, code)).limit(1);

    if (!user) { res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verification Error</title><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#050507;color:#e7e7ee}h1{color:#FF6B6B}a{color:#39FF14;text-decoration:none;font-weight:bold}</style></head><body><h1>❌ Invalid Code</h1><p>This verification code doesn't exist or has already been used.</p><a href="/">Back to DGC Arcade</a></body></html>`); return; }
    if (user.emailVerified) { res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Already Verified</title><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#050507;color:#e7e7ee}h1{color:#39FF14}a{color:#39FF14;text-decoration:none;font-weight:bold}</style></head><body><h1>✅ Already Verified</h1><p>Your email is already verified!</p><a href="/">Back to DGC Arcade</a></body></html>`); return; }
    
    if (user.emailVerificationExpiresAt && new Date() > user.emailVerificationExpiresAt) {
      res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Code Expired</title><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#050507;color:#e7e7ee}h1{color:#FF6B6B}a{color:#39FF14;text-decoration:none;font-weight:bold}</style></head><body><h1>⏰ Code Expired</h1><p>This verification code has expired. Please request a new one.</p><a href="/settings">Request New Code</a></body></html>`);
      return;
    }
    
    await db.update(usersTable).set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null
    }).where(eq(usersTable.id, user.id));
    
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Verified</title><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#050507;color:#e7e7ee}h1{color:#39FF14}.success{margin:20px 0;font-size:18px}a{display:inline-block;margin-top:20px;padding:12px 24px;background:#39FF14;color:#06120a;text-decoration:none;border-radius:8px;font-weight:bold}</style></head><body><h1>✅ Email Verified!</h1><p class="success">Your email has been successfully verified. You can now access all DGC Arcade features including withdrawals.</p><a href="/">Return to DGC Arcade</a></body></html>`);
  } catch (err: any) {
    req.log.error({ err }, "Email verification link error");
    res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verification Error</title><style>body{font-family:sans-serif;text-align:center;padding:40px;background:#050507;color:#e7e7ee}h1{color:#FF6B6B}a{color:#39FF14;text-decoration:none;font-weight:bold}</style></head><body><h1>❌ Verification Failed</h1><p>An error occurred during verification. Please try again.</p><a href="/settings">Back to Settings</a></body></html>`);
  }
});

usersRouter.patch("/me/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) { res.status(400).json({ error: "Current and new password required" }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: "New password must be at least 6 characters" }); return; }
  
  try {
    const bcrypt = await import("bcryptjs");
    const [user] = await db.select({ passwordHash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Incorrect current password" }); return; }
    
    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true, message: "Password updated successfully" });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.post("/me/rakeback/claim", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const result = await db.transaction(async (txn) => {
      await txn.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

      const [user] = await txn
        .select({ totalWageredAmount: usersTable.totalWageredAmount, rakebackClaimed: usersTable.rakebackClaimed })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");

      const wagered = parseFloat(user.totalWageredAmount ?? "0");
      const tier = getVipTier(wagered);
      const rakebackRate = tier.rakebackPct / 100;
      const totalRakeback = wagered * rakebackRate;
      const claimed = parseFloat(user.rakebackClaimed ?? "0");
      const available = Math.max(0, totalRakeback - claimed);
      if (available < 0.01) throw new Error("NO_RAKEBACK");

      const newClaimed = (claimed + available).toFixed(8);
      await txn.update(usersTable).set({
        balance: sql`balance + ${available.toFixed(8)}`,
        rakebackClaimed: newClaimed,
      }).where(eq(usersTable.id, userId));

      return { claimedAmount: available, tier: tier.id };
    });

    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NO_RAKEBACK") {
      res.status(400).json({ error: "No rakeback available to claim" });
      return;
    }
    if (msg === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    req.log.error({ err }, "Rakeback claim error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/tip — authenticated players send real-money tips (not admin-only)
usersRouter.post("/tip", requireAuth, requireLocationVerified, async (req, res) => {
  const { toUsername, amount } = req.body as { toUsername?: string; amount?: number };
  if (!toUsername?.trim() || !amount || amount <= 0) {
    res.status(400).json({ error: "Username and a positive amount are required" });
    return;
  }
  if (amount > 10_000) {
    res.status(400).json({ error: "Tip amount too large" });
    return;
  }

  try {
    const senderId = req.user!.userId;
    const [recipient] = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(ilike(usersTable.username, toUsername.trim()))
      .limit(1);

    if (!recipient) { res.status(404).json({ error: "User not found" }); return; }
    if (recipient.id === senderId) { res.status(400).json({ error: "Cannot tip yourself" }); return; }
    if (isProtectedAccount(recipient)) { res.status(400).json({ error: "Cannot tip the house account" }); return; }

    const balanceBefore = (await getUserBalance(senderId)).totalBalance;
    let senderBalanceAfter: number;
    try {
      senderBalanceAfter = await deductBalance(senderId, amount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Insufficient balance";
      res.status(400).json({ error: msg });
      return;
    }

    const recipientBalanceAfter = await creditBalance(recipient.id, amount);

    await db.insert(transactionsTable).values([
      {
        userId: senderId,
        type: "tip_sent",
        amount: String(amount),
        currency: "USD",
        status: "completed",
        metadata: JSON.stringify({ toUsername: recipient.username }),
      },
      {
        userId: recipient.id,
        type: "tip_received",
        amount: String(amount),
        currency: "USD",
        status: "completed",
        metadata: JSON.stringify({ fromUsername: req.user!.username }),
      },
    ]);

    recordLedgerStandalone({
      userId: senderId,
      amount: -amount,
      balanceBefore,
      balanceAfter: senderBalanceAfter,
      reason: "tip_sent",
      note: `Tip to @${recipient.username}`,
    }).catch(() => {});
    recordLedgerStandalone({
      userId: recipient.id,
      amount,
      balanceBefore: recipientBalanceAfter - amount,
      balanceAfter: recipientBalanceAfter,
      reason: "tip_received",
      note: `Tip from @${req.user!.username}`,
    }).catch(() => {});

    logFinancialActivity({
      userId: senderId,
      username: req.user!.username,
      action: "tip_sent",
      ctx: getRequestContext(req),
      amount,
      referenceType: "transaction",
      metadata: { toUsername: recipient.username },
    });
    logFinancialActivity({
      userId: recipient.id,
      username: recipient.username,
      action: "tip_received",
      ctx: getRequestContext(req),
      amount,
      metadata: { fromUsername: req.user!.username },
    });

    res.json({ success: true, newBalance: senderBalanceAfter });
  } catch (err) {
    req.log.error({ err }, "User tip error");
    res.status(500).json({ error: "Internal server error" });
  }
});

usersRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const { totalBalance, cryptoBalances } = await getUserBalance(user.id);
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      balance: totalBalance,
      cryptoBalances,
      avatarUrl: user.avatarUrl,
      totalBets: user.totalBets,
      totalWon: user.totalWon,
      role: user.role,
      isBanned: user.isBanned,
      createdAt: user.createdAt,
      accountType: user.accountType,
      withdrawalsEnabled: user.withdrawalsEnabled,
      referralCode: user.referralCode,
      totalWageredAmount: user.totalWageredAmount,
      lastLoginAt: user.lastLoginAt,
      telegramUsername: user.telegramUsername,
      rakebackClaimed: user.rakebackClaimed,
      signupBonus: user.signupBonus,
      bonusWagered: user.bonusWagered,
    });
  } catch (err) { req.log.error({ err }, "Get me error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.get("/me/limits", requireAuth, async (req, res) => {
  try {
    const state = await getGamblingLimitsState(req.user!.userId);
    if (!state) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, limits: state });
  } catch (err) {
    req.log.error({ err }, "Get limits error");
    res.status(500).json({ error: "Internal server error" });
  }
});

usersRouter.patch("/me/limits", requireAuth, async (req, res) => {
  const body = req.body as Partial<GamblingLimits> & {
    depositLimitDaily?: number | null;
    depositLimitWeekly?: number | null;
    depositLimitMonthly?: number | null;
    lossLimitDaily?: number | null;
    sessionLimitMinutes?: number | null;
  };

  const parse = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n === 0 ? null : n;
  };

  try {
    const input: Partial<GamblingLimits> = {
      depositLimitDaily: parse(body.depositLimitDaily),
      depositLimitWeekly: parse(body.depositLimitWeekly),
      depositLimitMonthly: parse(body.depositLimitMonthly),
      lossLimitDaily: parse(body.lossLimitDaily),
      sessionLimitMinutes: parse(body.sessionLimitMinutes),
    };

    const state = await updateGamblingLimits(req.user!.userId, input);
    if (!state) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, limits: state });
  } catch (err) {
    req.log.error({ err }, "Update limits error");
    res.status(500).json({ error: "Internal server error" });
  }
});
