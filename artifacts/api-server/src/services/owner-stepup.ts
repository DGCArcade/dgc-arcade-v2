import crypto from "crypto";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isOwnerUser, type AuthPayload } from "../middlewares/auth.js";
import { sendOwnerStepUpEmail } from "../lib/mail-service.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const STEPUP_JWT_TTL = "45m";

const otpAttempts = new Map<number, number[]>();

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET required");
  return s;
}

export function signOwnerStepUpToken(user: AuthPayload): string {
  return jwt.sign(
    { userId: user.userId, username: user.username, scope: "owner-stepup" },
    jwtSecret(),
    { expiresIn: STEPUP_JWT_TTL },
  );
}

export function verifyOwnerStepUpToken(token: string, userId: number): boolean {
  try {
    const payload = jwt.verify(token, jwtSecret()) as { userId?: number; scope?: string };
    return payload.scope === "owner-stepup" && payload.userId === userId;
  } catch {
    return false;
  }
}

export async function issueOwnerStepUpOtp(user: AuthPayload): Promise<
  | { ok: true }
  | { ok: false; error: string; code: string; retryAfterSec?: number }
> {
  if (!isOwnerUser(user)) {
    return { ok: false, code: "NOT_OWNER", error: "Owner step-up is only for the platform owner." };
  }

  const staticCode = process.env.OWNER_STATIC_STEPUP_CODE?.trim();
  if (staticCode && process.env.NODE_ENV !== "production") {
    await db
      .update(usersTable)
      .set({
        ownerStepupCode: staticCode,
        ownerStepupExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        ownerStepupSentAt: new Date(),
      })
      .where(eq(usersTable.id, user.userId));
    return { ok: true };
  }

  const [row] = await db
    .select({
      email: usersTable.email,
      emailVerified: usersTable.emailVerified,
      ownerStepupSentAt: usersTable.ownerStepupSentAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .limit(1);

  if (!row?.email) {
    return { ok: false, code: "EMAIL_REQUIRED", error: "Owner account needs an email on file." };
  }

  if (row.ownerStepupSentAt) {
    const elapsed = Date.now() - new Date(row.ownerStepupSentAt).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        code: "OTP_COOLDOWN",
        error: "Wait before requesting another owner code.",
        retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db
    .update(usersTable)
    .set({
      ownerStepupCode: code,
      ownerStepupExpiresAt: expiresAt,
      ownerStepupSentAt: new Date(),
    })
    .where(eq(usersTable.id, user.userId));

  otpAttempts.delete(user.userId);

  await sendOwnerStepUpEmail(row.email, user.username, code);

  return { ok: true };
}

export async function verifyOwnerStepUpOtp(
  user: AuthPayload,
  code: string,
): Promise<{ ok: true; stepUpToken: string } | { ok: false; error: string; code: string }> {
  if (!isOwnerUser(user)) {
    return { ok: false, code: "NOT_OWNER", error: "Not an owner account." };
  }

  const envCode = process.env.OWNER_STATIC_STEPUP_CODE?.trim();
  if (envCode && code.trim() === envCode) {
    return { ok: true, stepUpToken: signOwnerStepUpToken(user) };
  }

  const now = Date.now();
  const attempts = (otpAttempts.get(user.userId) ?? []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 8) {
    return { ok: false, code: "OTP_LOCKED", error: "Too many attempts. Request a new code." };
  }

  const [row] = await db
    .select({
      ownerStepupCode: usersTable.ownerStepupCode,
      ownerStepupExpiresAt: usersTable.ownerStepupExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .limit(1);

  if (!row?.ownerStepupCode) {
    return { ok: false, code: "OTP_REQUIRED", error: "Request an owner verification code first." };
  }
  if (row.ownerStepupExpiresAt && new Date() > row.ownerStepupExpiresAt) {
    return { ok: false, code: "OTP_EXPIRED", error: "Code expired. Request a new one." };
  }
  if (row.ownerStepupCode !== code.trim()) {
    attempts.push(now);
    otpAttempts.set(user.userId, attempts);
    return { ok: false, code: "OTP_INVALID", error: "Invalid owner verification code." };
  }

  await db
    .update(usersTable)
    .set({ ownerStepupCode: null, ownerStepupExpiresAt: null })
    .where(eq(usersTable.id, user.userId));

  otpAttempts.delete(user.userId);
  return { ok: true, stepUpToken: signOwnerStepUpToken(user) };
}
