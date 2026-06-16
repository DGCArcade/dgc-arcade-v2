import { db, transactionsTable, usersTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "./logger.js";

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
 * Start background tasks.
 * Call this once when the server starts.
 */
export function startBackgroundTasks() {
  const cleanupInterval = setInterval(() => {
    cleanupExpiredDeposits().catch((err) => {
      logger.error({ err }, "Unhandled error in cleanup interval");
    });
  }, 30 * 60 * 1000);

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, clearing background task intervals");
    clearInterval(cleanupInterval);
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, clearing background task intervals");
    clearInterval(cleanupInterval);
  });

  logger.info("Background tasks started: deposit cleanup scheduled every 30 minutes");
}
