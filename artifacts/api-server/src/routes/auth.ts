import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, deviceHistoryTable, userBalancesTable } from "@workspace/db";
import { eq, ilike, and, or } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth, signToken, requireOwner } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { getUserBalance } from "../lib/balance-service.js";
import { getPlatformSettings } from "../lib/platform-settings.js";
import crypto from "crypto";
import { logActivity, linkVisitorToUser } from "../services/activity-log.js";
import { getRequestContext } from "../lib/request-context.js";
import { issueOwnerStepUpOtp, verifyOwnerStepUpOtp, verifyOwnerStepUpToken } from "../services/owner-stepup.js";

export const authRouter = Router();

async function formatUser(user: typeof usersTable.$inferSelect) {
  const { totalBalance, cryptoBalances } = await getUserBalance(user.id, user.balance);

  return {
    id: user.id,
    username: user.username,
    balance: totalBalance,
    cryptoBalances,
    avatarUrl: user.avatarUrl,
    totalBets: user.totalBets,
    totalWon: parseFloat(user.totalWon),
    role: user.role,
    isBanned: user.isBanned,
    createdAt: user.createdAt.toISOString(),
    accountType: user.accountType,
    withdrawalsEnabled: user.withdrawalsEnabled,
    referralCode: user.referralCode ?? null,
    totalWageredAmount: parseFloat(user.totalWageredAmount ?? "0"),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    telegramUsername: user.telegramUsername ?? null,
    rakebackClaimed: parseFloat(user.rakebackClaimed ?? "0"),
    signupBonus: parseFloat(user.signupBonus ?? "100"),
    bonusWagered: parseFloat(user.bonusWagered ?? "0"),
    email: user.email ?? null,
    emailVerified: user.emailVerified,
  };
}

function parseUserAgent(ua: string): { deviceType: string; deviceBrowser: string; deviceOs: string } {
  const isPhone = /iPhone|Android.*Mobile|IEMobile/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  const deviceType = isPhone ? "mobile" : isTablet ? "tablet" : "desktop";
  const browser =
    /Edg\/(\d+)/i.test(ua) ? "Edge" :
    /OPR\/(\d+)/i.test(ua) ? "Opera" :
    /Chrome\/(\d+)/i.test(ua) && !/Chromium/i.test(ua) ? "Chrome" :
    /Firefox\/(\d+)/i.test(ua) ? "Firefox" :
    /Safari\/(\d+)/i.test(ua) && !/Chrome/i.test(ua) ? "Safari" : "Unknown";
  const os =
    /Windows NT/i.test(ua) ? "Windows" :
    /Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "macOS" :
    /Android/i.test(ua) ? "Android" :
    /iPhone|iPad/i.test(ua) ? "iOS" :
    /Linux/i.test(ua) ? "Linux" : "Unknown";
  return { deviceType, deviceBrowser: browser, deviceOs: os };
}

