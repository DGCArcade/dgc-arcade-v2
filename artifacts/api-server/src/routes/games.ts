import { Router } from "express";
import { db, gamesTable, slotThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPlatformSettings, isGameSlugEnabled } from "../lib/platform-settings.js";
export const gamesRouter = Router();

const PUBLIC_GAME_CACHE_MS = 60_000;
let activeGamesCache: { expiresAt: number; value: ReturnType<typeof formatGame>[] } | null = null;
let slotThemesCache: { expiresAt: number; value: { themes: typeof slotThemesTable.$inferSelect[] } } | null = null;

export function invalidatePublicGamesCache() {
  activeGamesCache = null;
  slotThemesCache = null;
}

// ── Core (non-slot) table games shown in the lobby ───────────────────────────
const CORE_GAMES: Array<{
  slug: string;
  name: string;
  description: string;
  minBet: string;
  maxBet: string;
  houseEdge: string;
}> = [
  { slug: "roulette", name: "Roulette", description: "Spin the wheel — European single-zero", minBet: "0.10", maxBet: "1000", houseEdge: "0.0270" },
  { slug: "dice", name: "Dice", description: "Roll over or under your target", minBet: "0.10", maxBet: "1000", houseEdge: "0.0100" },
  { slug: "crash", name: "Crash", description: "Cash out before the rocket crashes", minBet: "0.10", maxBet: "1000", houseEdge: "0.0300" },
  { slug: "mines", name: "Mines", description: "Find the gems, avoid the bombs", minBet: "0.10", maxBet: "1000", houseEdge: "0.0300" },
  { slug: "blackjack", name: "Blackjack", description: "Beat the dealer to 21", minBet: "0.10", maxBet: "1000", houseEdge: "0.0050" },
  { slug: "hilo", name: "Hi-Lo", description: "Guess higher or lower", minBet: "0.10", maxBet: "1000", houseEdge: "0.0200" },
  { slug: "coinflip", name: "Coin Flip", description: "50/50 — pays 2 to 1", minBet: "0.10", maxBet: "1000", houseEdge: "0.0200" },
  { slug: "keno", name: "Keno", description: "Pick your lucky numbers", minBet: "0.10", maxBet: "1000", houseEdge: "0.0500" },
  { slug: "chicken-road", name: "Chicken Road", description: "Cross the road, dodge the cars", minBet: "0.10", maxBet: "1000", houseEdge: "0.0400" },
  { slug: "race", name: "DGC Derby", description: "Pick your horse — first place pays 5.5×", minBet: "0.10", maxBet: "1000", houseEdge: "0.0500" },
];

// ── Bootstrap the core game catalog ONLY when the games table is empty ────────
// This makes the lobby populate on a brand-new database. The empty-table guard
// means it never resurrects or overwrites games an admin has intentionally
// changed or removed — it only bootstraps a blank catalog. It touches no money,
// balances, or wallet data.
export async function ensureCoreGamesSeeded() {
  try {
    const existing = await db.select({ id: gamesTable.id }).from(gamesTable).limit(1);
    if (existing.length > 0) return;
    await db
      .insert(gamesTable)
      .values(CORE_GAMES.map((g) => ({ ...g, active: true })))
      .onConflictDoNothing();
  } catch (err) {
    console.error("ensureCoreGamesSeeded error:", err);
  }
}

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

async function ensureGameSeeded(slug: string) {
  const def = CORE_GAMES.find((g) => g.slug === slug);
  if (!def) return;
  try {
    await db.insert(gamesTable).values({ ...def, active: true }).onConflictDoNothing();
    invalidatePublicGamesCache();
  } catch (err) {
    console.error(`ensureGameSeeded(${slug}) error:`, err);
  }
}

export async function ensureRaceGameSeeded() {
  return ensureGameSeeded("race");
}

export async function ensureChickenRoadSeeded() {
  return ensureGameSeeded("chicken-road");
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
    const settings = await getPlatformSettings();
    const value = games
      .filter((g) => isGameSlugEnabled(settings, g.slug))
      .map(formatGame);
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
    const settings = await getPlatformSettings();
    const [game] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.slug, req.params.slug))
      .limit(1);
    if (!game || !isGameSlugEnabled(settings, req.params.slug)) {
      res.status(404).json({ error: "Game not found or disabled" });
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
      disabledGameSlugs: settings.disabledGameSlugs,
      custom404Enabled: settings.custom404Enabled,
      custom404Title: settings.custom404Title,
      custom404Message: settings.custom404Message,
      custom404ButtonText: settings.custom404ButtonText,
      custom404ButtonUrl: settings.custom404ButtonUrl,
    });
  } catch (err) {
    req.log.error({ err }, "Get public settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

gamesRouter.get("/:gameIdOrSlug", async (req, res) => {
  const raw = String(req.params.gameIdOrSlug ?? "").trim();
  if (!raw) {
    res.status(400).json({ error: "Game reference required" });
    return;
  }

  const isNumericId = /^\d+$/.test(raw);

  try {
    const settings = await getPlatformSettings();

    const [game] = isNumericId
      ? await db
          .select()
          .from(gamesTable)
          .where(eq(gamesTable.id, parseInt(raw, 10)))
          .limit(1)
      : await db
          .select()
          .from(gamesTable)
          .where(eq(gamesTable.slug, raw))
          .limit(1);

    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    if (!game.active || !isGameSlugEnabled(settings, game.slug)) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(formatGame(game));
  } catch (err) {
    req.log.error({ err }, "Get game error");
    res.status(500).json({ error: "Internal server error" });
  }
});
