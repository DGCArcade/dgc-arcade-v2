import {
  db,
  usersTable,
  transactionsTable,
  deviceHistoryTable,
  fraudReviewsTable,
} from "@workspace/db";
import { eq, and, gte, ne, sql } from "drizzle-orm";

export type FraudDecision = "approved" | "review" | "blocked";

export interface FraudResult {
  score: number;
  flags: string[];
  decision: FraudDecision;
  metadata: Record<string, unknown>;
}

interface EvalContext {
  userId: number;
  amount: number;
  withdrawalId?: number;
}

export async function evaluateWithdrawal(ctx: EvalContext): Promise<FraudResult> {
  const { userId, amount, withdrawalId } = ctx;
  const flags: string[] = [];
  let score = 0;
  const metadata: Record<string, unknown> = {};

  try {
    // Fetch user
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) return { score: 100, flags: ["user_not_found"], decision: "blocked", metadata: {} };

    const totalDeposited = parseFloat(user.totalDeposited ?? "0");
    const totalWagered = parseFloat(user.totalWageredAmount ?? "0");
    const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
    const accountAgeHours = accountAgeMs / (1000 * 60 * 60);

    metadata.accountAgeHours = Math.round(accountAgeHours * 10) / 10;
    metadata.totalDeposited = totalDeposited;
    metadata.totalWagered = totalWagered;
    metadata.vpnDetected = user.vpnDetected;
    metadata.fingerprint = user.deviceFingerprint;

    // ── Signal: VPN detected ── +15
    if (user.vpnDetected) {
      flags.push("vpn_detected");
      score += 15;
    }

    // ── Signal: Account age < 24h ── +20
    if (accountAgeHours < 24) {
      flags.push("account_age_under_24h");
      score += 20;
    }

    // ── Signal: Deposit < 1h before withdrawal ── +25
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recentDeposit] = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "completed"),
          gte(transactionsTable.createdAt, oneHourAgo),
        )
      )
      .limit(1);
    if (recentDeposit) {
      flags.push("deposit_within_1h");
      score += 25;
      metadata.recentDepositId = recentDeposit.id;
    }

    // ── Signal: Wagered < 30% of deposits ── +30
    if (totalDeposited > 0) {
      const wagerRatio = totalWagered / totalDeposited;
      metadata.wagerRatio = Math.round(wagerRatio * 100) / 100;
      if (wagerRatio < 0.30) {
        flags.push("low_wager_ratio");
        score += 30;
      }
    }

    // ── Signal: Withdrawal > 3× historical average ── +20
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [avgRow] = await db
      .select({ avg: sql<string>`COALESCE(AVG(${transactionsTable.amount}::numeric), 0)` })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          eq(transactionsTable.type, "withdrawal"),
          ne(transactionsTable.status, "declined"),
          gte(transactionsTable.createdAt, thirtyDaysAgo),
        )
      );
    const historicalAvg = parseFloat(avgRow?.avg ?? "0");
    metadata.historicalAvgWithdrawal = historicalAvg;
    if (historicalAvg > 0 && amount > historicalAvg * 3) {
      flags.push("withdrawal_3x_historical_avg");
      score += 20;
    }

    // ── Signal: Device fingerprint shared with another account ── +40
    if (user.deviceFingerprint) {
      const [sharedDevice] = await db
        .select({ userId: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.deviceFingerprint, user.deviceFingerprint),
            ne(usersTable.id, userId),
          )
        )
        .limit(1);
      if (sharedDevice) {
        flags.push("fingerprint_shared_with_another_account");
        score += 40;
        metadata.sharedFingerprintUserId = sharedDevice.userId;
      }
    }

    // ── Signal: New device (device not seen before this session) ── +10
    const [knownDevice] = await db
      .select({ id: deviceHistoryTable.id })
      .from(deviceHistoryTable)
      .where(
        and(
          eq(deviceHistoryTable.userId, userId),
          user.deviceFingerprint
            ? eq(deviceHistoryTable.fingerprint, user.deviceFingerprint)
            : sql`false`,
        )
      )
      .limit(1);
    if (!knownDevice) {
      flags.push("new_device");
      score += 10;
    }

    // ── Legacy checks (kept for backward compat) ──
    const withdrawRatio = amount / (totalDeposited || 1);
    metadata.withdrawRatio = Math.round(withdrawRatio * 100) / 100;
    if (withdrawRatio > 0.95 && accountAgeHours < 2) {
      flags.push("immediate_high_value_withdrawal_new_account");
      score = Math.min(score + 5, 100);
    }

    // Cap at 100
    score = Math.min(score, 100);

    // ── Decision ──
    let decision: FraudDecision;
    if (score >= 90) {
      decision = "blocked";
    } else if (score >= 60) {
      decision = "review";
    } else {
      decision = "approved";
    }

    metadata.score = score;
    metadata.flags = flags;

    // Persist to fraud_reviews
    try {
      const [inserted] = await db.insert(fraudReviewsTable).values({
        userId,
        withdrawalId: withdrawalId ?? null,
        amount: String(amount),
        score,
        flags: JSON.stringify(flags),
        decision,
        metadata: JSON.stringify(metadata),
      }).returning({ id: fraudReviewsTable.id });
      metadata.fraudReviewId = inserted?.id;
    } catch {
      // Never let persistence failure block a withdrawal evaluation
    }

    return { score, flags, decision, metadata };
  } catch (err) {
    // If fraud eval throws, fail safe: return review (not block, not approve)
    return {
      score: 50,
      flags: ["evaluation_error"],
      decision: "review",
      metadata: { error: String(err) },
    };
  }
}
