import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { gamesTable } from "./games";

export const minesSessionsTable = pgTable("mines_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  bet: numeric("bet", { precision: 18, scale: 8 }).notNull(),
  serverSeed: text("server_seed").notNull(),
  clientSeed: text("client_seed"),
  nonce: integer("nonce").notNull().default(1),
  mineCount: integer("mine_count").notNull().default(5),
  /**
   * gridSize stores the actual number of tiles on the board (24, 48, or 60).
   * This MUST be persisted so that reveal and cashout endpoints always use
   * the same grid size that was active when the session was created, preventing
   * multiplier miscalculations if the player somehow changes the grid mid-session.
   * Defaults to 24 for backward-compatibility with legacy sessions.
   */
  gridSize: integer("grid_size").notNull().default(24),
  minePositions: text("mine_positions").notNull(),
  revealed: text("revealed").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  currentMultiplier: numeric("current_multiplier", { precision: 10, scale: 4 }).notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MinesSession = typeof minesSessionsTable.$inferSelect;
