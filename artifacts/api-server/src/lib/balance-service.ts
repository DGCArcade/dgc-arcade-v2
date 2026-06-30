import { db, usersTable, userBalancesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getCryptoPrice } from "./price-service.js";

export interface UserBalance {
  totalBalance: number;
  staticBalance: number;
  cryptoBalances: {
    currency: string;
    amount: number;
    price: number;
    usdValue: number;
  }[];
}

/**
 * Calculates the real-time balance for a user, including live crypto valuations.
 */
export async function getUserBalance(
  userId: number,
  prefetchedStaticBalance?: string,
): Promise<UserBalance> {
  // Batch DB reads in parallel — each round trip costs ~150ms Oregon↔Singapore.
  const [user, cryptoBalances] = await Promise.all([
    prefetchedStaticBalance !== undefined
      ? Promise.resolve({ balance: prefetchedStaticBalance })
      : db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1).then((rows) => rows[0]),
    db.select().from(userBalancesTable).where(eq(userBalancesTable.userId, userId)),
  ]);
  if (!user) throw new Error("User not found");
  
  // OPTIMIZATION: Fetch all prices in parallel first, then map. 
  // This reduces the impact of Oregon-to-Singapore latency by batching operations.
  const currencies = [...new Set(cryptoBalances.map(b => b.currency))];
  const priceMap = new Map<string, number>();
  await Promise.all(currencies.map(async (curr) => {
    priceMap.set(curr, await getCryptoPrice(curr));
  }));

  let liveTotalUsd = 0;
  const balancesWithPrices = cryptoBalances.map((b) => {
    const price = priceMap.get(b.currency) || 0;
    const usdValue = parseFloat(b.amount) * price;
    liveTotalUsd += usdValue;
    return {
      currency: b.currency,
      amount: parseFloat(b.amount),
      price,
      usdValue
    };
  });

  const staticBalance = parseFloat(user.balance);
  return {
    totalBalance: liveTotalUsd + staticBalance,
    staticBalance,
    cryptoBalances: balancesWithPrices
  };
}

/**
 * Deducts an amount from a user's balance, preferring crypto balances first.
 *
 * RACE CONDITION FIX: Uses SELECT FOR UPDATE to acquire row-level locks on the
 * user and user_balances rows before reading balances. This prevents two concurrent
 * requests (e.g., simultaneous bet + withdrawal) from both passing the sufficiency
 * check and both deducting, resulting in a negative balance.
 *
 * If a txn is already provided by the caller, the locks are acquired within that
 * transaction. Otherwise a new transaction is created.
 */
