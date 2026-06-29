# AGENTS.md

DGC Arcade — full-stack crypto casino (pnpm monorepo). Standard commands and
architecture live in `replit.md`; read it first. This file adds notes for agents
working in the Cursor Cloud environment.

## Cursor Cloud specific instructions

### Services & ports (run both for end-to-end)
- **API** `@workspace/api-server` on **port 3000** — `DATABASE_URL JWT_SECRET PORT=3000 NODE_ENV=development pnpm --filter @workspace/api-server run dev`
- **Frontend** `@workspace/dgc-arcade` on **port 5000** — `PORT=5000 pnpm --filter @workspace/dgc-arcade run dev`
- The frontend dev server proxies `/api` → `http://localhost:3000`, so the API must be on 3000.

### Local database (required)
- A local **PostgreSQL** is used in dev (no Neon). Connection string used here:
  `postgresql://postgres:postgres@localhost:5432/dgcarcade`.
- Start it if it isn't running: `sudo pg_ctlcluster 16 main start`.
- Keep `NODE_ENV` unset/`development` locally — `NODE_ENV=production` forces DB SSL and will fail against local Postgres.
- Schema: `DATABASE_URL=... pnpm --filter @workspace/db run push` (drizzle-kit). The API also runs idempotent table migrations on startup.

### Non-obvious gotchas
- **Backend is NOT hot-reload.** `api-server`'s `dev` = build + start. After changing backend code you must restart the API process.
- **Rate limiter is in-memory.** If you hit `429 Too many attempts`, restarting the API clears it.
- **Games catalog auto-seeds when empty.** `ensureCoreGamesSeeded()` (in `routes/games.ts`, called from `app.ts`) inserts the core table games only when the `games` table has zero rows — it never overwrites/resurrects admin-managed games.
- **Slots are hidden publicly by default.** `slotsEnabled` defaults to `false` (`lib/platform-settings.ts` + `use-platform-settings.ts`); the slot engine/themes/admin management stay in the backend and an owner can re-enable via the admin "Slots Section" toggle.
- **Geolocation gate.** `components/ui/location-gate.tsx` allows the entire US and denies the listed blocked countries; there is intentionally **no dev/location bypass**. The decision is cached in `sessionStorage` (`dgc_geo_session_v2`) — if a browser session is stuck on a blocked screen, clear that key to re-test.
- **Email verification has no SMTP locally.** The code is written to `users.email_verification_code`; read it from the DB when testing verify flows.

### Lint / typecheck / test
- "Lint" is Prettier only: `pnpm exec prettier --check .` (the repo currently has many pre-existing style warnings).
- Run typecheck from the **repo root**: `pnpm run typecheck` (isolated `--filter` leaf checks emit false `TS6305` until libs are built). There is a known pre-existing typecheck failure in `@workspace/scripts`.
- Tests: `pnpm test` (vitest).
