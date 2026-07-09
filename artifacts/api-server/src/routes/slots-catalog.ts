import { Router } from "express";

export const slotsCatalogRouter = Router();

/**
 * Dynamic Slots Catalog via RapidAPI
 */

interface SlotGame {
  id: string;
  title: string;
  provider: string;
  thumbnail: string;
  rtp: number;
  volatility: "low" | "medium" | "high";
  jackpot?: number;
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_SLOT_HOST || "slot-and-betting-games.p.rapidapi.com";

let cachedCatalog: SlotGame[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

/**
 * GET /api/slots/catalog
 *
 * Fetches the real-time game list from the RapidAPI provider.
 */
slotsCatalogRouter.get("/catalog", async (_req, res) => {
  try {
    const now = Date.now();
    if (cachedCatalog && (now - lastFetchTime < CACHE_DURATION)) {
      res.json(cachedCatalog);
      return;
    }

    const response = await fetch(`https://${RAPIDAPI_HOST}/slot-and-betting-games`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch slots from RapidAPI:", response.status);
      // Fallback to empty if first load fails
      res.json(cachedCatalog || []);
      return;
    }

    const rawGames = await response.json();
    
    // Transform RapidAPI response to our SlotGame interface
    // Note: Adjust mapping based on actual API response structure
    const games: SlotGame[] = Array.isArray(rawGames) ? rawGames.map((g: any) => ({
      id: g.id || g.gameId || g.slug,
      title: g.title || g.name || g.gameName,
      provider: g.provider || "Inbet",
      thumbnail: g.thumbnail || g.image || g.imageUrl || "https://differentgrindcrew.com/placeholder-slot.png",
      rtp: g.rtp || 96.0,
      volatility: g.volatility || "medium",
      jackpot: g.jackpot
    })) : [];

    cachedCatalog = games;
    lastFetchTime = now;

    res.json(games);
  } catch (error) {
    console.error("Error in slots catalog route:", error);
    res.json(cachedCatalog || []);
  }
});
