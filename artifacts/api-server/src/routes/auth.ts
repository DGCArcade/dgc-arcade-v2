import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { requireAuth, signToken } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import crypto from "crypto";

export const authRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    balance: parseFloat(user.balance),
    avatarUrl: user.avatarUrl,
    totalBets: user.totalBets,
    totalWon: parseFloat(user.totalWon),
    role: user.role,
    isBanned: user.isBanned,
    createdAt: user.createdAt.toISOString(),
    accountType: user.accountType,
    withdrawalsEnabled: user.withdrawalsEnabled,
    referralCode: user.referralCode ?? null,
  };
}

// POST /api/auth/register
authRouter.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { username, password } = parsed.data;
  const rawFp = req.headers["x-device-fingerprint"];
  const deviceFingerprint = typeof rawFp === "string" ? rawFp : null;

  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    if (deviceFingerprint) {
      const deviceExists = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.deviceFingerprint, deviceFingerprint))
        .limit(1);
      if (deviceExists.length > 0) {
        logger.warn(
          { deviceFingerprint, username },
          "Duplicate device blocked",
        );
        res
          .status(409)
          .json({ error: "An account already exists on this device." });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let [user] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash,
        balance: "100",
        wagerRequirement: "100",
        deviceFingerprint,
      })
      .returning();

    // Generate a unique referral code for this user (DGC + id in base36 + 3 random bytes)
    const refCode = 'DGC' + user.id.toString(36).toUpperCase().padStart(4, '0') + crypto.randomBytes(3).toString('hex').toUpperCase();
    await db.update(usersTable).set({ referralCode: refCode }).where(eq(usersTable.id, user.id));
    user = { ...user, referralCode: refCode };

    // If the registration came with a referral code, link this new user to the referrer
    const incomingRef = typeof req.body.referralCode === 'string' ? req.body.referralCode.trim() : null;
    if (incomingRef) {
      try {
        const { referralsTable } = await import('@workspace/db');
        const [referrer] = await db.select({ id: usersTable.id }).from(usersTable)
          .where(eq(usersTable.referralCode, incomingRef)).limit(1);
        if (referrer && referrer.id !== user.id) {
          await db.update(usersTable).set({ referredBy: referrer.id }).where(eq(usersTable.id, user.id));
          await db.insert(referralsTable).values({ referrerId: referrer.id, referredId: user.id, status: 'pending' });
          logger.info({ referrerId: referrer.id, referredId: user.id }, 'Referral link created on registration');
        }
      } catch (refErr) {
        logger.warn({ refErr }, 'Referral link creation failed — non-critical, registration continues');
      }
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    res.status(201).json({ user: formatUser(user), token });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { username, password } = parsed.data;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    if (user.isBanned) {
      res
        .status(403)
        .json({ error: "Your account has been suspended. Contact support." });
      return;
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    res.json({ user: formatUser(user), token });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => {
  res.json({ success: true, message: "Logged out" });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({ error: "Account suspended" });
      return;
    }

    res.json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});
