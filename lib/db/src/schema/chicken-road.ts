import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { gamesTable } from "./games";

export const chickenRoadSessionsTable = pgTable("chicken_road_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  bet: numeric("bet", { precision: 18, scale: 8 }).notNull(),
  serverSeed: text("server_seed").notNull(),
  clientSeed: text("client_seed"),
  nonce: integer("nonce").notNull().default(1),
  tier: text("tier").notNull().default("medium"), // easy, medium, hard, extreme
  matrix: text("matrix").notNull(), // JSON string of number[][]
  revealed: text("revealed").notNull().default("[]"), // JSON string of revealed positions (user picks)
  status: text("status").notNull().default("active"), // active, won, lost
  currency: text("currency").notNull().default("USD"),
  currentMultiplier: numeric("current_multiplier", { precision: 10, scale: 4 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChickenRoadSession = typeof chickenRoadSessionsTable.$inferSelect;
