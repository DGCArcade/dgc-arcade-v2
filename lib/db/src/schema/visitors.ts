import { pgTable, text, serial, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const visitorsTable = pgTable("visitors", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint"), // Browser fingerprint to track same device
  ip: text("ip"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"), // mobile, tablet, desktop
  os: text("os"),
  browser: text("browser"),
  
  // Location data (from IP or GPS)
  country: text("country"),
  countryCode: text("country_code"),
  region: text("region"),
  city: text("city"),
  lat: text("lat"),
  lon: text("lon"),
  isVpn: boolean("is_vpn").default(false),
  
  // Navigation tracking
  lastPage: text("last_page"),
  visitCount: serial("visit_count"), // Handled by logic
  
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
