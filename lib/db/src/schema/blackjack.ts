import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { gamesTable } from "./games";

export const blackjackHandsTable = pgTable("blackjack_hands", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  bet: numeric("bet", { precision: 18, scale: 8 }).notNull(),
  serverSeed: text("server_seed").notNull(),
  deckState: text("deck_state").notNull(),
  playerHand: text("player_hand").notNull().default("[]"),
  dealerHand: text("dealer_hand").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BlackjackHand = typeof blackjackHandsTable.$inferSelect;
