import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (payload.role !== "admin" && payload.role !== "owner") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  req.user = payload;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  }
  next();
}
