import express, { type Express, type Request } from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { verifyToken, isOwnerUser } from "./middlewares/auth.js";
import router from "./routes";
import { logger } from "./lib/logger";
import { startBackgroundTasks } from "./lib/background-tasks.js";
import { logVisitor } from "./services/visitor-service.js";
import { ensureSlotGamesSeeded, ensureCoreGamesSeeded, ensureRaceGameSeeded, ensureChickenRoadSeeded } from "./routes/games.js";
import { pool } from "@workspace/db";

const app: Express = express();
const isProduction = process.env.NODE_ENV === "production";

// Behind Render's reverse proxy: trust the first hop so req.ip and rate limiting
// key off the real client IP (and the express-rate-limit X-Forwarded-For warning clears).
app.set("trust proxy", 1);

// Gzip JSON responses — cuts payload size on slow cross-region links
app.use(compression({ threshold: 1024 }));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const STATIC_ORIGINS = [
  "https://dgcarcade.com",
  "https://www.dgcarcade.com",
  "https://dgc-arcade-frontend-cb8i.onrender.com",
];

function siteOrigins(): string[] {
  const site = process.env.SITE_URL?.trim().replace(/\/$/, "");
  if (!site) return [];
  const origins = [site];
  try {
    const u = new URL(site);
    if (!u.hostname.startsWith("www.")) {
      origins.push(`${u.protocol}//www.${u.hostname}`);
    }
  } catch {
    // ignore invalid SITE_URL
  }
  return origins;
}

const ALLOWED_ORIGINS = [
  ...STATIC_ORIGINS,
  ...siteOrigins(),
  ...(process.env.NODE_ENV !== "production"
    ? [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ]
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Return false (not an Error) so browsers get a clean CORS denial, not a 500
    callback(null, false);
  },
  credentials: true,
}));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Allow our own origin to embed iframes (slot game player)
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});

// Default: no browser cache for dynamic API responses. Individual routes
// override with their own Cache-Control (games, leaderboard, bets, etc.).
app.use((req, res, next) => {
  if (req.method === "GET" && req.url.startsWith("/api/")) {
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
  }
  next();
});

// ── Owner rate-limit bypass ──────────────────────────────────────────────────
// The platform owner (fanodgc / role=owner) is NEVER rate-limited on any endpoint.
function isOwnerRequest(req: Request): boolean {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return false;
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) return false;
    return isOwnerUser(payload);
  } catch {
    return false;
  }
}

// ── Rate limiting ────────────────────────────────────────────────────────────
// Login/register: strict — 10 attempts per 15 minutes per IP (brute-force guard)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
  // The /api/auth/me session check is polled every few seconds by the client.
  // Because app.use("/api/auth", ...) also matches "/api/auth/me", those polls
  // would otherwise burn this strict login/register budget and lock real users
  // out after ~10 polls. Exempt /me here — it has its own generous meLimiter.
  skip: (req) => {
    if (isOwnerRequest(req)) return true;
    if (req.originalUrl.split("?")[0] === "/api/auth/me") return true;
    const path = req.originalUrl.split("?")[0];
    if (path.endsWith("/login") && typeof req.body?.username === "string" && req.body.username.toLowerCase() === (process.env.OWNER_USERNAME || "owner")) {
      return true;
    }
    return false;
  },
});

// /api/auth/me polling: generous — 600 per 15 minutes (~1 per 1.5 s sustained)
// Must be mounted BEFORE authLimiter so the stricter limiter doesn't catch it.
const meLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." },
  skip: (req) => isOwnerRequest(req),
});

// Bet/game endpoints: 120 requests per minute per IP (2/sec sustained)
const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
  skip: (req) => isOwnerRequest(req),
});

// Admin endpoints: 200 requests per 15 minutes per IP
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests, please slow down." },
  skip: (req) => isOwnerRequest(req),
});

// Withdrawal endpoint: 10 attempts per 15 minutes per IP (anti-spam)
const withdrawLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many withdrawal attempts, please wait before trying again." },
  skip: (req) => isOwnerRequest(req),
});

// Deposit initiate: 20 per 15 minutes per IP
const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many deposit attempts, please wait." },
  skip: (req) => isOwnerRequest(req),
});

// Tips: 30 per 15 minutes per IP
const tipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tip attempts, please slow down." },
  skip: (req) => isOwnerRequest(req),
});

// Geo verification: 10 per 15 minutes per IP
const geoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many location checks, please wait." },
  skip: (req) => isOwnerRequest(req),
});

// Withdraw OTP: 5 per 15 minutes per IP
const withdrawOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification code requests. Please wait." },
  skip: (req) => isOwnerRequest(req),
});

