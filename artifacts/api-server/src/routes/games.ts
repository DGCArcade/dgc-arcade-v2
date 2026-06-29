import { Router } from "express";
import { db, gamesTable, slotThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPlatformSettings } from "../lib/platform-settings.js";
export const gamesRouter = Router();

const PUBLIC_GAME_CACHE_MS = 60_000;
let activeGamesCache: { expiresAt: number; value: ReturnType<typeof formatGame>[] } | null = null;
let slotThemesCache: { expiresAt: number; value: { themes: typeof slotThemesTable.$inferSelect[] } } | null = null;

// ── Ensure all active slot themes have a corresponding games table entry ──────
export async function ensureSlotGamesSeeded() {
  try {
    const themes = await db.select().from(slotThemesTable).where(eq(slotThemesTable.active, "true"));
    for (const theme of themes) {
      const config = theme.config as any;
      await db.insert(gamesTable).values({
        slug: theme.slug,
        name: theme.name,
        description: (config.tagline as string) ?? `${theme.name} slot game`,
        minBet: String(config.minBet ?? 0.10),
        maxBet: String(config.maxBet ?? 1000),
        houseEdge: "0.035",
        active: true,
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.error("ensureSlotGamesSeeded error:", err);
  }
}

function formatGame(g: typeof gamesTable.$inferSelect) {
  return {
    id: g.id,
    slug: g.slug,
    name: g.name,
    description: g.description,
    imageUrl: g.imageUrl,
    minBet: parseFloat(g.minBet),
    maxBet: parseFloat(g.maxBet),
    houseEdge: parseFloat(g.houseEdge),
    active: g.active,
  };
}

// GET /api/games
gamesRouter.get("/", async (req, res) => {
  try {
    const now = Date.now();
    if (activeGamesCache && activeGamesCache.expiresAt > now) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.json(activeGamesCache.value);
      return;
    }

    const games = await db.select().from(gamesTable).where(eq(gamesTable.active, true));
    const value = games.map(formatGame);
    activeGamesCache = { value, expiresAt: now + PUBLIC_GAME_CACHE_MS };
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "List games error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/games/slot-themes — returns all active slot themes (public)
gamesRouter.get("/slot-themes", async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    if (!settings.slotsEnabled) {
      res.json({ themes: [] });
      return;
    }
    const now = Date.now();
    if (slotThemesCache && slotThemesCache.expiresAt > now) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.json(slotThemesCache.value);
      return;
    }

    const themes = await db
      .select()
      .from(slotThemesTable)
      .where(eq(slotThemesTable.active, "true"));
    const value = { themes };
    slotThemesCache = { value, expiresAt: now + PUBLIC_GAME_CACHE_MS };
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "List slot themes error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/games/slot-themes/:slug — returns a single slot theme by slug
gamesRouter.get("/slot-themes/:slug", async (req, res) => {
  try {
    const [theme] = await db
      .select()
      .from(slotThemesTable)
      .where(eq(slotThemesTable.slug, req.params.slug))
      .limit(1);
    if (!theme) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }
    res.json({ theme });
  } catch (err) {
    req.log.error({ err }, "Get slot theme error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/games/by-slug/:slug — look up a game by its slug
gamesRouter.get("/by-slug/:slug", async (req, res) => {
  try {
    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.slug, req.params.slug))
      .limit(1);
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(formatGame(game));
  } catch (err) {
    req.log.error({ err }, "Get game by slug error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/games/:gameId
// GET /api/games/settings — returns public feature flags
gamesRouter.get("/settings", async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    res.json({
      slotsEnabled: settings.slotsEnabled,
      raceEnabled: settings.raceEnabled,
      leaderboardEnabled: settings.leaderboardEnabled,
      gamesEnabled: settings.gamesEnabled,
      maintenanceMode: settings.maintenanceMode,
    });
  } catch (err) {
    req.log.error({ err }, "Get public settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

gamesRouter.get("/:gameId", async (req, res) => {
  const gameId = parseInt(req.params.gameId);
  if (isNaN(gameId)) {
    res.status(400).json({ error: "Invalid game ID" });
    return;
  }
  try {
    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, gameId))
      .limit(1);

    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(formatGame(game));
  } catch (err) {
    req.log.error({ err }, "Get game error");
    res.status(500).json({ error: "Internal server error" });
  }
});
