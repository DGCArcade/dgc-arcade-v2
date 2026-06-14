import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
export const usersRouter = Router();

// GET /api/users/owner/plisio-balance — fanodgc only, real-time casino bank
usersRouter.get("/owner/plisio-balance", requireAuth, async (req, res) => {
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || user.username !== "fanodgc") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? "";
    if (!PLISIO_SECRET_KEY) {
      res.status(500).json({ error: "PLISIO_SECRET_KEY not configured" });
      return;
    }
    // Plisio has no /balances bulk endpoint — query each currency individually
    const COINS = ["BTC", "ETH", "LTC", "DOGE", "SOL", "BCH", "TRX", "TON", "USDT_TRX", "USDT_TON", "XMR", "DASH"];
    const balances: Record<string, string> = {};
    await Promise.all(
      COINS.map(async (coin) => {
        try {
          const params = new URLSearchParams({ api_key: PLISIO_SECRET_KEY });
          const resp = await fetch(`https://api.plisio.net/api/v1/currencies/${coin}?${params.toString()}`);
          const data = await resp.json() as { status?: string; data?: { balance?: string } };
          if (data.status === "success" && data.data) {
            balances[coin] = data.data.balance ?? "0";
          }
        } catch { /* skip failed coins */ }
      })
    );
    res.json({ success: true, balances });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Plisio balances" });
  }
});

// Jurisdiction rules — kept in sync with the client location gate
// (location-gate.tsx). Used to re-validate the reported jurisdiction server-side
// before granting locationVerified, so a forged client request cannot self-verify
// from a blocked region.
const BLOCKED_COUNTRIES = ["GB", "FR", "NL", "AU", "BE", "DK", "DE", "IT", "RO", "ES", "SE", "CH", "CZ"];
const ALLOWED_US_STATES = ["Indiana", "Florida"];

