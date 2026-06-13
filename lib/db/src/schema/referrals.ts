import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per referral relationship.
// status: pending = signed up but no deposit yet | active = first deposit made
export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => usersTable.id),
  referredId: integer("referred_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  earnedAmount: numeric("earned_amount", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
