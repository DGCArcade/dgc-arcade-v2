import { db, activityLogsTable, visitorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RequestContext } from "../lib/request-context.js";

export type ActivityActorType = "player" | "visitor" | "admin" | "system";

export interface ActivityLogEntry {
  userId?: number | null;
  username?: string | null;
  visitorId?: number | null;
  actorType?: ActivityActorType;
  action: string;
  ctx?: RequestContext;
  amount?: number | null;
  currency?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** Fire-and-forget immutable activity log — never blocks the primary operation. */
export function logActivity(entry: ActivityLogEntry): void {
  const row = {
    userId: entry.userId ?? null,
    username: entry.username ?? null,
    visitorId: entry.visitorId ?? null,
    actorType: entry.actorType ?? (entry.userId ? "player" : "visitor"),
    action: entry.action,
    ip: entry.ctx?.ip ?? null,
    userAgent: entry.ctx?.userAgent ?? null,
    fingerprint: entry.ctx?.fingerprint ?? null,
    amount: entry.amount != null ? String(entry.amount) : null,
    currency: entry.currency ?? null,
    referenceType: entry.referenceType ?? null,
    referenceId: entry.referenceId ?? null,
    metadata: entry.metadata ?? null,
  };
  db.insert(activityLogsTable).values(row).catch(() => {});
}

/** Tie a browser fingerprint/IP visitor row to a logged-in player. */
export async function linkVisitorToUser(
  ctx: RequestContext,
  userId: number,
  username: string,
): Promise<number | null> {
  try {
    const [existing] = await db
      .select({ id: visitorsTable.id })
      .from(visitorsTable)
      .where(ctx.fingerprint ? eq(visitorsTable.fingerprint, ctx.fingerprint) : eq(visitorsTable.ip, ctx.ip))
      .limit(1);

    if (existing) {
      await db
        .update(visitorsTable)
        .set({ userId, username, updatedAt: new Date() })
        .where(eq(visitorsTable.id, existing.id));
      return existing.id;
    }
    const [created] = await db
      .insert(visitorsTable)
      .values({
        fingerprint: ctx.fingerprint ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        userId,
        username,
        lastPage: "/login",
        visitCount: 1,
      })
      .returning({ id: visitorsTable.id });
    return created?.id ?? null;
  } catch {
    return null;
  }
}

export function logBetActivity(params: {
  userId: number;
  username: string;
  ctx?: RequestContext;
  betId: number;
  gameSlug: string;
  amount: number;
  payout: number;
  won: boolean;
  multiplier?: number;
  currency?: string;
}): void {
  logActivity({
    userId: params.userId,
    username: params.username,
    actorType: "player",
    action: "bet",
    ctx: params.ctx,
    amount: params.amount,
    currency: params.currency ?? "USD",
    referenceType: "bet",
    referenceId: params.betId,
    metadata: {
      gameSlug: params.gameSlug,
      payout: params.payout,
      won: params.won,
      multiplier: params.multiplier,
    },
  });
}

export function logFinancialActivity(params: {
  userId: number;
  username: string;
  action: "deposit_initiated" | "deposit_completed" | "withdrawal_requested" | "withdrawal_completed" | "tip_sent" | "tip_received";
  ctx?: RequestContext;
  amount: number;
  currency?: string;
  referenceType?: string;
  referenceId?: number;
  metadata?: Record<string, unknown>;
}): void {
  logActivity({
    userId: params.userId,
    username: params.username,
    actorType: "player",
    action: params.action,
    ctx: params.ctx,
    amount: params.amount,
    currency: params.currency ?? "USD",
    referenceType: params.referenceType ?? "transaction",
    referenceId: params.referenceId,
    metadata: params.metadata,
  });
}
