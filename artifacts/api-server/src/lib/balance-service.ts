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
export async function getUserBalance(userId: number): Promise<UserBalance> {
  const [user] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const cryptoBalances = await db.select().from(userBalancesTable).where(eq(userBalancesTable.userId, userId));
  
  let liveTotalUsd = 0;
  const balancesWithPrices = await Promise.all(cryptoBalances.map(async (b) => {
    const price = await getCryptoPrice(b.currency);
    const usdValue = parseFloat(b.amount) * price;
    liveTotalUsd += usdValue;
    return {
      currency: b.currency,
      amount: parseFloat(b.amount),
      price,
      usdValue
    };
  }));

  const staticBalance = parseFloat(user.balance);
  return {
    totalBalance: liveTotalUsd + staticBalance,
    staticBalance,
    cryptoBalances: balancesWithPrices
  };
}

/**
 * Deducts an amount from a user's balance, preferring crypto balances first.
 * This ensures that users spend their "real" crypto value before their static bonus/cash balance.
 * Returns the updated total balance or throws if insufficient.
 */
export async function deductBalance(userId: number, amount: number, txn?: any): Promise<number> {
  const database = txn || db;
  
  // 1. Get current state
  const { totalBalance, staticBalance, cryptoBalances } = await getUserBalance(userId);
  if (totalBalance < amount) throw new Error("Insufficient balance");

  let remainingToDeduct = amount;

  // 2. Deduct from crypto balances first (sorted by USD value descending to simplify)
  const sortedCrypto = [...cryptoBalances].sort((a, b) => b.usdValue - a.usdValue);
  
  for (const crypto of sortedCrypto) {
    if (remainingToDeduct <= 0) break;
    const deductUsd = Math.min(remainingToDeduct, crypto.usdValue);
    const deductCryptoAmount = deductUsd / crypto.price;
    
    await database.update(userBalancesTable)
      .set({ amount: sql`amount - ${deductCryptoAmount.toFixed(18)}` })
      .where(and(eq(userBalancesTable.userId, userId), eq(userBalancesTable.currency, crypto.currency)));
    
    remainingToDeduct -= deductUsd;
  }

  // 3. Deduct remainder from static balance
  if (remainingToDeduct > 0) {
    await database.update(usersTable)
      .set({ balance: sql`balance - ${remainingToDeduct}` })
      .where(eq(usersTable.id, userId));
  }

  return totalBalance - amount;
}

/**
 * Credits an amount to a user's balance. 
 * FIX: If a currency is provided, it credits ONLY to that crypto balance.
 * If no currency (or USD), it credits to the static bonus balance.
 * This prevents the double-crediting bug where both USD and crypto were being added.
 */
export async function creditBalance(userId: number, amount: number, currency?: string, txn?: any): Promise<number> {
  const database = txn || db;
  
  if (currency && currency !== "USD") {
    // Credit to crypto balance
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
    // Credit to static balance
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
