import { db, transactionsTable, usersTable, referralsTable } from "@workspace/db";
import { eq, and, lt, ne, sql, count } from "drizzle-orm";
import { logger } from "./logger.js";
import { recordLedger } from "../services/ledger.js";

/**
 * Auto-cleanup: Mark pending deposits as expired if they haven't been completed within 120 minutes.
 * Runs every 30 minutes.
 */
export async function cleanupExpiredDeposits() {
  try {
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
    
    const expiredDeposits = await db
      .select({ id: transactionsTable.id, userId: transactionsTable.userId, amount: transactionsTable.amount })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "pending"),
          lt(transactionsTable.createdAt, twoHoursAgo),
        )
      );

    if (expiredDeposits.length === 0) {
      logger.debug("No expired deposits to clean up");
      return;
    }

    logger.info({ count: expiredDeposits.length }, "Found expired deposits, marking as failed");

    for (const deposit of expiredDeposits) {
      await db.transaction(async (txn) => {
        await txn
          .update(transactionsTable)
          .set({ status: "failed" })
          .where(eq(transactionsTable.id, deposit.id));
        logger.info({ depositId: deposit.id, userId: deposit.userId }, "Marked expired deposit as failed");
      });
    }

    logger.info({ count: expiredDeposits.length }, "Cleanup complete: expired deposits marked as failed");
  } catch (err) {
    logger.error({ err }, "Error in cleanupExpiredDeposits background task");
  }
}

/**
 * Plisio Synchronization: Check status of all pending deposits.
 * This handles cases where webhooks are missed or delayed.
 * Runs every 5 minutes.
 */
export async function syncPlisioDeposits() {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY;
  if (!PLISIO_KEY) {
    logger.warn("Plisio sync skipped: PLISIO_SECRET_KEY not set");
    return;
  }

  try {
    // Only check deposits that are still pending and created within the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendingDeposits = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "pending"),
          lt(transactionsTable.createdAt, new Date()), // current
          lt(transactionsTable.createdAt, new Date(Date.now() - 2 * 60 * 1000)) // at least 2 mins old
        )
      )
      .limit(20);

    if (pendingDeposits.length === 0) return;

    logger.info({ count: pendingDeposits.length }, "Starting Plisio deposit sync for pending transactions");

    for (const tx of pendingDeposits) {
      if (!tx.plisioTrackId) continue;

      try {
        const resp = await fetch(
          `https://api.plisio.net/api/v1/operations/${tx.plisioTrackId}?api_key=${PLISIO_KEY}`,
          { signal: AbortSignal.timeout(10_000) }
        );

        if (!resp.ok) {
          logger.warn({ txId: tx.id, status: resp.status }, "Plisio API error during sync");
          continue;
        }

        const data = await resp.json() as any;
        if (data.status !== "success" || !data.data) continue;

        const pStatus = data.data.status;
        const creditStatuses = ["completed", "mismatch", "overpaid"];
        
        if (creditStatuses.includes(pStatus)) {
          const receivedAmount = parseFloat(data.data.received_amount || "0");
          const invoicedAmount = parseFloat(data.data.invoice_total_sum || "0");
          const sourceUsd = parseFloat(data.data.source_amount || tx.amount);
          
          if (receivedAmount <= 0 || invoicedAmount <= 0) {
            logger.warn({ txId: tx.id, pStatus }, "Plisio sync: payment reported as paid but amounts are zero");
            continue;
          }

          const ratio = receivedAmount / invoicedAmount;
          const creditAmount = Math.round(sourceUsd * ratio * 1e8) / 1e8;

          logger.info({ txId: tx.id, pStatus, creditAmount, ratio }, "Plisio sync: verified payment, crediting user");

          await db.transaction(async (txn) => {
            const flipped = await txn
              .update(transactionsTable)
              .set({ status: "completed", amount: String(creditAmount) })
              .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
              .returning({ id: transactionsTable.id });

            if (flipped.length === 0) return;

            const [updatedUser] = await txn.update(usersTable).set({
              balance: sql`balance + ${creditAmount}`,
              totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
              wagerRequirement: sql`(coalesce(total_deposited, 0) + ${creditAmount}) * 1.0`,
            }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });

            if (updatedUser) {
              const balanceAfter = parseFloat(updatedUser.balance);
              await recordLedger(txn, {
                userId: tx.userId,
                amount: creditAmount,
                balanceBefore: balanceAfter - creditAmount,
                balanceAfter,
                reason: "deposit",
                referenceId: tx.id,
                referenceType: "transaction",
              });
            }
            
            // Handle Referral
            try {
              const [depositor] = await txn.select({ referredBy: usersTable.referredBy }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
              if (depositor?.referredBy) {
                const referrerId = depositor.referredBy;
                const [activeRow] = await txn.select({ n: count() }).from(referralsTable).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
                const active = activeRow?.n ?? 0;
                const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
                const commission = Math.round(creditAmount * commissionRate * 1e8) / 1e8;
                if (commission > 0) {
                  await txn.update(usersTable).set({ balance: sql`balance + ${commission}` }).where(eq(usersTable.id, referrerId));
                  await txn.update(referralsTable).set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` }).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
                }
              }
            } catch (e) { logger.warn({ err: e }, "Referral credit failed in sync"); }
          });
        } else if (pStatus === "expired" || pStatus === "cancelled" || pStatus === "error") {
          await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, tx.id));
          logger.info({ txId: tx.id, pStatus }, "Plisio sync: marked failed transaction");
        }
      } catch (err) {
        logger.error({ err, txId: tx.id }, "Error syncing individual Plisio deposit");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in syncPlisioDeposits background task");
  }
}

/**
 * Start background tasks.
 * Call this once when the server starts.
 */
export function startBackgroundTasks() {
  // Cleanup expired: every 30 mins
  const cleanupInterval = setInterval(() => {
    cleanupExpiredDeposits().catch((err) => {
      logger.error({ err }, "Unhandled error in cleanup interval");
    });
  }, 30 * 60 * 1000);

  // Sync with Plisio: every 5 mins
  const syncInterval = setInterval(() => {
    syncPlisioDeposits().catch((err) => {
      logger.error({ err }, "Unhandled error in sync interval");
    });
  }, 5 * 60 * 1000);

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, clearing background task intervals");
    clearInterval(cleanupInterval);
    clearInterval(syncInterval);
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, clearing background task intervals");
    clearInterval(cleanupInterval);
    clearInterval(syncInterval);
  });

  logger.info("Background tasks started: cleanup (30m) and Plisio sync (5m)");
}
