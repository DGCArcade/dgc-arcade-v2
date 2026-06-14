import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const adminMessagesTable = pgTable("admin_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  role: text("role").notNull().default("admin"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminMessage = typeof adminMessagesTable.$inferSelect;
