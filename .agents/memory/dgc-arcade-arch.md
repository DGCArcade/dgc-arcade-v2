---
name: DGC Arcade Architecture
description: Key decisions, slug names, multi-step routes, theme system, and patterns for the DGC Arcade gambling platform
---

# DGC Arcade — Architecture Notes

## Game Slugs in DB
Exact slugs (case-sensitive): `coin-flip`, `dice`, `crash`, `slots` (name: Lucky Slots), `roulette`, `mines`, `blackjack`, `plinko`, `hilo`, `keno`
**Why:** The game card cover map must include both "coinflip"/"coin-flip" and "hilo"/"hi-lo" variants to handle DB slug vs. frontend conventions.

## Multi-Step Game Routes
- Blackjack: POST /api/blackjack/deal → POST /api/blackjack/action (hit/stand/double) → GET /api/blackjack/current
- Mines: POST /api/mines/start → POST /api/mines/reveal → POST /api/mines/cashout → GET /api/mines/current
- Daily Bonus: GET /api/daily-bonus/status → POST /api/daily-bonus/claim
These use direct fetch with JWT from localStorage (not OpenAPI codegen hooks) matching the admin.tsx pattern.

## Theme System
- 5 themes: dgc (default, gold), cyber (green), futuristic (purple), blood (red), ocean (teal)
- CSS custom properties on `:root`/`.theme-<id>`, applied via `document.documentElement.classList`
- `initTheme()` called in main.tsx before render
- Theme switcher: `src/components/ui/theme-switcher.tsx`
- Theme lib: `src/lib/theme.ts`

## Auth Pattern
JWT stored in `localStorage` as `dgc_token`. All new game components use `requireAuth()` from `useAuth()` hook before placing bets.

## Wallet Modal
- Duel-style, opened from navbar balance button
- Tabs: Deposit (currency selector + QR + OxaPay), Withdraw, Buy Crypto, Tip
- Component: `src/components/wallet/wallet-modal.tsx`

## Live Feed Tabs
- All Bets, My Bets, High Rollers (/api/bets/high-rollers), Race (leaderboard)
- Component: `src/components/home/live-feed.tsx`

## DB Tables Added
`blackjack_hands`, `mines_sessions`, `daily_bonus_claims` — pushed via `pnpm --filter @workspace/db run push`

## Pre-existing TS Errors
The api-client-react generated hooks have different export names than what the original code imports (e.g. `useListGames` vs `useGetGames`). These are pre-existing and don't block runtime. Don't fix unless explicitly requested.
