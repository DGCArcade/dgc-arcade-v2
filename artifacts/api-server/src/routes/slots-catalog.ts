import { Router } from "express";
import { db } from "@workspace/db";
import { slotThemesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getPlatformSettings } from "../lib/platform-settings.js";

export const slotsCatalogRouter = Router();

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Slots Catalog — served from the DGC Arcade database (slot_themes table)
 *
 * This is the CORRECT approach for DGC Arcade:
 *   - No external API dependency, no RapidAPI subscription required
 *   - Games are managed in the Owner → Slot Themes admin panel
 *   - Each slot_theme entry maps 1:1 to a playable game
 *   - The built-in slot engine (artifacts/slot-engine) handles gameplay
 *
 * The old RapidAPI "slot-and-betting-games" endpoint was unreliable and
 * required a paid subscription — removed in favour of this self-hosted catalog.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface SlotGame {
  id: string;
  title: string;
  provider: string;
  thumbnail: string;
  rtp: number;
  volatility: "low" | "medium" | "high";
  jackpot?: number;
}

// Thumbnail map — DGC-branded cover images for each slot theme
const THUMBNAIL_MAP: Record<string, string> = {
  "classic-vegas":    "https://dgcarcade.com/slots/classic-vegas.jpg",
  "dragon-realm":     "https://dgcarcade.com/slots/dragon-realm.jpg",
  "neon-cyber":       "https://dgcarcade.com/slots/neon-cyber.jpg",
  "pharaohs-fortune": "https://dgcarcade.com/slots/pharaohs-fortune.jpg",
  "olympus-gates":    "https://dgcarcade.com/slots/olympus-gates.jpg",
  "dragon-fortune":   "https://dgcarcade.com/slots/dragon-fortune.jpg",
  "crypto-riches":    "https://dgcarcade.com/slots/crypto-riches.jpg",
  "space-adventure":  "https://dgcarcade.com/slots/space-adventure.jpg",
  "jungle-king":      "https://dgcarcade.com/slots/jungle-king.jpg",
};

const FALLBACK_THUMBNAIL = "https://dgcarcade.com/slots/placeholder.jpg";

function normalizeVolatility(v: unknown): "low" | "medium" | "high" {
  const s = String(v ?? "").toLowerCase();
  if (s === "low") return "low";
  if (s === "high" || s === "extreme" || s === "very high") return "high";
  return "medium";
}

// In-memory cache to avoid hammering the DB on every request
let cachedCatalog: SlotGame[] | null = null;
let cacheExpiresAt = 0;
const CACHE_DURATION_MS = 1000 * 60 * 5; // 5 minutes

export function invalidateSlotsCatalogCache() {
  cachedCatalog = null;
  cacheExpiresAt = 0;
}

/**
 * GET /api/slots/catalog
 *
 * Returns all active slot games from the slot_themes table.
 * Respects the slotsEnabled platform setting.
 */
slotsCatalogRouter.get("/catalog", async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    if (!settings.slotsEnabled) {
      res.json([]);
      return;
    }

    const now = Date.now();
    if (cachedCatalog && now < cacheExpiresAt) {
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
      res.json(cachedCatalog);
      return;
    }

    const themes = await db
      .select()
      .from(slotThemesTable)
      .where(eq(slotThemesTable.active, "true"));

    const games: SlotGame[] = themes.map((theme) => {
      const config = (theme.config as any) ?? {};
      return {
        id: theme.slug,
        title: theme.name,
        provider: config.provider || "DGC Originals",
        thumbnail: THUMBNAIL_MAP[theme.slug] ?? config.thumbnail ?? FALLBACK_THUMBNAIL,
        rtp: typeof config.rtp === "number" ? config.rtp : 96.0,
        volatility: normalizeVolatility(config.volatility),
        jackpot: config.jackpots?.grand ?? config.jackpot ?? undefined,
      };
    });

    cachedCatalog = games;
    cacheExpiresAt = now + CACHE_DURATION_MS;

    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json(games);
  } catch (error) {
    console.error("[SlotsCatalog] Error fetching catalog:", error);
    res.json(cachedCatalog ?? []);
  }
});