// POST /api/auth/register
authRouter.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { username, password, email } = req.body as any; // Allow email from body

  // Enforce alphanumeric-only usernames (no spaces, @, dots, slashes, etc.)
  if (!username || !/^[a-zA-Z0-9]+$/.test(username)) {
    res.status(400).json({ error: "Username can only contain letters and numbers" });
    return;
  }
  const rawFp = req.headers["x-device-fingerprint"];
  const deviceFingerprint = typeof rawFp === "string" ? rawFp : null;

  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.username, username)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "Username already taken" }); return; }

    if (!email || !email.includes("@")) { res.status(400).json({ error: "Valid email is required" }); return; }
    const existingEmail = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.email, email)).limit(1);
    if (existingEmail.length > 0) { res.status(409).json({ error: "Email already registered" }); return; }
    if (deviceFingerprint) {
      const deviceExists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.deviceFingerprint, deviceFingerprint)).limit(1);
      if (deviceExists.length > 0) { logger.warn({ deviceFingerprint, username }, "Duplicate device blocked"); res.status(409).json({ error: "An account already exists on this device." }); return; }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { signupBonus } = await getPlatformSettings();
    const startingBalance = signupBonus > 0 ? String(signupBonus) : "0";
    let [user] = await db.insert(usersTable).values({ 
      username, 
      email: email || null,
      passwordHash, 
      balance: startingBalance, 
      deviceFingerprint, 
      signupBonus: startingBalance 
    }).returning();

    const refCode = 'DGC' + user.id.toString(36).toUpperCase().padStart(4, '0') + crypto.randomBytes(3).toString('hex').toUpperCase();
    await db.update(usersTable).set({ referralCode: refCode }).where(eq(usersTable.id, user.id));
    user = { ...user, referralCode: refCode };

    const incomingRef = typeof req.body.referralCode === 'string' ? req.body.referralCode.trim() : null;
    if (incomingRef) {
      try {
        const { referralsTable } = await import('@workspace/db');
        const [referrer] = await db.select({ 
          id: usersTable.id, 
          geoIp: usersTable.geoIp, 
          deviceFingerprint: usersTable.deviceFingerprint 
        }).from(usersTable).where(eq(usersTable.referralCode, incomingRef)).limit(1);
        
        if (referrer && referrer.id !== user.id) {
          // ANTI-FRAUD: Block same IP or same device referral
          const clientIp = (req.ip ?? "").replace(/^::ffff:/, "").trim();
          const isSameIp = referrer.geoIp === clientIp;
          const isSameDevice = deviceFingerprint && referrer.deviceFingerprint === deviceFingerprint;
          
          if (isSameIp || isSameDevice) {
            logger.warn({ 
              referrerId: referrer.id, 
              referredId: user.id, 
              isSameIp, 
              isSameDevice 
            }, 'Self-referral blocked via IP/Fingerprint');
          } else {
            await db.update(usersTable).set({ referredBy: referrer.id }).where(eq(usersTable.id, user.id));
            await db.insert(referralsTable).values({ referrerId: referrer.id, referredId: user.id, status: 'pending' });
            logger.info({ referrerId: referrer.id, referredId: user.id }, 'Referral link created on registration');
          }
        }
      } catch (refErr) { logger.warn({ refErr }, 'Referral link creation failed'); }
    }

    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    const ctx = getRequestContext(req);
    linkVisitorToUser(ctx, user.id, user.username).catch(() => {});
    logActivity({
      userId: user.id,
      username: user.username,
      action: "register",
      ctx,
      metadata: { accountType: user.accountType },
    });

    // Send verification email via Resend
    if (user.email) {
      try {
        const { sendEmailVerificationEmail } = await import("../lib/mail-service");
        const verificationCode = String(crypto.randomInt(100000, 1000000));
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.update(usersTable).set({ 
          emailVerificationCode: verificationCode, 
          emailVerificationExpiresAt: expiresAt 
        }).where(eq(usersTable.id, user.id));
        void sendEmailVerificationEmail(user.email, user.username, verificationCode);
      } catch (mailErr) { logger.warn({ mailErr }, 'Verification email sending failed on registration'); }
    }

    res.status(201).json({ user: await formatUser(user), token });
  } catch (err) { req.log.error({ err }, "Register error"); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { username, password } = parsed.data; // 'username' here can be email or username

  try {
    // Allow login via username OR email
    const [user] = await db.select().from(usersTable)
      .where(or(ilike(usersTable.username, username), ilike(usersTable.email, username)))
      .limit(1);
    if (!user) { res.status(401).json({ error: "Invalid username, email, or password" }); return; }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Invalid username or password" }); return; }
    if (user.isBanned) { res.status(403).json({ error: "Your account has been suspended. Contact support." }); return; }

    // ── Return the PREVIOUS lastLoginAt BEFORE overwriting it ──
    // formatUser(user) captures user.lastLoginAt as it was in the DB (the previous session's login).
    // We update it AFTER building the response, so the client sees "last time you logged in", not "right now".
    const responseUser = await formatUser(user);

    // Update lastLoginAt to NOW (fire-and-forget)
    db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id))
      .catch((e) => logger.warn({ e }, "lastLoginAt update failed"));

    // Record device history (fire-and-forget — never block the login response)
    try {
      const ua = req.headers["user-agent"] ?? "";
      const clientIp = (req.ip ?? "").replace(/^::ffff:/, "").trim() || null;
      const { deviceType, deviceBrowser, deviceOs } = parseUserAgent(ua);
      const fingerprint = typeof req.headers["x-device-fingerprint"] === "string"
        ? req.headers["x-device-fingerprint"] : null;

      // Check if this fingerprint already has a record for this user
      if (fingerprint) {
        const [existing] = await db.select({ id: deviceHistoryTable.id, loginCount: deviceHistoryTable.loginCount })
          .from(deviceHistoryTable)
          .where(and(eq(deviceHistoryTable.userId, user.id), eq(deviceHistoryTable.fingerprint, fingerprint)))
          .limit(1);

        if (existing) {
          db.update(deviceHistoryTable)
            .set({ lastSeen: new Date(), loginCount: (existing.loginCount ?? 1) + 1, ip: clientIp })
            .where(eq(deviceHistoryTable.id, existing.id))
            .catch(() => {});
        } else {
          db.insert(deviceHistoryTable).values({
            userId: user.id,
            fingerprint,
            deviceType,
            deviceBrowser,
            deviceOs,
            deviceName: `${deviceOs} / ${deviceBrowser}`,
            ip: clientIp,
            loginCount: 1,
          }).catch(() => {});
        }
      } else {
        // No fingerprint — always insert (IP + UA record)
        db.insert(deviceHistoryTable).values({
          userId: user.id,
          deviceType,
          deviceBrowser,
          deviceOs,
          deviceName: `${deviceOs} / ${deviceBrowser}`,
          ip: clientIp,
          loginCount: 1,
        }).catch(() => {});
      }
    } catch {}

    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    const ctx = getRequestContext(req);
    linkVisitorToUser(ctx, user.id, user.username).catch(() => {});
    logActivity({
      userId: user.id,
      username: user.username,
      action: "login",
      ctx,
      metadata: { role: user.role },
    });
    res.json({ user: responseUser, token });
  } catch (err) { req.log.error({ err }, "Login error"); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/auth/owner/stepup/send — email + optional SMS code for owner profile tools only
authRouter.post("/owner/stepup/send", requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await issueOwnerStepUpOtp(req.user!);
    if (!result.ok) {
      res.status(result.code === "OTP_COOLDOWN" ? 429 : 400).json({
        error: result.error,
        code: result.code,
        retryAfterSec: result.retryAfterSec,
      });
      return;
    }
    res.json({
      success: true,
      message: result.smsSent
        ? "Owner code sent to your email and phone."
        : "Owner code sent to your email.",
      smsSent: result.smsSent,
    });
  } catch (err) {
    req.log.error({ err }, "Owner step-up send error");
    res.status(500).json({ error: "Failed to send owner code" });
  }
});

