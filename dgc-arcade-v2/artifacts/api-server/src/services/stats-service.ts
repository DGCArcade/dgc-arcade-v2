import { db } from "@workspace/db";
import { betsTable, transactionsTable } from "@workspace/db/schema";
import { eq, sum, sql, and, gte, lte, count } from "drizzle-orm";

interface MinLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

export async function getDailyWinLoss(date: Date, log: MinLogger) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  log.info({ startOfDay, endOfDay }, "Calculating daily win/loss");

  const bets = await db
    .select({
      totalWagered: sum(betsTable.amount).mapWith(Number),
      totalPayout: sum(betsTable.payout).mapWith(Number),
    })
    .from(betsTable)
    .where(and(
      gte(betsTable.createdAt, startOfDay),
      lte(betsTable.createdAt, endOfDay),
    ));

  const totalWagered = bets[0]?.totalWagered || 0;
  const totalPayout = bets[0]?.totalPayout || 0;

  const winLoss = totalPayout - totalWagered;

  return { winLoss, totalWagered, totalPayout };
}

export async function getDailyWithdrawals(date: Date, log: MinLogger) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  log.info({ startOfDay, endOfDay }, "Calculating daily withdrawals");

  const withdrawals = await db
    .select({
      totalWithdrawals: sum(transactionsTable.amount).mapWith(Number),
    })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "withdrawal"),
      eq(transactionsTable.status, "completed"),
      gte(transactionsTable.createdAt, startOfDay),
      lte(transactionsTable.createdAt, endOfDay),
    ));

  const totalWithdrawals = withdrawals[0]?.totalWithdrawals || 0;

  return { totalWithdrawals };
}

export async function getDailyDeposits(date: Date, log: MinLogger) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  log.info({ startOfDay, endOfDay }, "Calculating daily deposits");

  const deposits = await db
    .select({ totalDeposits: sum(transactionsTable.amount).mapWith(Number) })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "deposit"),
      eq(transactionsTable.status, "completed"),
      gte(transactionsTable.createdAt, startOfDay),
      lte(transactionsTable.createdAt, endOfDay),
    ));

  const totalDeposits = deposits[0]?.totalDeposits || 0;
  return { totalDeposits };
}
