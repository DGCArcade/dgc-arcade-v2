import { pgTable, text, integer, timestamp, numeric, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const casinoTransactionsTable = pgTable("casino_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  transactionId: text("transaction_id").notNull().unique(),
  type: text("type").notNull(), // BET | WIN | REFUND
  amount: numeric("amount", { precision: 24, scale: 12 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CasinoTransaction = typeof casinoTransactionsTable.$inferSelect;
export type InsertCasinoTransaction = typeof casinoTransactionsTable.$inferInsert;
