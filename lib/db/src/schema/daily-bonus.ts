import { pgTable, serial, integer, numeric, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const dailyBonusClaimsTable = pgTable("daily_bonus_claims", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  claimedDate: text("claimed_date").notNull(),
  // Consecutive day number — resets to 1 if a day is skipped.
  streakDay: integer("streak_day").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DailyBonusClaim = typeof dailyBonusClaimsTable.$inferSelect;
