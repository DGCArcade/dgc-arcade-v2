import { db, usersTable, userBalancesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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
  const [user, cryptoBalances] = await Promise.all([
    prefetchedStaticBalance !== undefined
      ? Promise.resolve({ balance: prefetchedStaticBalance, accountType: "normal" })
      : db.select({ balance: usersTable.balance, accountType: usersTable.accountType }).from(usersTable).where(eq(usersTable.id, userId)).limit(1).then((rows) => rows[0]),
    db.select().from(userBalancesTable).where(eq(userBalancesTable.userId, userId)),
  ]);
  if (!user) throw new Error("User not found");
  
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

  // Only include static USD balance for specialty creators (accountType === "creator")
  // Regular users (accountType === "normal" or "player") only have crypto balances
  const staticBalance = user.accountType === "creator" ? parseFloat(user.balance) : 0;
  return {
    totalBalance: liveTotalUsd + staticBalance,
    staticBalance,
    cryptoBalances: balancesWithPrices
  };
}

/**
 * Deducts an amount from a user's balance.
 * Returns the used currency and the new total balance.
 */
export async function deductBalance(
  userId: number, 
  amount: number, 
  preferredCurrency?: string,
  txn?: any
): Promise<{ newBalance: number; usedCurrency: string }> {
  const doDeduct = async (database: any) => {
    await database.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    await database.execute(sql`SELECT id FROM user_balances WHERE user_id = ${userId} FOR UPDATE`);

    const [lockedUser] = await database
      .select({ balance: usersTable.balance, accountType: usersTable.accountType })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!lockedUser) throw new Error("User not found");

    const cryptoRows = await database
      .select()
      .from(userBalancesTable)
      .where(eq(userBalancesTable.userId, userId));

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

    // Only include USD balance for creators. Regular users only have crypto balances.
    const staticBalance = lockedUser.accountType === "creator" ? parseFloat(lockedUser.balance) : 0;
    const totalBalance = liveTotalUsd + staticBalance;

    if (totalBalance < amount) throw new Error("Insufficient balance");

    let usedCurrency = "USD";
    let remainingToDeduct = amount;

    // 1. Try preferred currency first
    if (preferredCurrency && preferredCurrency !== "USD") {
      const crypto = balancesWithPrices.find(b => b.currency === preferredCurrency);
      if (crypto && crypto.usdValue >= amount) {
        const deductCryptoAmount = amount / crypto.price;
        await database
          .update(userBalancesTable)
          .set({ amount: sql`amount - ${deductCryptoAmount.toFixed(18)}` })
          .where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, crypto.currency)));
        usedCurrency = crypto.currency;
        remainingToDeduct = 0;
      }
    } else if (preferredCurrency === "USD" && staticBalance >= amount) {
      await database
        .update(usersTable)
        .set({ balance: sql`balance - ${amount.toFixed(8)}` })
        .where(eq(usersTable.id, userId));
      usedCurrency = "USD";
      remainingToDeduct = 0;
    }

    // 2. Fallback to highest balance first if preferred failed or not specified
    if (remainingToDeduct > 0) {
      // Only include USD balance for creators
      const allBalances = [
        ...(lockedUser.accountType === "creator" ? [{ currency: "USD", usdValue: staticBalance }] : []),
        ...balancesWithPrices
      ].sort((a, b) => b.usdValue - a.usdValue);

      const top = allBalances[0];
      if (top.usdValue < amount) {
        // Multi-coin deduction if no single coin has enough (rare for games, but possible)
        // For games, we prefer single-coin play. But if we must:
        for (const b of allBalances) {
          if (remainingToDeduct <= 0) break;
          const deductUsd = Math.min(remainingToDeduct, b.usdValue);
          if (b.currency === "USD") {
            await database.update(usersTable).set({ balance: sql`balance - ${deductUsd.toFixed(8)}` }).where(eq(usersTable.id, userId));
          } else {
            const price = priceMap.get(b.currency) || 1;
            const deductCrypto = deductUsd / price;
            await database.update(userBalancesTable).set({ amount: sql`amount - ${deductCrypto.toFixed(18)}` }).where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, b.currency)));
          }
          remainingToDeduct -= deductUsd;
          usedCurrency = b.currency; // Last used
        }
      } else {
        // Single coin deduction
        if (top.currency === "USD") {
          await database.update(usersTable).set({ balance: sql`balance - ${amount.toFixed(8)}` }).where(eq(usersTable.id, userId));
        } else {
          const price = priceMap.get(top.currency) || 1;
          const deductCrypto = amount / price;
          await database.update(userBalancesTable).set({ amount: sql`amount - ${deductCrypto.toFixed(18)}` }).where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, top.currency)));
        }
        usedCurrency = top.currency;
        remainingToDeduct = 0;
      }
    }

    return { newBalance: totalBalance - amount, usedCurrency };
  };

  if (txn) return doDeduct(txn);
  return db.transaction(doDeduct);
}

/**
 * Credits an amount to a user's balance.
 */
export async function creditBalance(userId: number, amount: number, currency?: string, txn?: any): Promise<number> {
  const doCredit = async (database: any) => {
    const [user] = await database.select({ accountType: usersTable.accountType }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) throw new Error("User not found");
    
    await database.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    if (currency && currency !== "USD") {
      await database.execute(sql`SELECT id FROM user_balances WHERE user_id = ${userId} FOR UPDATE`);
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
    } else if (currency === "USD" && user.accountType === "creator") {
      // Only creators can receive USD balance credits
      await database.update(usersTable)
        .set({ balance: sql`balance + ${amount}` })
        .where(eq(usersTable.id, userId));
    } else if (currency === "USD" && user.accountType !== "creator") {
      // Regular users cannot receive USD balance. Convert to crypto or reject.
      throw new Error("Regular users can only receive cryptocurrency, not USD balance.");
    }

    const { totalBalance } = await getUserBalance(userId);
    return totalBalance;
  };

  if (txn) return doCredit(txn);
  return db.transaction(doCredit);
}

export async function creditCryptoBalance(userId: number, currency: string, cryptoAmount: number, txn?: any): Promise<number> {
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
  
  // Return the updated total balance
  const { totalBalance } = await getUserBalance(userId);
  return totalBalance;
}
