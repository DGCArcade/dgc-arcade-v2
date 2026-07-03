import { db, platformSettingsTable } from "@workspace/db";

export const DEFAULT_SETTINGS = {
  aiSensitivity: 75,
  autoApproveUnder: 10000,
  requireManualOver: 10000,
  minWithdrawal: 1,
  signupBonus: 100,

  slotsEnabled: false,
  raceEnabled: true,
  leaderboardEnabled: true,
  gamesEnabled: true,

  maintenanceMode: false,

  // Per-game slugs disabled by owner (stored as JSON array in DB)
  disabledGameSlugs: [] as string[],

  // Site-wide custom 404 page
  custom404Enabled: false,
  custom404Title: "Page Not Found",
  custom404Message: "The page you're looking for doesn't exist or has been moved.",
  custom404ButtonText: "Back to Home",
  custom404ButtonUrl: "/",
};

export type PlatformSettings = typeof DEFAULT_SETTINGS;

const STRING_KEYS = new Set([
  "custom404Title",
  "custom404Message",
  "custom404ButtonText",
  "custom404ButtonUrl",
]);

const JSON_ARRAY_KEYS = new Set(["disabledGameSlugs"]);

import { cached, invalidateCache } from "./response-cache.js";

const SETTINGS_CACHE_MS = 30_000;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return cached("platform-settings", SETTINGS_CACHE_MS, async () => {
  const rows = await db.select().from(platformSettingsTable);
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    const val = row.value;
    const defaultVal = DEFAULT_SETTINGS[row.key as keyof PlatformSettings];

    if (typeof defaultVal === "boolean") {
      settings[row.key] = val === "true";
    } else if (JSON_ARRAY_KEYS.has(row.key)) {
      try {
        settings[row.key] = JSON.parse(val);
      } catch {
        settings[row.key] = [];
      }
    } else if (STRING_KEYS.has(row.key)) {
      settings[row.key] = val;
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) settings[row.key] = num;
    }
  }
  return settings as PlatformSettings;
  });
}

export function invalidatePlatformSettingsCache() {
  invalidateCache("platform-settings");
}

export function isGameSlugEnabled(settings: PlatformSettings, slug: string): boolean {
  return !settings.disabledGameSlugs.includes(slug);
}
