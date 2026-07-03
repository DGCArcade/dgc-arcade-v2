import { db, usersTable, transactionsTable, referralsTable, userBalancesTable, creatorBankTxnsTable } from "@workspace/db";
import { eq, and, ne, sql, count } from "drizzle-orm";
import { recordLedger } from "../services/ledger.js";
import {
  canCreditFromPlisioData,
  computePlisioCreditUsd,
  extractPlisioSourceUsd,
} from "../lib/plisio-amounts.js";

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

        const pStatus = String(data.data.status).toLowerCase();
        const creditStatuses = ["completed", "mismatch", "overpaid", "finished", "overdue"];

        if (creditStatuses.includes(pStatus)) {
          const plisioData = data.data as Record<string, unknown>;
          if (!canCreditFromPlisioData(plisioData)) {
            console.warn(`Transaction ${tx.id}: No sum_actual from Plisio — skipping.`);
            continue;
          }

          const cryptoCurrency = tx.currency || String(plisioData.currency ?? "ETH");
          const sourceUsd = extractPlisioSourceUsd(plisioData, parseFloat(String(tx.amount)));
          const priceModule = await import("../lib/price-service.js");
          const creditCalc = await computePlisioCreditUsd(
            plisioData,
            sourceUsd,
            (c) => priceModule.getCryptoPrice(c),
            cryptoCurrency,
          );

          const receivedAmount = creditCalc.cryptoReceived;
          const invoicedAmount = creditCalc.cryptoInvoiced;
          const creditAmount = creditCalc.creditUsd;
          const exchangeRate = creditCalc.exchangeRate;
          const creditCalcMethod = creditCalc.creditMethod;

          if (creditAmount <= 0) {
            console.warn(`Transaction ${tx.id}: calculated credit is zero — skipping`);
            continue;
          }

          console.log(`Reconciling tx ${tx.id}: invoice_amount_crypto=${invoicedAmount}, received_amount_crypto=${receivedAmount}, requested_usd=${sourceUsd}, credit_usd=${creditAmount}, method=${creditCalcMethod}`);

          await db.transaction(async (txn) => {
            const flipped = await txn
              .update(transactionsTable)
              .set({
                status: "completed",
                amount: String(creditAmount),
                metadata: JSON.stringify({
                  invoice_amount_crypto: invoicedAmount,
                  received_amount_crypto: receivedAmount,
                  received_amount_usd: creditAmount,
                  requested_amount_usd: sourceUsd,
                  credit_amount_usd: creditAmount,
                  exchange_rate: exchangeRate,
                  credit_calc_method: creditCalcMethod,
                  currency: cryptoCurrency,
                  paid_at: data.data.updated_at || new Date().toISOString(),
                  reconciled_at: new Date().toISOString(),
                }),
              })
              .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
              .returning({ id: transactionsTable.id });

            if (flipped.length === 0) {
              console.log(`tx ${tx.id} already completed — skipping (idempotency)`);
              return;
            }

            if (receivedAmount > 0) {
              await txn
                .insert(userBalancesTable)
                .values({ userId: tx.userId, currency: cryptoCurrency, amount: String(receivedAmount) })
                .onConflictDoUpdate({
                  target: [userBalancesTable.userId, userBalancesTable.currency],
                  set: { amount: sql`user_balances.amount + ${String(receivedAmount)}` },
                });
            } else {
              await txn
                .update(usersTable)
                .set({ balance: sql`balance + ${creditAmount}` })
                .where(eq(usersTable.id, tx.userId));
            }

            await txn.update(usersTable).set({
              totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
              wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmount}`,
            }).where(eq(usersTable.id, tx.userId));

            const [postUser] = await txn
              .select({ balance: usersTable.balance })
              .from(usersTable)
              .where(eq(usersTable.id, tx.userId))
              .limit(1);
            const balanceAfterStatic = postUser ? parseFloat(postUser.balance) : 0;
            const balanceBeforeStatic = receivedAmount > 0
              ? balanceAfterStatic
              : balanceAfterStatic - creditAmount;

            await recordLedger(txn, {
              userId: tx.userId,
              amount: creditAmount,
              balanceBefore: balanceBeforeStatic,
              balanceAfter: balanceBeforeStatic + creditAmount,
              reason: "deposit",
              referenceId: tx.id,
              referenceType: "transaction",
              note: `Reconcile credited ${receivedAmount > 0 ? receivedAmount + " " + cryptoCurrency : "$" + creditAmount + " USD"} (~$${creditAmount.toFixed(2)}) via ${creditCalcMethod}.`,
            });

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

                  await txn.insert(creatorBankTxnsTable).values({
                    creatorId: referrerId,
                    type: "referral_commission",
                    amount: String(commission),
                    toUserId: tx.userId,
                    description: `Retroactive commission from deposit ${tx.plisioTrackId || tx.id}`,
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
