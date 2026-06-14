import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const creatorMessagesTable = pgTable("creator_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  senderUsername: text("sender_username").notNull(),
  senderRole: text("sender_role").notNull().default("admin"),
  recipientType: text("recipient_type").notNull().default("broadcast_all"),
  recipientId: integer("recipient_id"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creatorMessageReadsTable = pgTable("creator_message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
});
