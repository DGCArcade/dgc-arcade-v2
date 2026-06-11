import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const deviceHistoryTable = pgTable("device_history", {
  id: serial("id").primaryKey(),

  userId: integer("user_id").notNull(),

  fingerprint: text("fingerprint"),

  deviceName: text("device_name"),
  deviceOs: text("device_os"),
  deviceBrowser: text("device_browser"),
  deviceType: text("device_type"),

  ip: text("ip"),

  country: text("country"),
  city: text("city"),

  vpnDetected: boolean("vpn_detected").default(false),
  vpnProvider: text("vpn_provider"),

  firstSeen: timestamp("first_seen", {
    withTimezone: true,
  }).defaultNow(),

  lastSeen: timestamp("last_seen", {
    withTimezone: true,
  }).defaultNow(),

  loginCount: integer("login_count")
    .notNull()
    .default(1),
});
