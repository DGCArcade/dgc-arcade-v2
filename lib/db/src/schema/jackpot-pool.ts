import { pgTable, serial, text, bigint, timestamp } from "drizzle-orm/pg-core";

export const jackpotPoolTable = pgTable("jackpot_pool", {
  id:         serial("id").primaryKey(),
  key:        text("key").unique().notNull(),
  valueCents: bigint("value_cents", { mode: "number" }).notNull().default(0),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
