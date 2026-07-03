import { db, usersTable, betsTable, transactionsTable, minesSessionsTable, userBalancesTable, walletLedgerTable, referralsTable, dailyBonusClaimsTable, deviceHistoryTable, fraudReviewsTable, jackpotPoolTable, tournamentsTable, tournamentEntriesTable, visitorsTable, adminAuditLogsTable, adminMessagesTable, creatorBankTxnsTable, creatorMessagesTable, creatorLinkedAccountsTable } from "@workspace/db";
import { ne, eq, sql } from "drizzle-orm";

const OWNER_USERNAME = "fanodgc";

async function cleanup() {
  console.log("Starting data cleanup...");

  try {
    // 1. Identify the owner user
    const [owner] = await db.select().from(usersTable).where(eq(usersTable.username, OWNER_USERNAME)).limit(1);
    
    if (!owner) {
      console.error(`Owner user '${OWNER_USERNAME}' not found. Aborting cleanup to prevent complete wipe.`);
      return;
    }

    console.log(`Found owner: ${owner.username} (ID: ${owner.id}). Preserving this account.`);

    // 2. Delete related data
    console.log("Clearing bets...");
    await db.delete(betsTable);
    
    console.log("Clearing transactions...");
    await db.delete(transactionsTable);
    
    console.log("Clearing mines sessions...");
    await db.delete(minesSessionsTable);
    
    console.log("Clearing wallet ledger...");
    await db.delete(walletLedgerTable);
    
    console.log("Clearing referral data...");
    await db.delete(referralsTable);
    
    console.log("Clearing daily bonus claims...");
    await db.delete(dailyBonusClaimsTable);
    
    console.log("Clearing device history...");
    await db.delete(deviceHistoryTable);
    
    console.log("Clearing fraud reviews...");
    await db.delete(fraudReviewsTable);
    
    console.log("Clearing tournament data...");
    await db.delete(tournamentEntriesTable);
    await db.delete(tournamentsTable);
    
    console.log("Clearing visitors...");
    await db.delete(visitorsTable);

    console.log("Clearing admin logs and messages...");
    await db.delete(adminAuditLogsTable);
    await db.delete(adminMessagesTable);
    await db.delete(creatorBankTxnsTable);
    await db.delete(creatorMessagesTable);
    await db.delete(creatorLinkedAccountsTable);

    // 3. Clear crypto balances for everyone except owner
    console.log("Clearing other users' crypto balances...");
    await db.delete(userBalancesTable).where(ne(userBalancesTable.userId, owner.id));
    
    // Reset owner stats
    console.log("Resetting owner stats...");
    await db.update(usersTable)
      .set({
        totalBets: 0,
        totalWon: "0",
        totalDeposited: "0",
        totalWageredAmount: "0",
        wagerRequirement: "0",
        rakebackClaimed: "0",
        withdrawalAttempts: 0,
        balance: "0",
      })
      .where(eq(usersTable.id, owner.id));

    // 4. Delete all other users
    console.log("Deleting other users...");
    await db.delete(usersTable).where(ne(usersTable.id, owner.id));

    console.log("Cleanup completed successfully.");
  } catch (error) {
    console.error("Cleanup failed:", error);
  }
}

cleanup().then(() => process.exit(0));
