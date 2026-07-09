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

    // Try multiple possible endpoints for Slot and Betting Games API
    const endpoints = [
      `https://${RAPIDAPI_HOST}/slot-and-betting-games`,
      `https://${RAPIDAPI_HOST}/games`,
      `https://${RAPIDAPI_HOST}/list`,
    ];

    let rawGamesData = null;
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": RAPIDAPI_HOST,
          },
        });
        if (response.ok) {
          rawGamesData = await response.json();
          console.log(`Successfully fetched slots from ${url}`);
          break;
        } else {
          console.warn(`Endpoint ${url} returned ${response.status}`);
        }
      } catch (e) {
        console.error(`Failed to fetch from ${url}:`, e);
      }
    }

    if (!rawGamesData) {
      console.error("Failed to fetch slots from all RapidAPI endpoints");
      res.json(cachedCatalog || []);
      return;
    }

    // Transform RapidAPI response to our SlotGame interface
    // Note: The API might return an object with a games array or a direct array
    const rawGamesArray = Array.isArray(rawGamesData) 
      ? rawGamesData 
      : ((rawGamesData as any).games || (rawGamesData as any).data || []);

    const games: SlotGame[] = rawGamesArray.map((g: any) => ({
      id: g.id || g.gameId || g.slug || String(g.game_id || ""),
      title: g.title || g.name || g.gameName || g.game_name || "Unknown Game",
      provider: g.provider || g.gameProvider || "Inbet",
      thumbnail: g.thumbnail || g.image || g.imageUrl || g.image_url || "https://differentgrindcrew.com/placeholder-slot.png",
      rtp: g.rtp || 96.0,
      volatility: g.volatility || "medium",
      jackpot: g.jackpot
    })).filter((g: SlotGame) => g.id);

    cachedCatalog = games;
    lastFetchTime = now;

    res.json(games);
  } catch (error) {
    console.error("Error in slots catalog route:", error);
    res.json(cachedCatalog || []);
  }
});
