import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Tournament — admin-created competitive events with a prize pool
// status: upcoming | active | ended
export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  prize: numeric("prize", { precision: 18, scale: 8 }).notNull().default("0"),
  status: text("status").notNull().default("upcoming"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Score = total amount wagered by user during the tournament window.
// Updated on every bet settled during the tournament.
export const tournamentEntriesTable = pgTable("tournament_entries", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull().references(() => tournamentsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  score: numeric("score", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tournamentUserIdx: uniqueIndex("tournament_entries_tourney_user_idx").on(t.tournamentId, t.userId),
}));

export type Tournament = typeof tournamentsTable.$inferSelect;
export type TournamentEntry = typeof tournamentEntriesTable.$inferSelect;
