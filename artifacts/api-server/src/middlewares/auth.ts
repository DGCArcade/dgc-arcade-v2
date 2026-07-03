import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret || _jwtSecret === "dgc-arcade-secret-change-in-production") {
  throw new Error("JWT_SECRET environment variable is required and must not be the default value.");
}
const JWT_SECRET = _jwtSecret;

export interface AuthPayload {
  userId: number;
  username: string;
  role: string;
}

export interface DbUserContext {
  username: string;
  role: string;
  accountType: string | null;
  isBanned: boolean;
  withdrawalsEnabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      dbUser?: DbUserContext;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

const OWNER_USERNAME_LOWER = "fanodgc";

export function isOwnerUser(user: AuthPayload): boolean {
  return user.username.toLowerCase() === OWNER_USERNAME_LOWER || user.role.toLowerCase() === "owner";
}

/** Platform owner account — never tip, link, ban, or mutate from non-owner paths. */
export function isProtectedAccount(
  target: { username?: string | null; role?: string | null } | undefined | null,
): boolean {
  if (!target) return false;
  return target.role === "owner" || (target.username ?? "").toLowerCase() === OWNER_USERNAME_LOWER;
}

async function loadDbUser(userId: number): Promise<DbUserContext | null> {
  const [row] = await db
    .select({
      username: usersTable.username,
      role: usersTable.role,
      accountType: usersTable.accountType,
      isBanned: usersTable.isBanned,
      withdrawalsEnabled: usersTable.withdrawalsEnabled,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    username: row.username,
    role: row.role ?? "player",
    accountType: row.accountType,
    isBanned: !!row.isBanned,
    withdrawalsEnabled: row.withdrawalsEnabled !== false,
  };
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

/** Validates JWT, reloads role/ban from DB (prevents stale-token privilege escalation). */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const dbUser = await loadDbUser(payload.userId);
    if (!dbUser) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (dbUser.isBanned) {
      res.status(403).json({ error: "Account suspended", code: "ACCOUNT_BANNED" });
      return;
    }

    req.user = { userId: payload.userId, username: dbUser.username, role: dbUser.role };
    req.dbUser = dbUser;
    next();
  } catch (err) {
    next(err);
  }
}

/** Admin routes — role revalidated from DB on every request. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const dbUser = await loadDbUser(payload.userId);
    if (!dbUser) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (dbUser.isBanned) {
      res.status(403).json({ error: "Account suspended", code: "ACCOUNT_BANNED" });
      return;
    }
    if (dbUser.role !== "admin" && dbUser.role !== "owner") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.user = { userId: payload.userId, username: dbUser.username, role: dbUser.role };
    req.dbUser = dbUser;
    next();
  } catch (err) {
    next(err);
  }
}

/** Platform owner only — role revalidated from DB on every request. */
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const dbUser = await loadDbUser(payload.userId);
    if (!dbUser) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (dbUser.isBanned) {
      res.status(403).json({ error: "Account suspended", code: "ACCOUNT_BANNED" });
      return;
    }
    if (dbUser.role !== "owner" && dbUser.username.toLowerCase() !== OWNER_USERNAME_LOWER) {
      res.status(403).json({ error: "Owner access required" });
      return;
    }
    req.user = { userId: payload.userId, username: dbUser.username, role: dbUser.role };
    req.dbUser = dbUser;
    next();
  } catch (err) {
    next(err);
  }
}

/** Creator dashboard / bank — creator account type or creator role only. */
export function requireCreator(req: Request, res: Response, next: NextFunction) {
  if (!req.dbUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const { accountType, role } = req.dbUser;
  if (accountType === "creator" || role === "creator" || role === "owner") {
    next();
    return;
  }
  res.status(403).json({ error: "Creator access required" });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  }
  next();
}
