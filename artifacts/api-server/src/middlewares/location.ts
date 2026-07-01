import { Request, Response, NextFunction } from "express";
import { isOwnerUser } from "./auth.js";
import { verifyRequestGeo } from "../lib/geo-verify.js";

/**
 * Blocks betting/withdrawals unless the user's **current** server IP passes
 * jurisdiction + VPN/datacenter policy. Re-checks on every request — not
 * just the one-time DB flag from onboarding.
 */
export async function requireLocationVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (isOwnerUser(req.user)) {
    next();
    return;
  }

  try {
    const result = await verifyRequestGeo(req, req.user.userId);
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        code: result.code,
        locationVerified: false,
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Failed to verify location status" });
  }
}
