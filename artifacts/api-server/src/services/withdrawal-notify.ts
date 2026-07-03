import { db, usersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  sendWithdrawalEmail,
  sendWithdrawalRequestedEmail,
  sendWithdrawalProcessingEmail,
  sendWithdrawalFailedEmail,
} from "../lib/mail-service.js";

export type WithdrawalNotifyStatus =
  | "requested"
  | "processing"
  | "completed"
  | "failed"
  | "needs_review";

export async function notifyWithdrawalStatus(
  txId: number,
  status: WithdrawalNotifyStatus,
  txHash?: string | null,
): Promise<void> {
  try {
    const [tx] = await db
      .select({
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        address: transactionsTable.address,
        userId: transactionsTable.userId,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);

    if (!tx) return;

    const [user] = await db
      .select({ email: usersTable.email, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, tx.userId))
      .limit(1);

    if (!user?.email) return;

    const amountLabel = `$${parseFloat(tx.amount).toFixed(2)} ${tx.currency ?? ""}`.trim();
    const hash = txHash ?? "Pending";

    switch (status) {
      case "requested":
        await sendWithdrawalRequestedEmail(user.email, user.username, amountLabel, tx.address ?? "");
        break;
      case "processing":
        await sendWithdrawalProcessingEmail(user.email, user.username, amountLabel, hash);
        break;
      case "completed":
        await sendWithdrawalEmail(user.email, user.username, amountLabel, hash);
        break;
      case "failed":
      case "needs_review":
        await sendWithdrawalFailedEmail(user.email, user.username, amountLabel, status);
        break;
    }
  } catch {
    // Email must never block payout flow
  }
}