export async function deductBalance(userId: number, amount: number, txn?: any, preferredCurrency?: string): Promise<number> {
  const doDeduct = async (database: any) => {
    // Acquire row-level locks before reading. Concurrent callers block here until
    // this transaction commits or rolls back.
    await database.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    await database.execute(sql`SELECT id FROM user_balances WHERE user_id = ${userId} FOR UPDATE`);

    // Re-read fresh state now that we hold the locks
    const [lockedUser] = await database
      .select({ balance: usersTable.balance })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!lockedUser) throw new Error("User not found");

    const cryptoRows = await database
      .select()
      .from(userBalancesTable)
      .where(eq(userBalancesTable.userId, userId));

    // OPTIMIZATION: Batch price lookups to reduce cross-region latency impact
    const currencies = [...new Set((cryptoRows as any[]).map(b => b.currency))];
    const priceMap = new Map<string, number>();
    await Promise.all(currencies.map(async (curr) => {
      priceMap.set(curr, await getCryptoPrice(curr));
    }));

    let liveTotalUsd = 0;
    const balancesWithPrices = (cryptoRows as any[]).map((b) => {
      const price = priceMap.get(b.currency) || 0;
      const usdValue = parseFloat(b.amount) * price;
      liveTotalUsd += usdValue;
      return { currency: b.currency as string, amount: parseFloat(b.amount), price, usdValue };
    });

    const staticBalance = parseFloat(lockedUser.balance);
    const totalBalance = liveTotalUsd + staticBalance;

    if (totalBalance < amount) throw new Error("Insufficient balance");

    let remainingToDeduct = amount;

    // If a preferred currency is specified (e.g., for withdrawal), we MUST deduct from it first.
    if (preferredCurrency && preferredCurrency !== "USD") {
      const crypto = balancesWithPrices.find(b => b.currency === preferredCurrency);
      if (crypto) {
        const deductUsd = Math.min(remainingToDeduct, crypto.usdValue);
        const deductCryptoAmount = deductUsd / crypto.price;
        
        await database
          .update(userBalancesTable)
          .set({ amount: sql`amount - ${deductCryptoAmount.toFixed(18)}` })
          .where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, crypto.currency)));
        
        remainingToDeduct -= deductUsd;
      }
    } else if (preferredCurrency === "USD") {
      const deductUsd = Math.min(remainingToDeduct, staticBalance);
      await database
        .update(usersTable)
        .set({ balance: sql`balance - ${deductUsd.toFixed(8)}` })
        .where(eq(usersTable.id, userId));
      remainingToDeduct -= deductUsd;
    }

    // If there's still amount remaining (or no preferred currency was set, e.g., for games),
    // we fallback to the default "crypto-first, highest-value-first" strategy.
    if (remainingToDeduct > 0) {
      const sortedCrypto = [...balancesWithPrices]
        .filter(b => b.currency !== preferredCurrency) // Don't re-deduct from the same coin
        .sort((a, b) => b.usdValue - a.usdValue);

      for (const crypto of sortedCrypto) {
        if (remainingToDeduct <= 0) break;
        const deductUsd = Math.min(remainingToDeduct, crypto.usdValue);
        const deductCryptoAmount = deductUsd / crypto.price;

        await database
          .update(userBalancesTable)
          .set({ amount: sql`amount - ${deductCryptoAmount.toFixed(18)}` })
          .where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, crypto.currency)));

        remainingToDeduct -= deductUsd;
      }

      if (remainingToDeduct > 0 && preferredCurrency !== "USD") {
        await database
          .update(usersTable)
          .set({ balance: sql`balance - ${remainingToDeduct.toFixed(8)}` })
          .where(eq(usersTable.id, userId));
      }
    }

    return totalBalance - amount;
  };

  if (txn) {
    return doDeduct(txn);
  } else {
    return db.transaction(doDeduct);
  }
}

/**
 * Credits an amount to a user's balance. 
 * If a currency is provided, it credits ONLY to that crypto balance.
 * If no currency (or USD), it credits to the static bonus balance.
 */
export async function creditBalance(userId: number, amount: number, currency?: string, txn?: any): Promise<number> {
  const database = txn || db;
  
  if (currency && currency !== "USD") {
    const price = await getCryptoPrice(currency);
    const cryptoAmount = amount / price;
    
    await database.insert(userBalancesTable)
      .values({
        userId,
        currency,
        amount: String(cryptoAmount),
      })
      .onConflictDoUpdate({
        target: [userBalancesTable.userId, userBalancesTable.currency],
        set: { amount: sql`user_balances.amount + ${String(cryptoAmount)}` },
      });
  } else {
    await database.update(usersTable)
      .set({ balance: sql`balance + ${amount}` })
      .where(eq(usersTable.id, userId));
  }

  const { totalBalance } = await getUserBalance(userId);
  return totalBalance;
}

/**
 * Specifically credits a crypto amount (not USD) to a user's balance.
 * Used for real deposits where we know exactly how much crypto arrived.
 */
export async function creditCryptoBalance(userId: number, currency: string, cryptoAmount: number, txn?: any): Promise<void> {
  const database = txn || db;
  await database.insert(userBalancesTable)
    .values({
      userId,
      currency,
      amount: String(cryptoAmount),
    })
    .onConflictDoUpdate({
      target: [userBalancesTable.userId, userBalancesTable.currency],
      set: { amount: sql`user_balances.amount + ${String(cryptoAmount)}` },
    });
}
