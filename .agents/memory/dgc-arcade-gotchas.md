---
name: DGC Arcade gotchas
description: Non-obvious sharp edges — pre-existing typecheck failure, two-database split, payment gateway truth.
---

# DGC Arcade gotchas

## `pnpm run typecheck` has a PRE-EXISTING failure in `@workspace/scripts`
`scripts/src/create-admin.ts` imports `drizzle-orm`, but `scripts/package.json`
only declares `@workspace/db` + `bcryptjs` — so typecheck fails with
`TS2307: Cannot find module 'drizzle-orm'`.
**Why:** the dep was never declared on the `scripts` package.
**How to apply:** This failure is unrelated to app code (api-server, dgc-arcade,
libs all pass). Don't assume your change broke the build when you see only this
error. Fixing it means adding `drizzle-orm` to `scripts/package.json` — but the
user has a HARD CONSTRAINT against dependency changes without approval, so ask first.

## Two separate databases (dev vs prod) — easy to confuse
Dev on Replit uses Replit's built-in Postgres (`heliumdb`). Production on Render
uses an external **Neon** database (set via `DATABASE_URL` in Render, `sync:false`).
They share NO data. `lib/db` switches SSL on when `NODE_ENV=production` (Neon needs it).
**How to apply:** Test data created on Replit never appears on the live site, and
vice-versa. Never assume the Replit DB reflects production.

## Payment gateway is Plisio (OxaPay is dead/legacy)
Live code uses **Plisio** (`PLISIO_SECRET_KEY`, `https://api.plisio.net/api/v1`,
IPN callback at `/api/transactions/deposit/callback` with an IP allowlist).
Any lingering "OxaPay" string is stale leftover, not a second integration.

## Trust root `pnpm run typecheck` — isolated `--filter` checks give FALSE errors
Running `pnpm --filter @workspace/dgc-arcade run typecheck` alone (without rebuilding
the composite libs first) reports bogus `TS2307: Cannot find module
'@workspace/api-client-react/src/generated/...'` plus cascading app-type errors
(e.g. `refreshUser`/`openLogin` missing). Those modules/types DO exist.
**Why:** the leaf app resolves deep imports against the libs' built declarations; if
`typecheck:libs` (`tsc --build`) hasn't run since a lib changed (e.g. after Orval
codegen), the leaf check sees stale/missing lib output. The root `pnpm run typecheck`
builds libs first, so it's the source of truth.
**How to apply:** after any `lib/*` change (codegen included), run the ROOT
`pnpm run typecheck`. Don't trust a standalone `--filter` leaf check or LSP. Also note
`.tsbuildinfo` caching can MASK real errors (even a duplicate-import syntax error) until
the cache is invalidated — `find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete`
before a check when you need ground truth.

## DON'T run Orval codegen to propagate a small schema change — it desyncs the whole contract
The committed generated code (`lib/api-zod`, `lib/api-client-react`) is STALE vs the current
Orval config. Committed output is a single `api.ts` using `...Body`/`...QueryParams` suffixes;
a fresh `pnpm --filter @workspace/api-spec run codegen` instead emits split per-type files using
`...Input`/`...Params` suffixes (e.g. `BetBody`→`BetInput`, `OxapayCallbackBody`→`PlisioCallbackInput`).
Consumers (`api-server` routes, frontend) import the OLD names, so a fresh codegen silently renames
the exports and breaks every consumer.
**Why:** the repo was committed with generated code from an older Orval config and never resynced;
api-server/frontend were written against that stale output, not the current spec.
**How to apply:** to rename ONE schema, hand-edit `openapi.yaml` AND the committed generated files
(restore prior generated files from git if a codegen already ran), then text-replace the name.
Do NOT run a full codegen unless you will also update every consumer. Always reproduce the deploy
build afterwards.

## Render builds DON'T typecheck — reproduce the real build, never trust `tsc` for deploy safety
Render backend = `pnpm --filter @workspace/api-server run build` (esbuild, bundles from `src`, no tsc).
Render frontend = `pnpm --filter @workspace/dgc-arcade run build` (`vite build`, no tsc). So `tsc`
errors NEVER block deploy, but esbuild DOES fail on an unresolved/renamed import
("No matching export ... for import X"). The repo carries many pre-existing `tsc` errors that are
real runtime bugs (e.g. a route using `sql` without importing it) yet deploy fine because builds
skip typechecking.
**Why:** typecheck checks api-server against api-zod's BUILT `.d.ts`; esbuild bundles from `src`,
so stale `dist`/`.tsbuildinfo` can make `tsc` pass while esbuild fails (this exact mismatch caused
a Render build failure that local typecheck missed).
**How to apply:** before any push/deploy, run BOTH deploy build commands above to truly verify.
Use `tsc` only to HUNT pre-existing bugs, not to gate the deploy.

## Deploy flow: push to GitHub = instant live deploy
`render.yaml` has `autoDeploy: true` on both services. Pushing to GitHub `main`
(`DGC4/dgc-arcade-v2`) auto-rebuilds and redeploys production on Render.
**How to apply:** Treat any `git push origin main` as a production deploy.