// POST /api/auth/owner/stepup/verify
authRouter.post("/owner/stepup/verify", requireAuth, requireOwner, async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!code) {
    res.status(400).json({ error: "Verification code required" });
    return;
  }
  try {
    const result = await verifyOwnerStepUpOtp(req.user!, code);
    if (!result.ok) {
      res.status(result.code === "OTP_LOCKED" ? 429 : 400).json({ error: result.error, code: result.code });
      return;
    }
    res.json({
      success: true,
      stepUpToken: result.stepUpToken,
      expiresInMinutes: 45,
    });
  } catch (err) {
    req.log.error({ err }, "Owner step-up verify error");
    res.status(500).json({ error: "Verification failed" });
  }
});

// GET /api/auth/owner/stepup/status — whether current step-up header would pass
authRouter.get("/owner/stepup/status", requireAuth, requireOwner, (req, res) => {
  if (process.env.OWNER_STEPUP_DISABLED === "true") {
    res.json({ verified: true, disabled: true });
    return;
  }
  const token = req.headers["x-owner-step-up"]?.toString();
  res.json({
    verified: !!(token && verifyOwnerStepUpToken(token, req.user!.userId)),
  });
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => { res.json({ success: true, message: "Logged out" }); });

// GET /api/auth/me
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    if (user.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
    res.json(await formatUser(user));
  } catch (err) { req.log.error({ err }, "Get me error"); res.status(500).json({ error: "Internal server error" }); }
});
