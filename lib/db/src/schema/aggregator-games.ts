import { pgTable, text, serial, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Cache for aggregator games from NexusGGR.
 * Stores premium slot titles with official cover art URLs for fallback display.
 */
export const aggregatorGamesTable = pgTable("aggregator_games", {
  id: serial("id").primaryKey(),
  gameId: text("game_id").notNull().unique(), // e.g. "pragmatic_play_sweet_bonanza"
  title: text("title").notNull(),
  provider: text("provider").notNull(), // e.g. "Pragmatic Play", "Hacksaw", "NoLimit City"
  thumbnail: text("thumbnail").notNull(), // Official high-res cover art URL
  rtp: numeric("rtp", { precision: 5, scale: 2 }).notNull().default("96.00"),
  volatility: text("volatility").notNull().default("medium"), // low | medium | high
  jackpot: numeric("jackpot", { precision: 18, scale: 2 }),
  slug: text("slug").notNull().unique(),
  metadata: jsonb("metadata"), // Additional fields: game_url, features, etc.
  active: text("active").notNull().default("true"),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAggregatorGameSchema = createInsertSchema(aggregatorGamesTable).omit({
  id: true,
  cachedAt: true,
  updatedAt: true,
});
export type InsertAggregatorGame = z.infer<typeof insertAggregatorGameSchema>;
export type AggregatorGame = typeof aggregatorGamesTable.$inferSelect;
