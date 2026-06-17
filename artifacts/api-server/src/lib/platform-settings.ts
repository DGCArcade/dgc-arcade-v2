import { db, platformSettingsTable } from "@workspace/db";

// ── Default platform settings ──
// Owner-tunable knobs that drive the withdrawal fraud engine.
//  - aiSensitivity:     0-100, scales raw fraud scores by 0.5x-1.5x (higher = more flags)
//  - autoApproveUnder:  withdrawals at or under this $ amount (and not fraud-blocked)
//                       are instantly processed via Plisio without admin approval.
//                       Hard ceiling is $10,000 — the code will never auto-approve above that
//                       regardless of what this setting is set to.
//  - requireManualOver: withdrawals at or over this $ amount are ALWAYS flagged for
//                       manual owner review, regardless of risk score.
//                       Set to 10000 to match the instant-withdrawal ceiling.
//  - minWithdrawal:     minimum withdrawal amount in USD
export const DEFAULT_SETTINGS = {
  aiSensitivity: 75,
  autoApproveUnder: 10000,
  requireManualOver: 10000,
  minWithdrawal: 1,
  signupBonus: 0,
};

export type PlatformSettings = typeof DEFAULT_SETTINGS;

// Reads owner-configured settings from the DB, falling back to defaults for any
// key that has never been set. Always returns a complete settings object.
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettingsTable);
  const settings: Record<string, number> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in settings) {
      const num = parseFloat(row.value);
      if (!isNaN(num)) settings[row.key as keyof PlatformSettings] = num;
    }
  }
  return settings as PlatformSettings;
}
