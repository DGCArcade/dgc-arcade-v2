import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
export const usersRouter = Router();

const VIP_TIERS = [
  { id: 0, min: 0,         rakebackPct: 5  },
  { id: 1, min: 1_000,      rakebackPct: 8  },
  { id: 2, min: 10_000,     rakebackPct: 12 },
  { id: 3, min: 50_000,     rakebackPct: 14 },
  { id: 4, min: 100_000,    rakebackPct: 17 },
  { id: 5, min: 250_000,    rakebackPct: 21 },
  { id: 6, min: 500_000,    rakebackPct: 26 },
  { id: 7, min: 1_000_000,  rakebackPct: 30 },
];
function getVipTier(wagered: number) {
  return VIP_TIERS.slice().reverse().find(t => wagered >= t.min) ?? VIP_TIERS[0];
}

usersRouter.get("/owner/plisio-balance", requireAuth, async (req, res) => {
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || user.username !== "fanodgc") { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
    if (!PLISIO_SECRET_KEY) { res.status(500).json({ error: "Plisio API key not configured (check PLISIO_SECRET_KEY, PLISIO_API_KEY, or API_KEY)" }); return; }
    const COINS = ["BTC","ETH","LTC","DOGE","SOL","BCH","TRX","TON","USDT_TRX","USDT_TON","XMR","DASH"];
    const balances: Record<string, string> = {};
    await Promise.all(COINS.map(async (coin) => {
      try {
        const params = new URLSearchParams({ api_key: PLISIO_SECRET_KEY });
        const resp = await fetch(`https://api.plisio.net/api/v1/currencies/${coin}?${params.toString()}`);
        const data = await resp.json() as { status?: string; data?: { balance?: string } };
        if (data.status === "success" && data.data) balances[coin] = data.data.balance ?? "0";
      } catch {}
    }));
    res.json({ success: true, balances });
  } catch { res.status(500).json({ error: "Failed to fetch Plisio balances" }); }
});

const BLOCKED_COUNTRIES = ["GB","FR","NL","AU","BE","DK","DE","IT","RO","ES","SE","CH","CZ"];
const ALLOWED_US_STATES = ["Indiana","Florida"];

usersRouter.post("/geo", requireAuth, async (req, res) => {
  const { country, countryCode, region, city, ip, hostname, asn, isp, lat, lon, timezone, deviceName, deviceOs, deviceBrowser, deviceType, vpnDetected, vpnProvider, fingerprint } = req.body;
  try {
    const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v : undefined);
    const cc = typeof countryCode === "string" ? countryCode.toUpperCase() : "";
    const hasValidIp = typeof ip === "string" && ip.trim().length > 0;
    const jurisdictionAllowed = cc.length > 0 && !BLOCKED_COUNTRIES.includes(cc) && !(cc === "US" && typeof region === "string" && region.length > 0 && !ALLOWED_US_STATES.includes(region));
    const locationVerified = hasValidIp && jurisdictionAllowed;
    const updates = { geoCountry: str(country), geoCountryCode: str(countryCode), geoRegion: str(region), geoCity: str(city), geoIp: str(ip), geoHostname: str(hostname), geoAsn: str(asn), geoIsp: str(isp), geoLat: str(lat), geoLon: str(lon), geoTimezone: str(timezone), deviceName: str(deviceName), deviceOs: str(deviceOs), deviceBrowser: str(deviceBrowser), deviceType: str(deviceType), vpnProvider: str(vpnProvider), deviceFingerprint: str(fingerprint), vpnDetected: typeof vpnDetected === "boolean" ? vpnDetected : undefined, locationVerified: hasValidIp ? locationVerified : undefined };
    if (Object.values(updates).some((v) => v !== undefined)) await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true, locationVerified });
  } catch (err) { req.log.error({ err }, "Save geo error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.patch("/me/username", requireAuth, async (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username || username.length < 3 || username.length > 20) { res.status(400).json({ error: "Username must be 3-20 characters" }); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" }); return; }
  if (username.toLowerCase() === "fanodgc") { res.status(403).json({ error: "That username is reserved" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.usernameChangedAt) {
      const daysSince = (Date.now() - new Date(user.usernameChangedAt).getTime()) / (1000*60*60*24);
      if (daysSince < 90) { const daysLeft = Math.ceil(90 - daysSince); res.status(429).json({ error: `You can change your username in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` }); return; }
    }
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.username, username)).limit(1);
    if (existing) { res.status(409).json({ error: "Username already taken" }); return; }
    const [updated] = await db.update(usersTable).set({ username, usernameChangedAt: new Date() }).where(eq(usersTable.id, req.user!.userId)).returning({ id: usersTable.id, username: usersTable.username, usernameChangedAt: usersTable.usernameChangedAt });
    res.json({ success: true, username: updated.username, usernameChangedAt: updated.usernameChangedAt });
  } catch (err: any) {
    if (err?.message?.includes("unique")) { res.status(409).json({ error: "Username already taken" }); return; }
    res.status(500).json({ error: "Internal server error" });
  }
});

