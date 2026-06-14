import { db, tournamentsTable, tournamentEntriesTable } from "@workspace/db";
import { eq, and, lte, gte, sql } from "drizzle-orm";

/**
 * recordTournamentWager — fire-and-forget: find any active tournaments and
 * upsert the user's running score (total amount wagered) in tournament_entries.
 * Call after every settled bet — errors are logged but never thrown.
 */
export async function recordTournamentWager(
  userId: number,
  amount: number,
  logger?: { error?: (obj: unknown, msg: string) => void }
): Promise<void> {
  try {
    const now = new Date();
    const active = await db
      .select({ id: tournamentsTable.id })
      .from(tournamentsTable)
      .where(
        and(
          eq(tournamentsTable.status, "active"),
          lte(tournamentsTable.startAt, now),
          gte(tournamentsTable.endAt, now)
        )
      );

    if (!active.length) return;

    await Promise.all(
      active.map((t) =>
        db
          .insert(tournamentEntriesTable)
          .values({ tournamentId: t.id, userId, score: String(amount) })
          .onConflictDoUpdate({
            target: [
              tournamentEntriesTable.tournamentId,
              tournamentEntriesTable.userId,
            ],
            set: {
              score: sql`tournament_entries.score + ${amount}`,
            },
          })
      )
    );
  } catch (err) {
    if (logger?.error) {
      logger.error({ err }, "recordTournamentWager failed (non-critical)");
    }
  }
}

/**
 * getActiveTournamentWithRank — returns the first active tournament and the
 * user's current rank inside it. Returns null if no active tournament.
 */
export async function getActiveTournamentWithRank(userId?: number): Promise<{
  tournament: { id: number; name: string; description: string | null; prize: string; endAt: Date };
  rank: number | null;
  totalPlayers: number;
  userScore: string | null;
} | null> {
  try {
    const now = new Date();
    const [tournament] = await db
      .select()
      .from(tournamentsTable)
      .where(
        and(
          eq(tournamentsTable.status, "active"),
          lte(tournamentsTable.startAt, now),
          gte(tournamentsTable.endAt, now)
        )
      )
      .limit(1);

    if (!tournament) return null;

    // Total players entered
    const entries = await db
      .select({
        userId: tournamentEntriesTable.userId,
        score: tournamentEntriesTable.score,
      })
      .from(tournamentEntriesTable)
      .where(eq(tournamentEntriesTable.tournamentId, tournament.id));

    const totalPlayers = entries.length;

    if (!userId) {
      return {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          description: tournament.description,
          prize: tournament.prize,
          endAt: tournament.endAt,
        },
        rank: null,
        totalPlayers,
        userScore: null,
      };
    }

    const userEntry = entries.find((e) => e.userId === userId);
    if (!userEntry) {
      return {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          description: tournament.description,
          prize: tournament.prize,
          endAt: tournament.endAt,
        },
        rank: null,
        totalPlayers,
        userScore: null,
      };
    }

    // Sort by score descending to find rank
    const sorted = [...entries].sort(
      (a, b) => parseFloat(b.score) - parseFloat(a.score)
    );
    const rank = sorted.findIndex((e) => e.userId === userId) + 1;

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        prize: tournament.prize,
        endAt: tournament.endAt,
      },
      rank,
      totalPlayers,
      userScore: userEntry.score,
    };
  } catch {
    return null;
  }
}
