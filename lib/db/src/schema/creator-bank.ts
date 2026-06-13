import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Creator DGC Bank — internal promoBalance transfers.
// No real payment gateway involved. All amounts are promo credits.
//
// Types:
//   admin_deposit      — owner (fanodgc) adds promo credits to creator
//   promo_tip          — creator sends promo credits to a user
//   referral_commission — automatic credit when a referred user deposits
export const creatorBankTxnsTable = pgTable("creator_bank_txns", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  toUserId: integer("to_user_id").references(() => usersTable.id),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CreatorBankTxn = typeof creatorBankTxnsTable.$inferSelect;
