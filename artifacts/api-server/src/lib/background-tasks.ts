import { db, transactionsTable, usersTable, referralsTable, userBalancesTable, creatorBankTxnsTable } from "@workspace/db";
import { eq, and, lt, gte, ne, sql, count } from "drizzle-orm";
import { logger } from "./logger.js";
import { recordLedger } from "../services/ledger.js";
import { creditCryptoBalance } from "./balance-service.js";

const WAGER_MULTIPLIER = 1.0;

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
 * Runs every 1 minute.
 *
 * IMPORTANT: We ONLY credit when we have a real received_amount from Plisio.
 * We never fall back to the invoice/source amount — that would over-credit users
 * when the actual payment was less than the invoice (e.g. network fees deducted).
 */
export async function syncPlisioDeposits() {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY;
  if (!PLISIO_KEY) {
    logger.warn("Plisio sync skipped: Plisio API key not set (check PLISIO_SECRET_KEY, PLISIO_API_KEY, or API_KEY)");
    return;
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pendingDeposits = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          eq(transactionsTable.status, "pending"),
          gte(transactionsTable.createdAt, oneDayAgo)
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
        const creditStatuses = ["completed", "mismatch", "overpaid", "finished"];
        
        if (creditStatuses.includes(pStatus)) {
          // ── ACTUAL RECEIVED AMOUNT ──────────────────────────────────────────
          // Always use the real received crypto amount from Plisio.
          // received_amount = what actually arrived in our wallet (after network fees).
          // We NEVER fall back to the invoice/source amount — doing so would
          // credit users more than they actually sent.
          const cryptoAmountReceived = parseFloat(String(data.data.received_amount || data.data.received_sum || "0"));
          const cryptoAmountInvoiced = parseFloat(String(data.data.invoice_total_sum || data.data.total_sum || data.data.amount || data.data.invoice_amount || "0"));
          const sourceUsd = parseFloat(String(data.data.source_amount || tx.amount));
          const receivedUsdValue = parseFloat(String(data.data.received_amount_usd || data.data.received_sum_usd || "0"));
          const cryptoCurrency = tx.currency || data.data.currency || "ETH";

          // ── STRICT GUARD: require real received data ────────────────────────
          // If Plisio hasn't provided the actual received amount yet, skip this
          // transaction — the IPN webhook will handle it when it arrives, or we
          // will pick it up on the next sync cycle once the data is populated.
          if (cryptoAmountReceived <= 0 && receivedUsdValue <= 0) {
            logger.info(
              { txId: tx.id, plisioTrackId: tx.plisioTrackId, pStatus },
              "Plisio sync: skipping — no received_amount data yet, will retry next cycle"
            );
            continue;
          }

          // ── CALCULATE USD CREDIT AMOUNT ─────────────────────────────────────
          // Priority 1: Plisio provides received_amount_usd directly.
          // Priority 2: Both received and invoiced crypto known → ratio method.
          // Priority 3: Received crypto known but no invoiced amount → live price.
          //             NEVER fall back to sourceUsd (invoice amount) — that would
          //             credit the full invoice even when only a fraction was paid.
          let creditAmountUsd: number;
          let exchangeRate: number | null = null;
          let creditCalcMethod: string;

          if (receivedUsdValue > 0) {
            creditAmountUsd = Math.round(receivedUsdValue * 1e8) / 1e8;
            creditCalcMethod = "plisio_usd_direct";
            if (cryptoAmountReceived > 0) {
              exchangeRate = Math.round((receivedUsdValue / cryptoAmountReceived) * 1e8) / 1e8;
            }
          } else if (cryptoAmountReceived > 0 && cryptoAmountInvoiced > 0 && sourceUsd > 0) {
            const ratio = cryptoAmountReceived / cryptoAmountInvoiced;
            creditAmountUsd = Math.round(sourceUsd * ratio * 1e8) / 1e8;
            creditCalcMethod = "ratio_received_over_invoiced";
            exchangeRate = cryptoAmountReceived > 0 ? Math.round((creditAmountUsd / cryptoAmountReceived) * 1e8) / 1e8 : null;
          } else {
            // cryptoAmountReceived > 0 but invoice_total_sum missing.
            // Use live price to convert real received crypto → USD.
            // NEVER use sourceUsd here — that is the invoice amount and would
            // over-credit the user if they only paid a fraction of it.
            const { getCryptoPrice } = await import("./price-service.js");
            const livePrice = await getCryptoPrice(cryptoCurrency);
            creditAmountUsd = Math.round(cryptoAmountReceived * livePrice * 1e8) / 1e8;
            exchangeRate = livePrice;
            creditCalcMethod = "live_price_lookup";

            logger.warn({
              event: "plisio_sync_no_invoice_total",
              txId: tx.id,
              plisioTrackId: tx.plisioTrackId,
              userId: tx.userId,
              cryptoCurrency,
              cryptoAmountReceived,
              livePrice,
              creditAmountUsd,
              requested_amount_usd: sourceUsd,
            }, "Plisio sync: invoice_total_sum missing — used live price lookup (NOT invoice amount)");
          }

          logger.info({
            event: "plisio_sync_crediting",
            txId: tx.id,
            plisioTrackId: tx.plisioTrackId,
            userId: tx.userId,
            ipn_status: pStatus,
            currency: cryptoCurrency,
            invoice_amount_crypto: cryptoAmountInvoiced,
            received_amount_crypto: cryptoAmountReceived,
            received_amount_usd: receivedUsdValue,
            requested_amount_usd: sourceUsd,
            credit_amount_usd: creditAmountUsd,
            exchange_rate: exchangeRate,
            credit_calc_method: creditCalcMethod,
          }, "Plisio sync: crediting deposit (actual received amount)");

          await db.transaction(async (txn) => {
            const flipped = await txn
              .update(transactionsTable)
              .set({
                status: "completed",
                amount: String(creditAmountUsd),
                metadata: JSON.stringify({
                  invoice_amount_crypto: cryptoAmountInvoiced,
                  received_amount_crypto: cryptoAmountReceived,
                  received_amount_usd: receivedUsdValue,
                  requested_amount_usd: sourceUsd,
                  credit_amount_usd: creditAmountUsd,
                  exchange_rate: exchangeRate,
                  credit_calc_method: creditCalcMethod,
                  currency: cryptoCurrency,
                  paid_at: data.data.updated_at || new Date().toISOString(),
                  synced_at: new Date().toISOString(),
                })
              })
              .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
              .returning({ id: transactionsTable.id });

            if (flipped.length === 0) return;

            // 1. Credit Crypto-Native Balance — always use real received crypto, never invoice.
            if (cryptoAmountReceived > 0) {
              await creditCryptoBalance(tx.userId, cryptoCurrency, cryptoAmountReceived, txn);
            } else {
              // receivedUsdValue > 0 but no crypto amount — credit static USD balance only
              await txn.update(usersTable).set({ balance: sql`balance + ${creditAmountUsd}` }).where(eq(usersTable.id, tx.userId));
            }

            // 2. Update Stats
            await txn.update(usersTable).set({
              totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmountUsd}`,
              wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmountUsd * WAGER_MULTIPLIER}`,
            }).where(eq(usersTable.id, tx.userId));

            // 3. Fetch real pre-credit balance for accurate ledger entry
            const [preBalance] = await txn
              .select({ balance: usersTable.balance })
              .from(usersTable)
              .where(eq(usersTable.id, tx.userId))
              .limit(1);
            const balanceBefore = preBalance ? parseFloat(preBalance.balance) - (cryptoAmountReceived > 0 ? 0 : creditAmountUsd) : 0;

            // 4. Record Ledger
            await recordLedger(txn, {
              userId: tx.userId,
              amount: creditAmountUsd,
              balanceBefore,
              balanceAfter: balanceBefore + creditAmountUsd,
              reason: "deposit",
              referenceId: tx.id,
              referenceType: "transaction",
              note: `Sync [${pStatus}] credited ${cryptoAmountReceived > 0 ? cryptoAmountReceived + " " + cryptoCurrency : "$" + creditAmountUsd + " USD"} (~$${creditAmountUsd.toFixed(2)}) via ${creditCalcMethod}. Invoice: ${cryptoAmountInvoiced} ${cryptoCurrency}.`,
            });
            
            // 4. Referral commission
            try {
              const [depositor] = await txn.select({ referredBy: usersTable.referredBy }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
              if (depositor?.referredBy) {
                const referrerId = depositor.referredBy;
                const [activeRow] = await txn.select({ n: count() }).from(referralsTable).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
                const active = activeRow?.n ?? 0;
                const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
                const commission = Math.round(creditAmountUsd * commissionRate * 1e8) / 1e8;
                if (commission > 0) {
                  await txn.update(usersTable).set({ balance: sql`balance + ${commission}` }).where(eq(usersTable.id, referrerId));
                  await txn.update(referralsTable).set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` }).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
                  await txn.insert(creatorBankTxnsTable).values({
                    creatorId: referrerId,
                    type: "referral_commission",
                    amount: String(commission),
                    toUserId: tx.userId,
                    description: `Commission from deposit ${tx.plisioTrackId || tx.id}`
                  });
                }
              }
            } catch (e) { logger.warn({ err: e }, "Referral credit failed in sync"); }
          });

          logger.info({ txId: tx.id, creditAmountUsd, cryptoAmountReceived, cryptoCurrency, userId: tx.userId, pStatus }, "Plisio sync: deposit credited ✓ (actual received amount)");
        } else if (pStatus === "expired" || pStatus === "cancelled" || pStatus === "error") {
          await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, tx.id));
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
  const cleanupInterval = setInterval(() => {
    cleanupExpiredDeposits().catch((err) => {
      logger.error({ err }, "Unhandled error in cleanup interval");
    });
  }, 30 * 60 * 1000);

  const syncInterval = setInterval(() => {
    syncPlisioDeposits().catch((err) => {
      logger.error({ err }, "Unhandled error in sync interval");
    });
  }, 1 * 60 * 1000);

  process.on("SIGTERM", () => {
    clearInterval(cleanupInterval);
    clearInterval(syncInterval);
  });

  process.on("SIGINT", () => {
    clearInterval(cleanupInterval);
    clearInterval(syncInterval);
  });

  logger.info("Background tasks started: cleanup (30m) and Plisio sync (1m)");
}
