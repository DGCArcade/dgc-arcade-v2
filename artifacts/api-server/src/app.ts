import express, { type Express, type Request } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { verifyToken, isOwnerUser } from "./middlewares/auth.js";
import router from "./routes";
import { logger } from "./lib/logger";
import { startBackgroundTasks } from "./lib/background-tasks.js";
import { logVisitor } from "./services/visitor-service.js";
import { ensureSlotGamesSeeded, ensureCoreGamesSeeded } from "./routes/games.js";
import { pool } from "@workspace/db";

const app: Express = express();

// Behind Render's reverse proxy: trust the first hop so req.ip and rate limiting
// key off the real client IP (and the express-rate-limit X-Forwarded-For warning clears).
app.set("trust proxy", 1);

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
const ALLOWED_ORIGINS = [
  "https://differentgrindcrew.com",
  "https://www.differentgrindcrew.com",
  "https://dgcarcade.io",
  "https://www.dgcarcade.io",
  "https://dgc-arcade-frontend-cb8i.onrender.com",
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
    // Allow requests with no origin (mobile apps, curl, Render health checks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

// Security headers and caching optimization
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  // Compression hint for proxies
  res.setHeader("Vary", "Accept-Encoding");
  next();
});

// ── Response compression and performance headers ──────────────────────────────
// Cache static assets aggressively
app.use((req, res, next) => {
  if (req.url.match(/\.(js|css|png|jpg|gif|svg|woff|woff2|ttf|eot)$/i)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else if (req.url.startsWith("/api/games") || req.url.startsWith("/api/leaderboard")) {
    // Cache public game data for 1 minute
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  } else if (req.method === "GET") {
    // Default: no cache for dynamic content
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
  skip: (req) =>
    isOwnerRequest(req) || req.originalUrl.split("?")[0] === "/api/auth/me",
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

// Body parser with size limits for performance
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── Connection pooling optimization ──────────────────────────────────────────
// Ensure database connections are properly pooled
if (pool) {
  pool.on("error", (err) => {
    logger.error({ err }, "Unexpected error on idle client in pool");
  });
}

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
app.use("/api/blackjack", betLimiter);
app.use("/api/mines", betLimiter);
app.use("/api/chicken-road", betLimiter);
app.use("/api/bets", betLimiter);
app.use("/api", router);

// Start background tasks (cleanup, etc.)
startBackgroundTasks();

// Ensure the core game catalog + slot theme games are seeded in the games table.
// Core games seed only when the table is empty; both are idempotent.
ensureCoreGamesSeeded()
  .then(() => ensureSlotGamesSeeded())
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

export default app;
