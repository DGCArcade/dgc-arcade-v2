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

const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";

async function formatUser(user: typeof usersTable.$inferSelect) {
  const { totalBalance, cryptoBalances } = await getUserBalance(user.id, user.balance);

  // Normalize owner status: if the user's username or role matches owner criteria,
  // ensure role is set to "owner" in the response for consistent frontend checks.
  const normalizedRole =
    user.role === "owner" || (user.username ?? "").toLowerCase() === OWNER_USERNAME.toLowerCase()
      ? "owner"
      : user.role;

  return {
    id: user.id,
    username: user.username,
    balance: totalBalance,
    cryptoBalances,
    avatarUrl: user.avatarUrl,
    totalBets: user.totalBets,
    totalWon: parseFloat(user.totalWon),
    role: normalizedRole,
    isBanned: user.isBanned,
    createdAt: user.createdAt.toISOString(),
    accountType: user.accountType,
    withdrawalsEnabled: user.withdrawalsEnabled,
    referralCode: user.referralCode ?? null,
    totalWageredAmount: parseFloat(user.totalWageredAmount ?? "0"),
    wagerRequirement: parseFloat(user.wagerRequirement ?? "0"),
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

  try {
    // Check if username is reserved (owner username)
    if (username.toLowerCase() === OWNER_USERNAME.toLowerCase()) {
      res.status(400).json({ error: "That username is reserved" });
      return;
    }

    const [existing] = await db.select().from(usersTable)
      .where(or(ilike(usersTable.username, username), ilike(usersTable.email, email ?? "")))
      .limit(1);
    if (existing) { res.status(409).json({ error: "Username or email already exists" }); return; }

    const passwordHash = await bcrypt.hash(password, 12);
    const referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    const user = {
      username,
      email: email || null,
      passwordHash,
      referralCode,
      balance: "0",
      totalBets: 0,
      totalWon: "0",
      avatarUrl: null,
      accountType: "player" as const,
      withdrawalsEnabled: true,
      isBanned: false,
      role: "player" as const,
      totalWageredAmount: "0",
      wagerRequirement: "0",
      rakebackClaimed: "0",
      signupBonus: "100",
      bonusWagered: "0",
      emailVerified: !email,
    };

    const [newUser] = await db.insert(usersTable).values(user).returning();
    const token = signToken({ userId: newUser.id, username: newUser.username, role: newUser.role });

    if (user.email) {
      try {
        const { sendEmailVerificationEmail } = await import("../lib/mail-service");
        const verificationCode = String(crypto.randomInt(100000, 1000000));
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.update(usersTable).set({ 
          emailVerificationCode: verificationCode, 
          emailVerificationExpiresAt: expiresAt 
        }).where(eq(usersTable.id, newUser.id));
        void sendEmailVerificationEmail(newUser.email ?? "", newUser.username, verificationCode);
      } catch (mailErr) { logger.warn({ mailErr }, 'Verification email sending failed on registration'); }
    }

    res.status(201).json({ user: await formatUser(newUser), token });
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

    // Update lastLoginAt + session clock (fire-and-forget)
    db.update(usersTable).set({ lastLoginAt: new Date(), sessionStartedAt: new Date() }).where(eq(usersTable.id, user.id))
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

// POST /api/auth/owner/stepup/send — email code for owner profile tools only
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
      message: "Owner code sent to your email.",
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