usersRouter.patch("/me/profile", requireAuth, async (req, res) => {
  const { telegramUsername } = req.body as { telegramUsername?: string };
  let tg: string | null = null;
  if (telegramUsername !== undefined) {
    if (telegramUsername === "") { tg = null; }
    else {
      const cleaned = telegramUsername.replace(/^@/, "").trim();
      if (!/^[a-zA-Z0-9_]{5,32}$/.test(cleaned)) { res.status(400).json({ error: "Invalid Telegram username (5-32 chars, letters/numbers/underscores)" }); return; }
      tg = cleaned;
    }
  }
  try {
    await db.update(usersTable).set({ telegramUsername: tg }).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true, telegramUsername: tg });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.post("/me/rakeback/claim", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ totalWageredAmount: usersTable.totalWageredAmount, rakebackClaimed: usersTable.rakebackClaimed }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const wagered = parseFloat(user.totalWageredAmount ?? "0");
    const claimed = parseFloat(user.rakebackClaimed ?? "0");
    const tier = getVipTier(wagered);
    const claimable = Math.max(0, wagered * (tier.rakebackPct / 100) - claimed);
    if (claimable < 0.01) { res.status(400).json({ error: "Nothing to claim yet" }); return; }
    const [updated] = await db.update(usersTable).set({ balance: sql`balance + ${claimable}`, rakebackClaimed: sql`coalesce(rakeback_claimed, 0) + ${claimable}` }).where(eq(usersTable.id, req.user!.userId)).returning({ balance: usersTable.balance, rakebackClaimed: usersTable.rakebackClaimed });
    res.json({ success: true, claimed: claimable, balance: parseFloat(updated.balance), rakebackClaimed: parseFloat(updated.rakebackClaimed ?? "0") });
  } catch (err) { req.log.error({ err }, "Rakeback claim error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.post("/me/request-deletion", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ username: usersTable.username, deletionRequestedAt: usersTable.deletionRequestedAt }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.username === "fanodgc") { res.status(403).json({ error: "Owner account cannot be deleted" }); return; }
    if (user.deletionRequestedAt) { res.status(400).json({ error: "Deletion already requested." }); return; }
    await db.update(usersTable).set({ deletionRequestedAt: new Date(), isBanned: true }).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true, message: "Account deletion requested." });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ id: usersTable.id, username: usersTable.username, balance: usersTable.balance, role: usersTable.role, totalBets: usersTable.totalBets, totalWon: usersTable.totalWon, totalWageredAmount: usersTable.totalWageredAmount, createdAt: usersTable.createdAt, usernameChangedAt: usersTable.usernameChangedAt, deletionRequestedAt: usersTable.deletionRequestedAt, lastLoginAt: usersTable.lastLoginAt, telegramUsername: usersTable.telegramUsername, rakebackClaimed: usersTable.rakebackClaimed }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const now = Date.now();
    const canChangeUsername = !user.usernameChangedAt || (now - new Date(user.usernameChangedAt).getTime()) >= 90*24*60*60*1000;
    const daysUntilChange = user.usernameChangedAt ? Math.max(0, Math.ceil(90 - (now - new Date(user.usernameChangedAt).getTime())/(1000*60*60*24))) : 0;
    const wagered = parseFloat(user.totalWageredAmount ?? "0");
    const rakebackClaimed = parseFloat(user.rakebackClaimed ?? "0");
    const tier = getVipTier(wagered);
    const claimableRakeback = Math.max(0, wagered * (tier.rakebackPct / 100) - rakebackClaimed);
    res.json({ id: user.id, username: user.username, balance: parseFloat(user.balance), role: user.role, totalBets: user.totalBets, totalWon: parseFloat(user.totalWon), totalWageredAmount: wagered, createdAt: user.createdAt.toISOString(), lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null, telegramUsername: user.telegramUsername ?? null, rakebackClaimed, claimableRakeback, canChangeUsername, daysUntilChange, deletionRequested: !!user.deletionRequestedAt });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.get("/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ id: user.id, username: user.username, balance: parseFloat(user.balance), avatarUrl: user.avatarUrl, totalBets: user.totalBets, totalWon: parseFloat(user.totalWon), createdAt: user.createdAt.toISOString() });
  } catch (err) { req.log.error({ err }, "Get user error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.post("/me/vault/deposit", requireAuth, async (req, res) => {
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
  try {
    const result = await db.update(usersTable).set({ balance: sql`balance - ${amount}`, vaultBalance: sql`coalesce(vault_balance, 0) + ${amount}` }).where(eq(usersTable.id, req.user!.userId)).returning({ balance: usersTable.balance, vaultBalance: usersTable.vaultBalance });
    if (!result[0]) { res.status(404).json({ error: "User not found" }); return; }
    if (parseFloat(result[0].balance) < 0) {
      await db.update(usersTable).set({ balance: sql`balance + ${amount}`, vaultBalance: sql`coalesce(vault_balance, 0) - ${amount}` }).where(eq(usersTable.id, req.user!.userId));
      res.status(400).json({ error: "Insufficient balance" }); return;
    }
    res.json({ success: true, balance: parseFloat(result[0].balance), vaultBalance: parseFloat(result[0].vaultBalance ?? "0") });
  } catch (err) { req.log.error({ err }, "Vault deposit error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.post("/me/vault/withdraw", requireAuth, async (req, res) => {
  const { amount, password } = req.body as { amount?: number; password?: string };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
  if (!password) { res.status(400).json({ error: "Password required" }); return; }
  try {
    const bcrypt = await import("bcryptjs");
    const [user] = await db.select({ passwordHash: usersTable.passwordHash, vaultBalance: usersTable.vaultBalance }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Incorrect password" }); return; }
    const vaultAmt = parseFloat(user.vaultBalance ?? "0");
    if (amount > vaultAmt) { res.status(400).json({ error: "Amount exceeds vault balance" }); return; }
    const [updated] = await db.update(usersTable).set({ balance: sql`balance + ${amount}`, vaultBalance: sql`vault_balance - ${amount}` }).where(eq(usersTable.id, req.user!.userId)).returning({ balance: usersTable.balance, vaultBalance: usersTable.vaultBalance });
    res.json({ success: true, balance: parseFloat(updated.balance), vaultBalance: parseFloat(updated.vaultBalance ?? "0") });
  } catch (err) { req.log.error({ err }, "Vault withdraw error"); res.status(500).json({ error: "Internal server error" }); }
});

usersRouter.get("/me/vault", requireAuth, async (req, res) => {
  try {
    const [user] = await db.select({ vaultBalance: usersTable.vaultBalance }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ vaultBalance: user.vaultBalance ?? "0" });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/users/me/device-history
usersRouter.get("/me/device-history", requireAuth, async (req, res) => {
  try {
    const { deviceHistoryTable } = await import("@workspace/db");
    const { desc } = await import("drizzle-orm");
    const sessions = await db.select().from(deviceHistoryTable)
      .where(eq(deviceHistoryTable.userId, req.user!.userId))
      .orderBy(desc(deviceHistoryTable.lastSeen))
      .limit(20);
    res.json({ sessions });
  } catch (err) {
    req.log.error({ err }, "Device history error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/me/logout-all-devices
usersRouter.post("/me/logout-all-devices", requireAuth, async (req, res) => {
  try {
    const { deviceHistoryTable } = await import("@workspace/db");
    const { eq: deq } = await import("drizzle-orm");
    await db.delete(deviceHistoryTable).where(deq(deviceHistoryTable.userId, req.user!.userId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Logout all devices error");
    res.status(500).json({ error: "Internal server error" });
  }
});

usersRouter.get("/tournaments/active", async (req, res) => {
  try {
    const { tournamentsTable, tournamentEntriesTable } = await import("@workspace/db");
    const { and, eq: deq, lte, gte } = await import("drizzle-orm");
    const now = new Date();
    const [tournament] = await db.select().from(tournamentsTable).where(and(deq(tournamentsTable.status, "active"), lte(tournamentsTable.startAt, now), gte(tournamentsTable.endAt, now))).limit(1);
    if (!tournament) { res.json(null); return; }
    const entries = await db.select({ userId: tournamentEntriesTable.userId, score: tournamentEntriesTable.score }).from(tournamentEntriesTable).where(deq(tournamentEntriesTable.tournamentId, tournament.id));
    const totalPlayers = entries.length;
    let callerId: number | null = null;
    try {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) { const { verifyToken } = await import("../middlewares/auth.js"); const payload = verifyToken(auth.slice(7)); if (payload?.userId) callerId = payload.userId; }
    } catch {}
    let rank: number | null = null; let userScore: string | null = null;
    if (callerId) {
      const sorted = [...entries].sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
      const idx = sorted.findIndex(e => e.userId === callerId);
      if (idx !== -1) { rank = idx + 1; userScore = sorted[idx].score; }
    }
    res.json({ tournament: { id: tournament.id, name: tournament.name, description: tournament.description, prize: tournament.prize, endAt: tournament.endAt }, rank, totalPlayers, userScore });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});
