import { db, usersTable, betsTable, transactionsTable, userBalancesTable, walletLedgerTable, fraudReviewsTable } from "@workspace/db";
import { ne, sql } from "drizzle-orm";

async function main() {
  console.log("🚀 Starting DGC Bank Data Cleanup...");

  try {
    // 1. Clear all bets (history)
    console.log("  - Clearing all bets...");
    await db.delete(betsTable);

    // 2. Clear all transactions EXCEPT "completed" ones
    console.log("  - Clearing non-completed transactions...");
    await db.delete(transactionsTable).where(ne(transactionsTable.status, "completed"));

    // 3. Clear wallet ledger (transaction history)
    console.log("  - Clearing wallet ledger...");
    await db.delete(walletLedgerTable);

    // 4. Clear fraud reviews (optional based on user request "Clear all previous history")
    // User said: "Keep all that" for completed transactions, but "AI fraud monitor... stay be on there"
    // So we'll keep fraud reviews as requested.

    // 5. Reset user stats (totalBets, totalWon, totalWageredAmount, totalDeposited)
    // We only reset stats, NOT the balance.
    console.log("  - Resetting user statistics...");
    await db.update(usersTable).set({
      totalBets: 0,
      totalWon: "0",
      totalWageredAmount: "0",
      totalDeposited: "0",
      wagerRequirement: "0",
      rakebackClaimed: "0"
    });

    // 6. Clear live crypto balances (user_balances table)
    console.log("  - Clearing live crypto balances...");
    await db.delete(userBalancesTable);

    console.log("✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
}

main().then(() => process.exit(0));
