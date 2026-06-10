import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
export const usersRouter = Router();

// POST /api/users/geo — save location data for logged-in user
usersRouter.post("/geo", requireAuth, async (req, res) => {
  const { country, countryCode, region, city, ip, hostname, asn, isp, lat, lon, timezone } = req.body;
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
      })
      .where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Save geo error");
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
