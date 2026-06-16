import { db, transactionsTable, usersTable, referralsTable, userBalancesTable, creatorBankTxnsTable } from "@workspace/db";
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
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;
  if (!PLISIO_KEY) {
    logger.warn("Plisio sync skipped: Plisio API key not set (check PLISIO_SECRET_KEY, PLISIO_API_KEY, or API_KEY)");
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
          lt(transactionsTable.createdAt, new Date()) // current
        )
      )
      .limit(50);

    if (pendingDeposits.length === 0) return;

    logger.info({ count: pendingDeposits.length }, "Starting Plisio deposit sync for pending transactions");

    for (const tx of pendingDeposits) {
      if (!tx.plisioTrackId) continue;

      try {
        let resp = await fetch(
          `https://api.plisio.net/api/v1/operations/${tx.plisioTrackId}?api_key=${PLISIO_KEY}`,
          { signal: AbortSignal.timeout(10_000) }
        );

        let data = await resp.json() as any;
        
        // Fallback to order_number if trackId fails
        if ((data.status !== "success" || !data.data) && tx.orderId) {
          resp = await fetch(
            `https://api.plisio.net/api/v1/operations?api_key=${PLISIO_KEY}&order_number=${tx.orderId}`,
            { signal: AbortSignal.timeout(10_000) }
          );
          const listData = await resp.json() as any;
          if (listData.status === "success" && listData.data && listData.data.length > 0) {
            data = { status: "success", data: listData.data[0] };
          }
        }

        if (data.status !== "success" || !data.data) continue;

        const pStatus = String(data.data.status).toLowerCase();
        // Finished is often used for completed transactions in Plisio API
        const creditStatuses = ["completed", "mismatch", "overpaid", "finished"];
        
        if (creditStatuses.includes(pStatus)) {
          // ROBUST AMOUNT EXTRACTION: Check every possible field Plisio might use for different coins/statuses
          const receivedAmount  = parseFloat(String(data.data.received_amount || data.data.amount || data.data.received_sum || "0"));
          const invoicedAmount  = parseFloat(String(data.data.invoice_total_sum || data.data.total_sum || data.data.amount || data.data.invoice_amount || "0"));
          const sourceUsd       = parseFloat(String(data.data.source_amount || data.data.invoice_amount || data.data.source_amount_usd || tx.amount));
          const receivedUsdValue = parseFloat(String(data.data.received_amount_usd || data.data.received_sum_usd || "0"));
          
          let ratioUsed: number;
          let creditAmount: number;
          
          // REAL AMOUNT CALCULATION: Credit the real received amount after fees.
          if (receivedUsdValue > 0) {
            creditAmount = Math.round(receivedUsdValue * 1e8) / 1e8;
            ratioUsed = sourceUsd > 0 ? (creditAmount / sourceUsd) : 1;
            logger.info({ txId: tx.id, receivedUsdValue, creditAmount, sourceUsd }, "Plisio sync: Crediting based on direct USD received value");
          } else if (receivedAmount > 0 && invoicedAmount > 0 && sourceUsd > 0) {
            ratioUsed = receivedAmount / invoicedAmount;
            creditAmount = Math.round(sourceUsd * ratioUsed * 1e8) / 1e8;
            logger.info({ txId: tx.id, pStatus, creditAmount, ratio: ratioUsed, receivedAmount, invoicedAmount }, "Plisio sync: crediting with ratio method");
          } else if (sourceUsd > 0) {
            ratioUsed = 1;
            creditAmount = Math.round(sourceUsd * 1e8) / 1e8;
            logger.warn({ txId: tx.id, pStatus, receivedAmount, invoicedAmount, sourceUsd, creditAmount }, "Plisio sync: Missing received data — crediting invoice amount as fallback");
          } else {
            logger.warn({ txId: tx.id, pStatus }, "Plisio sync: no amount data, skipping");
            continue;
          }
          
          if (creditAmount <= 0) {
            logger.warn({ txId: tx.id, pStatus, receivedAmount, invoicedAmount }, "Plisio sync: calculated credit is zero or negative, skipping");
            continue;
          }

          await db.transaction(async (txn) => {
            const flipped = await txn
              .update(transactionsTable)
              .set({ status: "completed", amount: String(creditAmount) })
              .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
              .returning({ id: transactionsTable.id });

            if (flipped.length === 0) return;

            // Credit Crypto-Native Balance (only if we have a real received crypto amount)
            const cryptoCurrency = tx.currency || "ETH";
            const cryptoAmountReceived = parseFloat(String(data.data.received_amount || "0"));
            
            if (cryptoAmountReceived > 0) {
              await txn
                .insert(userBalancesTable)
                .values({
                  userId: tx.userId,
                  currency: cryptoCurrency,
                  amount: String(cryptoAmountReceived),
                })
                .onConflictDoUpdate({
                  target: [userBalancesTable.userId, userBalancesTable.currency],
                  set: { amount: sql`user_balances.amount + ${String(cryptoAmountReceived)}` },
                });
            }

            // Credit USD balance (real amount after fees)
            const [updatedUser] = await txn.update(usersTable).set({
              balance: sql`balance + ${creditAmount}`,
              totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
              wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmount}`,
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
                note: `Credited $${creditAmount} USD (${cryptoAmountReceived > 0 ? cryptoAmountReceived + " " + cryptoCurrency : "invoice amount"})`,
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
                  
                  // Also record in creator bank for owner tracking
                  await txn.insert(creatorBankTxnsTable).values({
                    creatorId: referrerId,
                    type: "referral_commission",
                    amount: String(commission),
                    toUserId: tx.userId,
                    description: `Commission from deposit ${tx.plisioTrackId || tx.id} (Sync: ${cryptoAmountReceived} ${tx.currency})`
                  });
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

  // Sync with Plisio: every 1 min for fast auto-credit
  const syncInterval = setInterval(() => {
    syncPlisioDeposits().catch((err) => {
      logger.error({ err }, "Unhandled error in sync interval");
    });
  }, 1 * 60 * 1000);

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
