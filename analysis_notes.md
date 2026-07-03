# DGC Arcade Analysis Notes

## Persistence Issue (Owner Settings)
- **Symptoms**: UI toggles (maintenance mode, games) reset to default on page reload, though the changes take effect on the site.
- **Backend**: `adminRouter.put("/bank/settings")` in `admin.ts` handles updates by inserting/updating `platform_settings` table.
- **Frontend**: `admin.tsx` has a `bankSettings` state initialized with hardcoded defaults.
- **Hypothesis**: The frontend state might not be correctly synced with the backend data on reload, or the `useEffect` that fetches settings is missing or flawed.

## Commission Rate Logic
- **Symptoms**: Creators always see a "300% commission rate" on their profiles.
- **Requirements**: 
    - Regular users: Should have a default rate (check referral tier list).
    - Specialty creators: Rate should be set during creation and accumulate to their dashboard.
- **Current Logic**: `creator.ts` uses `getReferralTier(activeCount)` and overrides with `users.commissionRate` if present.
- **Suspicion**: The "300%" might be a hardcoded UI value or a decimal conversion error (e.g., 3.0 vs 0.03).

## Creator Hub Data
- **Symptoms**: Hub shows "register players, payment methods, and casino games" but user wants real-time data.
- **Requirements**: Show actual count of registered players, active payment methods (Plisio coins), and live casino games.
- **Current Logic**: `creator.ts` dashboard endpoint fetches referral counts but might not be providing the full set of requested stats.

## Deployment
- **Target**: Push to a new branch continuing from #56.

## Implemented Fixes

### 1. Owner Settings Persistence
- **Frontend**: Modified `admin.tsx` to trigger `loadBankSettings()` when the "Owner Settings" tab becomes active. This ensures the UI always reflects the current database state on tab switch or reload.
- **Backend**: Updated `adminRouter.put("/bank/settings")` in `admin.ts` to call `invalidatePlatformSettingsCache()` before returning. This prevents the API from returning stale cached settings immediately after an update.

### 2. Specialty Creator Commission Logic
- **Creation**: Updated `adminRouter.post("/create-specialty-creator")` to persist `commissionRate` (as a decimal string) and `displayName` in the `users` table.
- **Admin Listing**: Updated `adminRouter.get("/creators")` to respect the `commissionRate` stored in the `users` table, falling back to tier-based rates for regular affiliates. It also correctly labels specialty partners.
- **Creator Dashboard**: The dashboard was already partially set up to use `commissionRate`, but now it will receive the correctly persisted values.

### 3. Creator Hub Real-Time Data
- **Backend**: Updated `/api/creator/dashboard` to include `totalPlatformPlayers`, `totalPlatformGames`, and `totalPaymentMethods` (currently 10 based on Plisio support).
- **Frontend**: Updated `creator.tsx` to use these real-time values in the Overview section, with a fallback to the previous hardcoded values if data is missing.
