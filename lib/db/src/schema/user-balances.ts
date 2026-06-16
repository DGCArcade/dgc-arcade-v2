import { pgTable, text, serial, numeric, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userBalancesTable = pgTable("user_balances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  currency: text("currency").notNull(), // e.g., 'BTC', 'ETH', 'DOGE'
  amount: numeric("amount", { precision: 24, scale: 12 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userCurrencyIdx: uniqueIndex("user_currency_idx").on(table.userId, table.currency),
}));

export type UserBalance = typeof userBalancesTable.$inferSelect;
export type InsertUserBalance = typeof userBalancesTable.$inferInsert;
