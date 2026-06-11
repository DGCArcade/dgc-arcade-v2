import { pgTable, text, serial, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  balance: numeric("balance", { precision: 18, scale: 8 }).notNull().default("0"),
  avatarUrl: text("avatar_url"),
  totalBets: integer("total_bets").notNull().default(0),
  totalWon: numeric("total_won", { precision: 18, scale: 8 }).notNull().default("0"),
  role: text("role").notNull().default("player"),
  isBanned: boolean("is_banned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // Location data
  geoCountry: text("geo_country"),
  geoCountryCode: text("geo_country_code"),
  geoRegion: text("geo_region"),
  geoCity: text("geo_city"),
  geoIp: text("geo_ip"),
  geoHostname: text("geo_hostname"),
  geoAsn: text("geo_asn"),
  geoIsp: text("geo_isp"),
  geoLat: text("geo_lat"),
  geoLon: text("geo_lon"),
  geoTimezone: text("geo_timezone"),
  // Wagering & deposit tracking
  totalDeposited: numeric("total_deposited", { precision: 18, scale: 8 }).notNull().default("0"),
  totalWageredAmount: numeric("total_wagered_amount", { precision: 18, scale: 8 }).notNull().default("0"),
  wagerRequirement: numeric("wager_requirement", { precision: 18, scale: 8 }).notNull().default("0"),
  deviceFingerprint: text("device_fingerprint"),
  locationVerified: boolean("location_verified").notNull().default(false),
  // Username change cooldown (once per 90 days)
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
  // Soft-delete: requested date, data kept 1 year
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalBets: true,
  totalWon: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
