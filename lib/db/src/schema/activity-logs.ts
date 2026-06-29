import { pgTable, serial, integer, text, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { visitorsTable } from "./visitors";

/** Immutable audit trail — every bet, deposit, withdrawal, tip, login, and visitor session. */
export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  username: text("username"),
  visitorId: integer("visitor_id").references(() => visitorsTable.id, { onDelete: "set null" }),
  /** player | visitor | admin | system */
  actorType: text("actor_type").notNull().default("player"),
  action: text("action").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  fingerprint: text("fingerprint"),
  amount: numeric("amount", { precision: 18, scale: 8 }),
  currency: text("currency"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
