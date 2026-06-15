import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const fraudReviewsTable = pgTable("fraud_reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  withdrawalId: integer("withdrawal_id"),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  score: integer("score").notNull().default(0),
  flags: text("flags").notNull().default("[]"),
  decision: text("decision").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
