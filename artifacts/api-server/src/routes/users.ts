import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
          const data = await resp.json();
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

// POST /api/users/geo — save location + device data for logged-in user
usersRouter.post("/geo", requireAuth, async (req, res) => {
  const {
    country, countryCode, region, city, ip, hostname, asn, isp, lat, lon, timezone,
    deviceName, deviceOs, deviceBrowser, deviceType,
    vpnDetected, vpnProvider, fingerprint,
  } = req.body;
  try {
    await db.update(usersTable)
      .set({
        geoCountry: country ?? null,
        geoCountryCode: countryCode ?? null,
        geoRegion: region ?? null,
        geoCity: city ?? null,
        geoIp: ip ?? null,
        geoHostname: hostname ?? null,
        geoAsn: asn ?? null,
        geoIsp: isp ?? null,
        geoLat: lat ?? null,
        geoLon: lon ?? null,
        geoTimezone: timezone ?? null,
        deviceName: deviceName ?? null,
        deviceOs: deviceOs ?? null,
        deviceBrowser: deviceBrowser ?? null,
        deviceType: deviceType ?? null,
        vpnDetected: vpnDetected ?? false,
        vpnProvider: vpnProvider ?? null,
        deviceFingerprint: fingerprint ?? null,
      })
      .where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true });
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
      .where(eq(usersTable.username, username)).limit(1);
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



