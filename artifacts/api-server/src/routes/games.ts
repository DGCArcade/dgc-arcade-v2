import { Router } from "express";
import { db, gamesTable, slotThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const gamesRouter = Router();

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
    const games = await db.select().from(gamesTable).where(eq(gamesTable.active, true));
    res.json(games.map(formatGame));
  } catch (err) {
    req.log.error({ err }, "List games error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/games/slot-themes — returns all active slot themes (public)
gamesRouter.get("/slot-themes", async (req, res) => {
  try {
    const themes = await db
      .select()
      .from(slotThemesTable)
      .where(eq(slotThemesTable.active, "true"));
    res.json({ themes });
  } catch (err) {
    req.log.error({ err }, "List slot themes error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/games/:gameId
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
