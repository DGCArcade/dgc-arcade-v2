import { Request, Response, NextFunction } from "express";
import { isOwnerUser } from "./auth.js";
import { verifyOwnerStepUpToken } from "../services/owner-stepup.js";

/**
 * Extra step-up for fanodgc owner tools (AI, bank settings) — login stays open everywhere.
 * Pass token via header: X-Owner-Step-Up: <jwt from /api/auth/owner/stepup/verify>
 */
export function requireOwnerStepUp(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isOwnerUser(req.user)) {
    res.status(403).json({ error: "Owner access required" });
    return;
  }

  if (process.env.OWNER_STEPUP_DISABLED === "true") {
    next();
    return;
  }

  const token =
    req.headers["x-owner-step-up"]?.toString() ||
    req.headers["x-owner-stepup"]?.toString();

  if (token && verifyOwnerStepUpToken(token, req.user.userId)) {
    next();
    return;
  }

  res.status(403).json({
    error: "Owner profile verification required. Confirm via email code.",
    code: "OWNER_STEPUP_REQUIRED",
  });
}
