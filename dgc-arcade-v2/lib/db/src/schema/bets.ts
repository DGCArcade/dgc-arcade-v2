import { pgTable, text, serial, timestamp, numeric, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gamesTable } from "./games";

export const betsTable = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  payout: numeric("payout", { precision: 18, scale: 8 }).notNull().default("0"),
  won: boolean("won").notNull().default(false),
  multiplier: numeric("multiplier", { precision: 10, scale: 4 }),
  serverSeed: text("server_seed"),
  serverSeedHash: text("server_seed_hash"),
  clientSeed: text("client_seed"),
  nonce: integer("nonce").notNull().default(0),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBetSchema = createInsertSchema(betsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof betsTable.$inferSelect;
