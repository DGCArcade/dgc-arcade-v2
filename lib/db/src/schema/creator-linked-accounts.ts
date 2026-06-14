import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const creatorLinkedAccountsTable = pgTable("creator_linked_accounts", {
  id: serial("id").primaryKey(),
  creatorUserId: integer("creator_user_id").notNull(),
  personalUserId: integer("personal_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
