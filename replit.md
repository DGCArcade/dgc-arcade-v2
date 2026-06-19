# DGC Arcade

A full-stack crypto gambling arcade platform for Different Grind Crew — featuring slots, blackjack, mines, crash, roulette, dice, plinko, hi-lo, keno, and coin flip, with a live bet feed, tournaments, referrals, daily bonuses, and a wallet system backed by Plisio crypto payments.

## Run & Operate

- `pnpm --filter @workspace/dgc-arcade run dev` — frontend dev server (port 5000)
- `pnpm --filter @workspace/api-server run dev` — backend API (port 3000)
- `pnpm run typecheck` — full typecheck across all packages (root only — see Gotchas)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec (see Gotchas before running)
- `pnpm --filter @workspace/db run push` — push DB schema changes to **dev** DB only
- `bash scripts/push-to-github.sh` — push current commits to GitHub (DGC4/dgc-arcade-v2)

## Stack

- pnpm workspaces, Node.js 20/24, TypeScript 5.9
- **Frontend:** React 19 + Vite 7, Wouter, Tailwind CSS 4, TanStack Query, Zustand, Radix UI, Framer Motion, PIXI.js (slot engine)
- **Backend:** Express 5, Pino logging, JWT auth, bcryptjs
- **DB:** PostgreSQL + Drizzle ORM (`numeric(18,8)` for all money columns)
- **Payments:** Plisio (crypto deposits + withdrawals)
- **API codegen:** Orval (from OpenAPI spec — see Gotchas before running)
- **Build:** Vite (frontend), esbuild (backend CJS bundle)

## Where things live

- `artifacts/dgc-arcade/` — React frontend
- `artifacts/api-server/` — Express backend
- `artifacts/slot-engine/` — PIXI.js slot machine engine
- `lib/db/src/schema/` — **source of truth** for DB schema (off-limits without approval)
- `lib/api-spec/openapi.yaml` — **source of truth** for API contract
- `lib/api-zod/` — generated Zod schemas (committed, do not regenerate without reading Gotchas)
- `lib/api-client-react/` — generated TanStack Query hooks (committed, same warning)
- `scripts/push-to-github.sh` — push to GitHub using GITHUB_TOKEN secret

## Architecture decisions

- **Two databases:** Dev uses Replit's built-in Postgres; prod uses external Neon (SSL required). Never confuse them — data doesn't cross.
- **Committed generated code:** `lib/api-zod` and `lib/api-client-react` are stale vs current Orval config. DO NOT run full codegen — it renames exports and breaks all consumers. Hand-edit generated files for small changes.
- **Money columns:** All balance/wager/deposit columns are `numeric(18,8)`. Never cast to text in SQL. Use `sql\`balance + ${x}\`` not `CAST(...AS TEXT)`.
- **Idempotency gate:** All money state transitions (deposit credit, withdrawal refund) use a guarded status flip inside a DB transaction to prevent double-apply on retries.
- **Push = deploy on Render:** `autoDeploy: true` in render.yaml — pushing to GitHub `main` triggers a live Render redeploy.

## Product

Games: slots, blackjack, mines, crash, roulette, dice, plinko, hi-lo, keno, coin flip. Platform features: user auth (JWT), crypto wallet (Plisio), referral system, daily bonus, tournaments, live bet feed (all/my/high-rollers/race), admin panel, fraud review queue, creator bank, 5 visual themes.

## User preferences

**HARD CONSTRAINTS — do not violate without explicit per-change approval:**
- **Database (Neon PostgreSQL):** external, managed separately. Do NOT modify schema, run migrations, or touch connection strings.
- **Backend (Render):** Do NOT modify Render config, environment variables, or deployment settings.
- **Dependencies:** Do NOT run `pnpm install` or change any package versions without asking first. There are intentional dependency overrides in place for security reasons.
- **Off-limits files:** `package.json` pnpm overrides, `pnpm-lock.yaml`, anything in `lib/db/src/schema/`, and any `.env` files. Do not edit these without explicit approval.

## Gotchas

- `pnpm run typecheck` has a **pre-existing failure** in `@workspace/scripts` (missing `drizzle-orm` dep) — unrelated to app code, don't fix without approval.
- Run `pnpm run typecheck` from **root only** — isolated `--filter` leaf checks give false errors until libs are rebuilt.
- **Do NOT run full Orval codegen** — it renames exports (`...Body`→`...Input`) and breaks every consumer. Hand-edit generated files instead.
- **Push to GitHub = instant live Render deploy.** Always verify locally before running `bash scripts/push-to-github.sh`.
- **Drizzle double `.where()` bug:** never chain `.where().where()` on UPDATE/DELETE — only the last one applies. Always use `and(...)`.
- **Plisio withdraw:** must use GET (not POST), param is `currency` (not `psys_cid`), use `source_amount`+`source_currency=USD`.
- **Plisio IPN verify_hash:** HMAC-SHA1 of PHP `serialize(ksort(POST))` — not a query string hash.

## Pointers

- See memory files in `.agents/memory/` for deep gotchas on money safety, Plisio, and DB patterns.
