import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { isOwnerUser } from "./auth.js";

/** Blocks betting/withdrawals unless the user passed server-verified location. */
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
    const [user] = await db
      .select({ locationVerified: usersTable.locationVerified })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId))
      .limit(1);

    if (!user?.locationVerified) {
      res.status(403).json({
        error: "Location verification required before playing or withdrawing.",
        code: "LOCATION_REQUIRED",
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Failed to verify location status" });
  }
}
