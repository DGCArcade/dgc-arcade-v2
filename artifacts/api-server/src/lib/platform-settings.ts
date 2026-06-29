import { db, platformSettingsTable } from "@workspace/db";

// ── Default platform settings ──
// Owner-tunable knobs that drive the site behavior.
export const DEFAULT_SETTINGS = {
  // Fraud/Banking
  aiSensitivity: 75,
  autoApproveUnder: 10000,
  requireManualOver: 10000,
  minWithdrawal: 1,
  signupBonus: 100,
  
  // Feature Management (public visibility)
  slotsEnabled: true,
  raceEnabled: true,
  leaderboardEnabled: true,
  gamesEnabled: true,
  
  // Site Status
  maintenanceMode: false,
};

export type PlatformSettings = typeof DEFAULT_SETTINGS;

// Reads owner-configured settings from the DB, falling back to defaults for any
// key that has never been set. Always returns a complete settings object.
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettingsTable);
  const settings: any = { ...DEFAULT_SETTINGS };
  
  for (const row of rows) {
    if (row.key in settings) {
      const val = row.value;
      if (typeof DEFAULT_SETTINGS[row.key as keyof PlatformSettings] === "boolean") {
        settings[row.key] = val === "true";
      } else {
        const num = parseFloat(val);
        if (!isNaN(num)) settings[row.key] = num;
      }
    }
  }
  return settings as PlatformSettings;
}
