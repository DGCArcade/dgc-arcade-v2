import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const walletLedgerTable = pgTable("wallet_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: text("amount").notNull(),
  balanceBefore: text("balance_before").notNull(),
  balanceAfter: text("balance_after").notNull(),
  reason: text("reason").notNull(),
  referenceId: integer("reference_id"),
  referenceType: text("reference_type"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
