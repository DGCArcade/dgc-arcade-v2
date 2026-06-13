import { Router } from "express";
import { db, usersTable, tournamentsTable, tournamentEntriesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

export const tournamentsRouter = Router();

// GET /api/tournaments — list all tournaments (active, upcoming, recently ended)
tournamentsRouter.get("/", async (_req, res) => {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(tournamentsTable)
      .orderBy(desc(tournamentsTable.startAt))
      .limit(20);

    // Auto-compute live status from timestamps
    const result = rows.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      prize: parseFloat(t.prize),
      status: now >= new Date(t.endAt)
        ? "ended"
        : now >= new Date(t.startAt)
          ? "active"
          : "upcoming",
      startAt: t.startAt.toISOString(),
      endAt: t.endAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tournaments/:id/leaderboard
// Score = total wagered during tournament window (from tournament_entries)
tournamentsRouter.get("/:id/leaderboard", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid tournament ID" }); return; }

  try {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).limit(1);
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

    const entries = await db
      .select({
        userId: tournamentEntriesTable.userId,
        score: tournamentEntriesTable.score,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(tournamentEntriesTable)
      .innerJoin(usersTable, eq(tournamentEntriesTable.userId, usersTable.id))
      .where(eq(tournamentEntriesTable.tournamentId, id))
      .orderBy(desc(sql`CAST(${tournamentEntriesTable.score} AS DECIMAL)`))
      .limit(50);

    res.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        prize: parseFloat(tournament.prize),
        status: tournament.status,
        startAt: tournament.startAt.toISOString(),
        endAt: tournament.endAt.toISOString(),
      },
      leaderboard: entries.map((e, i) => ({
        rank: i + 1,
        userId: e.userId,
        username: e.username,
        avatarUrl: e.avatarUrl,
        score: parseFloat(e.score),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