// Public catalog/config — edge-friendly for Starlink & mobile (short TTL, stale-while-revalidate)
app.use((req, res, next) => {
  const path = req.url.split("?")[0];
  if (req.method !== "GET") return next();
  if (
    path === "/api/games" ||
    path.startsWith("/api/games/") ||
    path === "/api/chicken-road/config" ||
    path === "/api/leaderboard"
  ) {
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  }
  next();
});

// Body parser with size limits for performance
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── Visitor Tracking Middleware ──────────────────────────────────────────────
app.use((req, _res, next) => {
  // Fire and forget to not block response
  if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.includes(".")) {
    logVisitor(req).catch(() => {});
  }
  next();
});

// Public health check — no auth required
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth/me", meLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/admin", adminLimiter);
app.use("/api/transactions/withdraw", withdrawLimiter);
app.use("/api/transactions/deposit/initiate", depositLimiter);
app.use("/api/users/tip", tipLimiter);
app.use("/api/users/geo", geoLimiter);
app.use("/api/transactions/withdraw/otp", withdrawOtpLimiter);
app.use("/api/blackjack", betLimiter);
app.use("/api/mines", betLimiter);
app.use("/api/chicken-road", betLimiter);
app.use("/api/bets", betLimiter);
app.use("/api/sportsbook/bet", betLimiter);
app.use("/api/sports/bet", betLimiter);
app.use("/api", router);

// Start background tasks (cleanup, etc.)
startBackgroundTasks();

// Ensure the core game catalog + slot theme games are seeded in the games table.
// Core games seed only when the table is empty; both are idempotent.
ensureCoreGamesSeeded()
  .then(() => ensureSlotGamesSeeded())
  .then(() => ensureRaceGameSeeded())
  .then(() => ensureChickenRoadSeeded())
  .catch(err => console.error("Game seeding error:", err));

// ── Chicken Road session table migration (idempotent) ───────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chicken_road_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        game_id INTEGER NOT NULL REFERENCES games(id),
        bet NUMERIC(18, 8) NOT NULL,
        server_seed TEXT NOT NULL,
        client_seed TEXT,
        nonce INTEGER NOT NULL DEFAULT 1,
        tier TEXT NOT NULL DEFAULT 'medium',
        matrix TEXT NOT NULL,
        revealed TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        current_multiplier NUMERIC(10, 4) NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Chicken Road migration: chicken_road_sessions table ensured");
  } catch (err) {
    logger.error({ err }, "Chicken Road migration: failed to create table");
  }
})();

// ── Mines grid_size migration (idempotent) ────────────────────────────────────
// The mines_sessions table was originally built with a fixed 25-tile board.
// The game now supports 24, 48, and 60-tile grids.  We need to store which
// grid size was active when a session was created so that reveal/cashout always
// use the correct probability denominator.  This ALTER TABLE is safe to run on
// every startup — it is a no-op if the column already exists.
(async () => {
  try {
    await pool.query(`
      ALTER TABLE mines_sessions
      ADD COLUMN IF NOT EXISTS grid_size INTEGER NOT NULL DEFAULT 24;
    `);
    logger.info("Mines migration: grid_size column ensured");
  } catch (err) {
    logger.error({ err }, "Mines migration: failed to add grid_size column");
  }
})();

// ── Activity logs table migration (idempotent) ────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username TEXT,
        visitor_id INTEGER REFERENCES visitors(id) ON DELETE SET NULL,
        actor_type TEXT NOT NULL DEFAULT 'player',
        action TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        fingerprint TEXT,
        amount NUMERIC(18, 8),
        currency TEXT,
        reference_type TEXT,
        reference_id INTEGER,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_action_created ON activity_logs(action, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_username ON activity_logs(username);
      ALTER TABLE visitors ADD COLUMN IF NOT EXISTS username TEXT;
    `);
    logger.info("Activity logs migration: table ensured");
  } catch (err) {
    logger.error({ err }, "Activity logs migration failed");
  }
})();

// ── Withdraw OTP columns (idempotent) ─────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_otp_code TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_otp_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_otp_sent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_stepup_code TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_stepup_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_stepup_sent_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_limit_daily NUMERIC(18,2);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_limit_weekly NUMERIC(18,2);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_limit_monthly NUMERIC(18,2);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS loss_limit_daily NUMERIC(18,2);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS session_limit_minutes INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;
    `);
    logger.info("Users migration: withdraw OTP + gambling limit columns ensured");
  } catch (err) {
    logger.error({ err }, "Users migration: withdraw OTP columns failed");
  }
})();

export default app;