// POST /api/users/geo — save location + device data for logged-in user
usersRouter.post("/geo", requireAuth, async (req, res) => {
  const {
    country, countryCode, region, city, ip, hostname, asn, isp, lat, lon, timezone,
    deviceName, deviceOs, deviceBrowser, deviceType,
    vpnDetected, vpnProvider, fingerprint,
  } = req.body;
  try {
    // Only persist a field when the client actually sent a non-empty value, so a
    // partial or empty payload can never erase previously collected compliance
    // data (Drizzle skips `undefined` keys in .set()).
    const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v : undefined);

    // Location is "verified" only when we have a real IP AND the reported
    // jurisdiction passes the same block rules the gate enforces. This server-side
    // re-check stops a forged request from self-verifying out of a blocked region.
    // (Geo data is still client-sourced; full server-side IP geolocation is a
    // future hardening step.)
    const cc = typeof countryCode === "string" ? countryCode.toUpperCase() : "";
    const hasValidIp = typeof ip === "string" && ip.trim().length > 0;
    const jurisdictionAllowed =
      cc.length > 0 &&
      !BLOCKED_COUNTRIES.includes(cc) &&
      !(cc === "US" && typeof region === "string" && region.length > 0 && !ALLOWED_US_STATES.includes(region));
    const locationVerified = hasValidIp && jurisdictionAllowed;

    const updates = {
      geoCountry: str(country),
      geoCountryCode: str(countryCode),
      geoRegion: str(region),
      geoCity: str(city),
      geoIp: str(ip),
      geoHostname: str(hostname),
      geoAsn: str(asn),
      geoIsp: str(isp),
      geoLat: str(lat),
      geoLon: str(lon),
      geoTimezone: str(timezone),
      deviceName: str(deviceName),
      deviceOs: str(deviceOs),
      deviceBrowser: str(deviceBrowser),
      deviceType: str(deviceType),
      vpnProvider: str(vpnProvider),
      deviceFingerprint: str(fingerprint),
      vpnDetected: typeof vpnDetected === "boolean" ? vpnDetected : undefined,
      // When we have a real IP, set verification to the computed value (so an
      // honest re-check from a now-blocked region downgrades to false). When no
      // IP is present, leave the existing value untouched (don't let a transient
      // empty post drop a previously verified user).
      locationVerified: hasValidIp ? locationVerified : undefined,
    };

    if (Object.values(updates).some((v) => v !== undefined)) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId));
    }
    res.json({ success: true, locationVerified });
  } catch (err) {
    req.log.error({ err }, "Save geo error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/users/me/username — change username (once per 90 days) ──
usersRouter.patch("/me/username", requireAuth, async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username || username.length < 3 || username.length > 20) {
    res.status(400).json({ error: "Username must be 3-20 characters" });
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
    return;
  }
  if (username.toLowerCase() === "fanodgc") {
    res.status(403).json({ error: "That username is reserved" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // 90-day cooldown check
    if (user.usernameChangedAt) {
      const daysSince = (Date.now() - new Date(user.usernameChangedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 90) {
        const daysLeft = Math.ceil(90 - daysSince);
        res.status(429).json({ error: `You can change your username in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` });
        return;
      }
    }

    // Check uniqueness
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(ilike(usersTable.username, username)).limit(1);
    if (existing) { res.status(409).json({ error: "Username already taken" }); return; }

    const [updated] = await db.update(usersTable)
      .set({ username, usernameChangedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId))
      .returning({ id: usersTable.id, username: usersTable.username, usernameChangedAt: usersTable.usernameChangedAt });

    res.json({ success: true, username: updated.username, usernameChangedAt: updated.usernameChangedAt });
  } catch (err: any) {
    if (err?.message?.includes("unique")) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/users/me/request-deletion — soft-delete account ──
usersRouter.post("/me/request-deletion", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ username: usersTable.username, deletionRequestedAt: usersTable.deletionRequestedAt })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.username === "fanodgc") {
      res.status(403).json({ error: "Owner account cannot be deleted" }); return;
    }
    if (user.deletionRequestedAt) {
      res.status(400).json({ error: "Deletion already requested. Your account will be removed within 1 year." }); return;
    }

    await db.update(usersTable)
      .set({
        deletionRequestedAt: new Date(),
        isBanned: true, // prevent login immediately
      })
      .where(eq(usersTable.id, req.user!.userId));

    res.json({ success: true, message: "Account deletion requested. Your data will be permanently deleted within 1 year per our Privacy Policy." });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/users/me — get current user settings info ──
usersRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      balance: usersTable.balance,
      role: usersTable.role,
      totalBets: usersTable.totalBets,
      totalWon: usersTable.totalWon,
      createdAt: usersTable.createdAt,
      usernameChangedAt: usersTable.usernameChangedAt,
      deletionRequestedAt: usersTable.deletionRequestedAt,
    }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const now = Date.now();
    const canChangeUsername = !user.usernameChangedAt ||
      (now - new Date(user.usernameChangedAt).getTime()) >= 90 * 24 * 60 * 60 * 1000;
    const daysUntilChange = user.usernameChangedAt
      ? Math.max(0, Math.ceil(90 - (now - new Date(user.usernameChangedAt).getTime()) / (1000*60*60*24)))
      : 0;

    res.json({
      id: user.id,
      username: user.username,
      balance: parseFloat(user.balance),
      role: user.role,
      totalBets: user.totalBets,
      totalWon: parseFloat(user.totalWon),
      createdAt: user.createdAt.toISOString(),
      canChangeUsername,
      daysUntilChange,
      deletionRequested: !!user.deletionRequestedAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:userId
usersRouter.get("/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      balance: parseFloat(user.balance),
      avatarUrl: user.avatarUrl,
      totalBets: user.totalBets,
      totalWon: parseFloat(user.totalWon),
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Get user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/users/me/vault/deposit — move from balance to vault ──
usersRouter.post("/me/vault/deposit", requireAuth, async (req, res) => {
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
  try {
    const result = await db.update(usersTable)
      .set({
        balance: sql`balance - ${amount}`,
        vaultBalance: sql`coalesce(vault_balance, 0) + ${amount}`,
      })
      .where(eq(usersTable.id, req.user!.userId))
      .returning({ balance: usersTable.balance, vaultBalance: usersTable.vaultBalance });
    if (!result[0]) { res.status(404).json({ error: "User not found" }); return; }
    if (parseFloat(result[0].balance) < 0) {
      // Rollback - insufficient balance
      await db.update(usersTable)
        .set({ balance: sql`balance + ${amount}`, vaultBalance: sql`coalesce(vault_balance, 0) - ${amount}` })
        .where(eq(usersTable.id, req.user!.userId));
      res.status(400).json({ error: "Insufficient balance" }); return;
    }
    res.json({ success: true, balance: parseFloat(result[0].balance), vaultBalance: parseFloat(result[0].vaultBalance ?? "0") });
  } catch (err) {
    req.log.error({ err }, "Vault deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/users/me/vault/withdraw — verify password, move from vault to balance ──
usersRouter.post("/me/vault/withdraw", requireAuth, async (req, res) => {
  const { amount, password } = req.body as { amount?: number; password?: string };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
  if (!password) { res.status(400).json({ error: "Password required to release vault funds" }); return; }
  try {
    const bcrypt = await import("bcryptjs");
    const [user] = await db.select({ passwordHash: usersTable.passwordHash, vaultBalance: usersTable.vaultBalance })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Incorrect password" }); return; }
    const vaultAmt = parseFloat(user.vaultBalance ?? "0");
    if (amount > vaultAmt) { res.status(400).json({ error: "Amount exceeds vault balance" }); return; }
    const [updated] = await db.update(usersTable)
      .set({ balance: sql`balance + ${amount}`, vaultBalance: sql`vault_balance - ${amount}` })
      .where(eq(usersTable.id, req.user!.userId))
      .returning({ balance: usersTable.balance, vaultBalance: usersTable.vaultBalance });
    res.json({ success: true, balance: parseFloat(updated.balance), vaultBalance: parseFloat(updated.vaultBalance ?? "0") });
  } catch (err) {
    req.log.error({ err }, "Vault withdraw error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/users/me/vault — get vault balance ──
usersRouter.get("/me/vault", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ vaultBalance: usersTable.vaultBalance })
      .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ vaultBalance: user.vaultBalance ?? "0" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/users/tournaments/active — public: active tournament + caller's rank ──
usersRouter.get("/tournaments/active", async (req, res) => {
  try {
    const { tournamentsTable, tournamentEntriesTable } = await import("@workspace/db");
    const { and, eq: deq, lte, gte } = await import("drizzle-orm");
    const now = new Date();
    const [tournament] = await db.select().from(tournamentsTable)
      .where(and(deq(tournamentsTable.status, "active"), lte(tournamentsTable.startAt, now), gte(tournamentsTable.endAt, now)))
      .limit(1);
    if (!tournament) { res.json(null); return; }

    const entries = await db.select({
      userId: tournamentEntriesTable.userId,
      score: tournamentEntriesTable.score,
    }).from(tournamentEntriesTable)
      .where(deq(tournamentEntriesTable.tournamentId, tournament.id));

    const totalPlayers = entries.length;

    // Try to get caller's userId from token (optional auth)
    let callerId: number | null = null;
    try {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        const { verifyToken } = await import("../middlewares/auth.js");
        const payload = verifyToken(auth.slice(7));
        if (payload?.userId) callerId = payload.userId;
      }
    } catch { /* unauthenticated — skip rank */ }

    let rank: number | null = null;
    let userScore: string | null = null;
    if (callerId) {
      const sorted = [...entries].sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
      const idx = sorted.findIndex(e => e.userId === callerId);
      if (idx !== -1) {
        rank = idx + 1;
        userScore = sorted[idx].score;
      }
    }

    res.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        description: tournament.description,
        prize: tournament.prize,
        endAt: tournament.endAt,
      },
      rank,
      totalPlayers,
      userScore,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
