import { pgTable, text, serial, timestamp, numeric, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Sports Bets Table
 * 
 * Tracks all sports betting activity (separate from game bets).
 * Uses casinoBalance for unified wallet across slots + sports.
 * Real-time crypto-to-USD conversion applied at bet placement.
 */
export const sportsBetsTable = pgTable("sports_bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  
  // Fixture & Event Details
  fixtureId: text("fixture_id").notNull(), // From The Odds API
  sportKey: text("sport_key").notNull(), // e.g., "americanfootball_nfl", "soccer_epl"
  leagueTitle: text("league_title").notNull(), // e.g., "NFL", "Premier League"
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  commenceTime: timestamp("commence_time", { withTimezone: true }).notNull(),
  
  // Bet Details
  marketKey: text("market_key").notNull(), // e.g., "h2h" (head-to-head), "spreads", "totals"
  selectedOutcome: text("selected_outcome").notNull(), // e.g., "Home Team", "Away Team", "Over 45.5"
  odds: numeric("odds", { precision: 8, scale: 4 }).notNull(), // Decimal odds (e.g., 1.95)
  
  // Bet Amount & Currency
  betAmountUsd: numeric("bet_amount_usd", { precision: 18, scale: 8 }).notNull(), // Display amount
  betAmountCrypto: numeric("bet_amount_crypto", { precision: 24, scale: 12 }).notNull(), // Actual crypto value
  cryptoType: text("crypto_type").notNull(), // e.g., "BTC", "ETH", "USDT"
  cryptoPriceAtBet: numeric("crypto_price_at_bet", { precision: 18, scale: 8 }).notNull(), // USD/crypto rate at bet time
  
  // Potential Payout
  potentialPayoutUsd: numeric("potential_payout_usd", { precision: 18, scale: 8 }).notNull(),
  potentialPayoutCrypto: numeric("potential_payout_crypto", { precision: 24, scale: 12 }).notNull(),
  
  // Bet Status & Result
  status: text("status").notNull().default("pending"), // pending, won, lost, cancelled, void
  resultOutcome: text("result_outcome"), // Actual outcome from The Odds API (null until match finishes)
  actualPayoutUsd: numeric("actual_payout_usd", { precision: 18, scale: 8 }), // Null until settled
  actualPayoutCrypto: numeric("actual_payout_crypto", { precision: 24, scale: 12 }), // Null until settled
  settledAt: timestamp("settled_at", { withTimezone: true }), // When bet was resolved
  
  // Metadata & Audit
  bookmakerKey: text("bookmaker_key"), // Which bookmaker's odds were used
  isParlay: boolean("is_parlay").default(false), // If this is part of a parlay
  parlayId: text("parlay_id"), // Grouping ID for parlay legs
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"), // Any additional data (e.g., bet builder, parlay info)
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSportsBetSchema = createInsertSchema(sportsBetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  settledAt: true,
  actualPayoutUsd: true,
  actualPayoutCrypto: true,
  resultOutcome: true,
});

export type InsertSportsBet = z.infer<typeof insertSportsBetSchema>;
export type SportsBet = typeof sportsBetsTable.$inferSelect;
