import express, { type Express, type Request } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import jwt from "jsonwebtoken";
import router from "./routes";
import { logger } from "./lib/logger";
import { startBackgroundTasks } from "./lib/background-tasks.js";
import { logVisitor } from "./services/visitor-service.js";
import { ensureSlotGamesSeeded } from "./routes/games.js";

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

// Security headers (manual — no extra dependency). This is a JSON-only API.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// ── Owner rate-limit bypass ──────────────────────────────────────────────────
// The platform owner (fanodgc / role=owner) is NEVER rate-limited on any endpoint.
// We decode the JWT from the Authorization header (no DB hit — pure token check).
// If the token is missing, invalid, or belongs to a non-owner, the normal limiter applies.
const OWNER_USERNAME_LOWER = "fanodgc";
const _jwtSecret = process.env.JWT_SECRET ?? "";

function isOwnerRequest(req: Request): boolean {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return false;
    const token = authHeader.slice(7);
    if (!_jwtSecret) return false;
    const payload = jwt.verify(token, _jwtSecret) as { username?: string; role?: string } | null;
    if (!payload) return false;
    // Match by username OR role so either credential grants the bypass
    const username = (payload.username ?? "").toLowerCase();
    const role = (payload.role ?? "").toLowerCase();
    return username === OWNER_USERNAME_LOWER || role === "owner";
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
  skip: (req) => isOwnerRequest(req),
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use("/api/blackjack", betLimiter);
app.use("/api/mines", betLimiter);
app.use("/api/bets", betLimiter);
app.use("/api", router);

// Start background tasks (cleanup, etc.)
startBackgroundTasks();

// Ensure slot theme games are seeded in the games table (idempotent)
ensureSlotGamesSeeded().catch(err => console.error("Slot game seeding error:", err));

export default app;
