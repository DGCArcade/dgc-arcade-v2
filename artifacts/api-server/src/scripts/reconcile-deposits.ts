import { db, usersTable, transactionsTable, referralsTable, userBalancesTable, creatorBankTxnsTable } from "@workspace/db";
import { eq, and, ne, sql, count } from "drizzle-orm";
import { recordLedger } from "../services/ledger.js";
// Using native fetch available in Node.js 18+

const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;

async function reconcileAll() {
  if (!PLISIO_KEY) {
    console.error("Plisio API key not set");
    return;
  }

  console.log("Starting retroactive reconciliation of all pending deposits...");

  try {
    const pendingDeposits = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "pending")
        )
      );

    console.log(`Found ${pendingDeposits.length} pending deposits to check.`);

    for (const tx of pendingDeposits) {
      if (!tx.plisioTrackId) {
        console.log(`Skipping transaction ${tx.id} - no Plisio track ID`);
        continue;
      }

      try {
        const resp = await fetch(
          `https://api.plisio.net/api/v1/operations/${tx.plisioTrackId}?api_key=${PLISIO_KEY}`
        );

        if (!resp.ok) {
          console.warn(`Plisio API error for tx ${tx.id}: ${resp.status}`);
          continue;
        }

        const data = await resp.json() as any;
        if (data.status !== "success" || !data.data) continue;

        const pStatus = data.data.status;
        const creditStatuses = ["completed", "mismatch", "overpaid"];
        
        if (creditStatuses.includes(pStatus)) {
          const receivedAmount  = parseFloat(String(data.data.received_amount || "0"));
          const invoicedAmount  = parseFloat(String(data.data.invoice_total_sum || "0"));
          const sourceUsd       = parseFloat(String(data.data.source_amount || tx.amount));
          const receivedUsdValue = parseFloat(String(data.data.received_amount_usd || data.data.received_sum_usd || "0"));
          
          // REAL AMOUNT CALCULATION: Credit the real received amount after fees.
          let ratioUsed: number;
          let creditAmount: number;
          
          if (receivedUsdValue > 0) {
            creditAmount = Math.round(receivedUsdValue * 1e8) / 1e8;
            ratioUsed = sourceUsd > 0 ? (creditAmount / sourceUsd) : 1;
            console.log(`Reconciling tx ${tx.id}: Crediting based on direct USD received value $${creditAmount}`);
          } else if (receivedAmount > 0 && invoicedAmount > 0 && sourceUsd > 0) {
            ratioUsed = receivedAmount / invoicedAmount;
            creditAmount = Math.round(sourceUsd * ratioUsed * 1e8) / 1e8;
            console.log(`Reconciling tx ${tx.id}: status=${pStatus}, credit=$${creditAmount}, ratio=${ratioUsed}`);
          } else if (sourceUsd > 0) {
            ratioUsed = 1;
            creditAmount = Math.round(sourceUsd * 1e8) / 1e8;
            console.warn(`Transaction ${tx.id}: Missing received data, crediting invoice amount $${creditAmount}`);
          } else {
            console.warn(`Transaction ${tx.id} reported as paid but no amount data available`);
            continue;
          }

          if (creditAmount <= 0) {
            console.warn(`Transaction ${tx.id}: calculated credit is zero, skipping`);
            continue;
          }

          await db.transaction(async (txn) => {
            const flipped = await txn
              .update(transactionsTable)
              .set({ 
                status: "completed", 
                amount: String(creditAmount),
                metadata: JSON.stringify({
                  received_amount: String(receivedAmount),
                  invoice_total_sum: String(invoicedAmount),
                  source_amount: String(sourceUsd),
                  ratio: ratioUsed,
                  credit_amount_usd: creditAmount,
                  paid_at: data.data.updated_at || new Date().toISOString(),
                  reconciled_at: new Date().toISOString()
                })
              })
              .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
              .returning({ id: transactionsTable.id });

            if (flipped.length === 0) return;

            // Credit Crypto-Native Balance (only if we have a real received crypto amount)
            const cryptoCurrency = tx.currency || "ETH";
            if (receivedAmount > 0) {
              await txn
                .insert(userBalancesTable)
                .values({
                  userId: tx.userId,
                  currency: cryptoCurrency,
                  amount: String(receivedAmount),
                })
                .onConflictDoUpdate({
                  target: [userBalancesTable.userId, userBalancesTable.currency],
                  set: { amount: sql`amount + ${String(receivedAmount)}` },
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
                note: `Retroactively credited $${creditAmount} USD (${receivedAmount > 0 ? receivedAmount + " " + cryptoCurrency : "invoice amount"})`,
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
                  
                  // Record in creator bank
                  await txn.insert(creatorBankTxnsTable).values({
                    creatorId: referrerId,
                    type: "referral_commission",
                    amount: String(commission),
                    toUserId: tx.userId,
                    description: `Retroactive commission from deposit ${tx.plisioTrackId || tx.id}`
                  });
                }
              }
            } catch (e) { console.error(`Referral credit failed for tx ${tx.id}:`, e); }
          });
          console.log(`Successfully reconciled tx ${tx.id}`);
        } else if (pStatus === "expired" || pStatus === "cancelled" || pStatus === "error") {
          await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, tx.id));
          console.log(`Marked tx ${tx.id} as failed (status: ${pStatus})`);
        }
      } catch (err) {
        console.error(`Error reconciling tx ${tx.id}:`, err);
      }
    }
    console.log("Reconciliation complete.");
  } catch (err) {
    console.error("Fatal error in reconciliation script:", err);
  }
}

reconcileAll().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
