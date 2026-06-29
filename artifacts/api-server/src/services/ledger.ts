import { db, walletLedgerTable } from "@workspace/db";

export type LedgerReason =
  | "deposit"
  | "withdrawal"
  | "withdrawal_refund"
  | "bet_loss"
  | "bet_win"
  | "referral_commission"
  | "admin_adjustment"
  | "admin_deposit_manual"
  | "daily_bonus"
  | "tournament_prize"
  | "promo_credit"
  | "tip_sent"
  | "tip_received";

export interface LedgerEntry {
  userId: number;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: LedgerReason;
  referenceId?: number;
  referenceType?: string;
  note?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordLedger(txn: any, entry: LedgerEntry): Promise<void> {
  await txn.insert(walletLedgerTable).values({
    userId: entry.userId,
    amount: String(entry.amount),
    balanceBefore: String(entry.balanceBefore),
    balanceAfter: String(entry.balanceAfter),
    reason: entry.reason,
    referenceId: entry.referenceId ?? null,
    referenceType: entry.referenceType ?? null,
    note: entry.note ?? null,
  });
}

export async function recordLedgerStandalone(entry: LedgerEntry): Promise<void> {
  await db.insert(walletLedgerTable).values({
    userId: entry.userId,
    amount: String(entry.amount),
    balanceBefore: String(entry.balanceBefore),
    balanceAfter: String(entry.balanceAfter),
    reason: entry.reason,
    referenceId: entry.referenceId ?? null,
    referenceType: entry.referenceType ?? null,
    note: entry.note ?? null,
  });
}
