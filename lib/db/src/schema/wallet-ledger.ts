import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const walletLedgerTable = pgTable("wallet_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 18, scale: 8 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 18, scale: 8 }).notNull(),
  reason: text("reason").notNull(),
  referenceId: integer("reference_id"),
  referenceType: text("reference_type"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
