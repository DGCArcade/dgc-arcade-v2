import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const slotThemesTable = pgTable("slot_themes", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(), // Stores SlotConfig (reels, symbols, paylines, etc.)
  assets: jsonb("assets").notNull(), // Stores asset URLs for the theme
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSlotThemeSchema = createInsertSchema(slotThemesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSlotTheme = z.infer<typeof insertSlotThemeSchema>;
export type SlotTheme = typeof slotThemesTable.$inferSelect;
