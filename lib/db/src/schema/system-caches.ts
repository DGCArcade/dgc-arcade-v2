import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Durable key/value snapshots shared by API workers and realtime clients.
 * Large or high-churn domain records should use dedicated tables instead.
 */
export const systemCachesTable = pgTable("system_caches", {
  cacheKey: text("cache_key").primaryKey(),
  data: jsonb("data").notNull().default(null),
  version: integer("version").notNull().default(1),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  metadata: jsonb("metadata").notNull().default({}),
});

export type SystemCache = typeof systemCachesTable.$inferSelect;
export type NewSystemCache = typeof systemCachesTable.$inferInsert;
