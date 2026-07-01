import { db, usersTable, transactionsTable, betsTable } from "@workspace/db";
import { eq, and, gte, inArray, sql } from "drizzle-orm";

export type LimitPeriod = "daily" | "weekly" | "monthly";

export interface GamblingLimits {
  depositLimitDaily: number | null;
  depositLimitWeekly: number | null;
  depositLimitMonthly: number | null;
  lossLimitDaily: number | null;
  sessionLimitMinutes: number | null;
}

export interface GamblingLimitUsage {
  depositDaily: number;
  depositWeekly: number;
  depositMonthly: number;
  lossToday: number;
  sessionMinutes: number;
  sessionLimitReached: boolean;
}

export interface GamblingLimitsState extends GamblingLimits, GamblingLimitUsage {
  sessionStartedAt: string | null;
}

function periodStart(period: LimitPeriod): Date {
  const now = new Date();
  if (period === "daily") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  if (period === "weekly") {
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - diff);
    return start;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLimits(user: typeof usersTable.$inferSelect): GamblingLimits {
  return {
    depositLimitDaily: num(user.depositLimitDaily),
    depositLimitWeekly: num(user.depositLimitWeekly),
    depositLimitMonthly: num(user.depositLimitMonthly),
    lossLimitDaily: num(user.lossLimitDaily),
    sessionLimitMinutes: user.sessionLimitMinutes != null && user.sessionLimitMinutes > 0
      ? user.sessionLimitMinutes
      : null,
  };
}

async function sumDepositsSince(userId: number, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${transactionsTable.amount}::numeric), 0)`,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.type, "deposit"),
        inArray(transactionsTable.status, ["pending", "processing", "completed"]),
        gte(transactionsTable.createdAt, since),
      ),
    );
  return parseFloat(row?.total ?? "0");
}

async function sumLossToday(userId: number): Promise<number> {
  const since = periodStart("daily");
  const [row] = await db
    .select({
      wagered: sql<string>`coalesce(sum(${betsTable.amount}::numeric), 0)`,
      returned: sql<string>`coalesce(sum(${betsTable.payout}::numeric), 0)`,
    })
    .from(betsTable)
    .where(and(eq(betsTable.userId, userId), gte(betsTable.createdAt, since)));
  const loss = parseFloat(row?.wagered ?? "0") - parseFloat(row?.returned ?? "0");
  return Math.max(0, loss);
}

function sessionMinutesFrom(user: typeof usersTable.$inferSelect): number {
  if (!user.sessionStartedAt) return 0;
  return Math.floor((Date.now() - new Date(user.sessionStartedAt).getTime()) / 60_000);
}

export async function getGamblingLimitsState(userId: number): Promise<GamblingLimitsState | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;

  const limits = parseLimits(user);
  const [depositDaily, depositWeekly, depositMonthly, lossToday] = await Promise.all([
    sumDepositsSince(userId, periodStart("daily")),
    sumDepositsSince(userId, periodStart("weekly")),
    sumDepositsSince(userId, periodStart("monthly")),
    sumLossToday(userId),
  ]);

  const sessionMinutes = sessionMinutesFrom(user);
  const sessionLimitReached =
    limits.sessionLimitMinutes != null && sessionMinutes >= limits.sessionLimitMinutes;

  return {
    ...limits,
    depositDaily,
    depositWeekly,
    depositMonthly,
    lossToday,
    sessionMinutes,
    sessionLimitReached,
    sessionStartedAt: user.sessionStartedAt?.toISOString() ?? null,
  };
}

export type LimitCheckResult =
  | { ok: true }
  | { ok: false; code: string; error: string };

export async function checkDepositLimit(userId: number, amount: number): Promise<LimitCheckResult> {
  const state = await getGamblingLimitsState(userId);
  if (!state) return { ok: false, code: "USER_NOT_FOUND", error: "User not found" };

  const checks: Array<{ limit: number | null; used: number; period: string }> = [
    { limit: state.depositLimitDaily, used: state.depositDaily, period: "daily" },
    { limit: state.depositLimitWeekly, used: state.depositWeekly, period: "weekly" },
    { limit: state.depositLimitMonthly, used: state.depositMonthly, period: "monthly" },
  ];

  for (const { limit, used, period } of checks) {
    if (limit != null && used + amount > limit) {
      const remaining = Math.max(0, limit - used);
      return {
        ok: false,
        code: "DEPOSIT_LIMIT",
        error: `This deposit would exceed your ${period} limit of $${limit.toFixed(2)}. Remaining: $${remaining.toFixed(2)}.`,
      };
    }
  }
  return { ok: true };
}

export async function checkWagerLimits(userId: number, betAmount: number): Promise<LimitCheckResult> {
  const state = await getGamblingLimitsState(userId);
  if (!state) return { ok: false, code: "USER_NOT_FOUND", error: "User not found" };

  if (state.sessionLimitReached) {
    return {
      ok: false,
      code: "SESSION_LIMIT",
      error: `Your session time limit of ${state.sessionLimitMinutes} minutes has been reached. Take a break and log in again later.`,
    };
  }

  if (state.lossLimitDaily != null) {
    const projectedLoss = state.lossToday + betAmount;
    if (projectedLoss > state.lossLimitDaily) {
      const remaining = Math.max(0, state.lossLimitDaily - state.lossToday);
      return {
        ok: false,
        code: "LOSS_LIMIT",
        error: `This bet would exceed your daily loss limit of $${state.lossLimitDaily.toFixed(2)}. Remaining loss allowance: $${remaining.toFixed(2)}.`,
      };
    }
  }

  return { ok: true };
}

export async function updateGamblingLimits(
  userId: number,
  input: Partial<GamblingLimits>,
): Promise<GamblingLimitsState | null> {
  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (input.depositLimitDaily !== undefined) {
    updates.depositLimitDaily =
      input.depositLimitDaily != null && input.depositLimitDaily > 0
        ? input.depositLimitDaily.toFixed(2)
        : null;
  }
  if (input.depositLimitWeekly !== undefined) {
    updates.depositLimitWeekly =
      input.depositLimitWeekly != null && input.depositLimitWeekly > 0
        ? input.depositLimitWeekly.toFixed(2)
        : null;
  }
  if (input.depositLimitMonthly !== undefined) {
    updates.depositLimitMonthly =
      input.depositLimitMonthly != null && input.depositLimitMonthly > 0
        ? input.depositLimitMonthly.toFixed(2)
        : null;
  }
  if (input.lossLimitDaily !== undefined) {
    updates.lossLimitDaily =
      input.lossLimitDaily != null && input.lossLimitDaily > 0
        ? input.lossLimitDaily.toFixed(2)
        : null;
  }
  if (input.sessionLimitMinutes !== undefined) {
    updates.sessionLimitMinutes =
      input.sessionLimitMinutes != null && input.sessionLimitMinutes > 0
        ? Math.round(input.sessionLimitMinutes)
        : null;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));
  }

  return getGamblingLimitsState(userId);
}

export async function touchSessionStart(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ sessionStartedAt: new Date() })
    .where(eq(usersTable.id, userId));
}
