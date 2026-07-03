import crypto from "crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, transactionsTable, usersTable } from "@workspace/db";

/** Rolling 24h limits per user (not per IP). */
export const WITHDRAW_MAX_COUNT_24H = 5;
export const WITHDRAW_MAX_USD_24H = 25_000;

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const otpAttempts = new Map<number, number[]>();

export type WithdrawVelocityResult =
  | { ok: true }
  | { ok: false; error: string; code: string };

export async function checkWithdrawVelocity(userId: number, amount: number): Promise<WithdrawVelocityResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      amount: transactionsTable.amount,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.type, "withdrawal"),
        inArray(transactionsTable.status, ["pending", "completed", "processing"]),
        gte(transactionsTable.createdAt, since),
      ),
    );

  const count = rows.length;
  const totalUsd = rows.reduce((sum, r) => sum + parseFloat(String(r.amount ?? 0)), 0);

  if (count >= WITHDRAW_MAX_COUNT_24H) {
    return {
      ok: false,
      code: "WITHDRAW_COUNT_LIMIT",
      error: `Maximum ${WITHDRAW_MAX_COUNT_24H} withdrawals per 24 hours. Try again later.`,
    };
  }

  if (totalUsd + amount > WITHDRAW_MAX_USD_24H) {
    const remaining = Math.max(0, WITHDRAW_MAX_USD_24H - totalUsd);
    return {
      ok: false,
      code: "WITHDRAW_AMOUNT_LIMIT",
      error: `24-hour withdrawal limit is $${WITHDRAW_MAX_USD_24H.toLocaleString()}. You can withdraw up to $${remaining.toFixed(2)} more today.`,
    };
  }

  return { ok: true };
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function issueWithdrawOtp(userId: number): Promise<
  | { ok: true; expiresAt: Date }
  | { ok: false; error: string; code: string; retryAfterSec?: number }
> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      emailVerified: usersTable.emailVerified,
      withdrawOtpSentAt: usersTable.withdrawOtpSentAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND", error: "User not found" };
  }

  if (!user.email || !user.emailVerified) {
    return {
      ok: false,
      code: "EMAIL_REQUIRED",
      error: "Verify your email in Settings before withdrawing.",
    };
  }

  if (user.withdrawOtpSentAt) {
    const elapsed = Date.now() - new Date(user.withdrawOtpSentAt).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        code: "OTP_COOLDOWN",
        error: "Wait before requesting another code.",
        retryAfterSec: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db
    .update(usersTable)
    .set({
      withdrawOtpCode: code,
      withdrawOtpExpiresAt: expiresAt,
      withdrawOtpSentAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  otpAttempts.delete(userId);

  return { ok: true, expiresAt };
}

export async function verifyWithdrawOtp(userId: number, code: string): Promise<
  | { ok: true }
  | { ok: false; error: string; code: string }
> {
  const now = Date.now();
  const attempts = (otpAttempts.get(userId) ?? []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      code: "OTP_LOCKED",
      error: "Too many incorrect codes. Request a new withdrawal code.",
    };
  }

  const [user] = await db
    .select({
      withdrawOtpCode: usersTable.withdrawOtpCode,
      withdrawOtpExpiresAt: usersTable.withdrawOtpExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user?.withdrawOtpCode) {
    return { ok: false, code: "OTP_REQUIRED", error: "Request a withdrawal verification code first." };
  }

  if (user.withdrawOtpExpiresAt && new Date() > user.withdrawOtpExpiresAt) {
    return { ok: false, code: "OTP_EXPIRED", error: "Verification code expired. Request a new one." };
  }

  if (user.withdrawOtpCode !== code.trim()) {
    attempts.push(now);
    otpAttempts.set(userId, attempts);
    return { ok: false, code: "OTP_INVALID", error: "Invalid verification code." };
  }

  await db
    .update(usersTable)
    .set({
      withdrawOtpCode: null,
      withdrawOtpExpiresAt: null,
      withdrawalAttempts: sql`${usersTable.withdrawalAttempts} + 1`,
    })
    .where(eq(usersTable.id, userId));

  otpAttempts.delete(userId);
  return { ok: true };
}
