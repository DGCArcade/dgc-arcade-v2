import { pgTable, text, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const visitorsTable = pgTable("visitors", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint"), // Browser fingerprint to track same device
  ip: text("ip"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"), // mobile, tablet, desktop
  os: text("os"),
  browser: text("browser"),

  // Location data (from IP geolocation — always collected from IP even if user denies location)
  country: text("country"),
  countryCode: text("country_code"),
  region: text("region"),
  city: text("city"),
  lat: text("lat"),
  lon: text("lon"),
  timezone: text("timezone"),
  hostname: text("hostname"),
  isp: text("isp"),
  asn: text("asn"),
  isVpn: boolean("is_vpn").default(false),
  vpnProvider: text("vpn_provider"),

  // Navigation tracking
  lastPage: text("last_page"),
  visitCount: integer("visit_count").notNull().default(1),
  pageHistory: jsonb("page_history").default([]),
  referrer: text("referrer"),

  // Client-side hints (sent from browser)
  screenResolution: text("screen_resolution"),
  language: text("language"),
  connectionType: text("connection_type"),

  // Enriched metadata
  metadata: jsonb("metadata"),
  isBot: boolean("is_bot").default(false),
  totalTimeOnSite: integer("total_time_on_site").default(0), // seconds

  // Link to registered user if they sign in
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  /** Denormalized username snapshot when a visitor becomes a logged-in player */
  username: text("username"),

  // Timestamps
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
