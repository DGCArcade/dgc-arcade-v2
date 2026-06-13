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

## Plisio WITHDRAW (payout) API: GET-only, param is `currency`, supports `source_amount`=USD
The owner-approve payout (`PATCH /api/admin/transactions/:id` → `operations/withdraw`) must use
**GET** — POST returns a 404 HTML page, which broke `JSON.parse` and surfaced as an opaque
"Internal Server Error". The crypto goes in the **`currency`** query param (NOT `psys_cid`), exactly
like the working deposit/invoice call. Plisio accepts `source_amount` + `source_currency=USD` and
converts USD→crypto, so we don't pre-convert. The payout psys_cid map MUST match the proven DEPOSIT
map (`USDT_TRX`/`USDT_TON`, never `USDT_TRC20`) or funds can go to the wrong network.
**Why:** Plisio's withdraw endpoint behaves differently from its invoice endpoint (method + wrong-network
mapping are easy to get wrong), and BOTH the owner withdrawal-approve and the AI-fraud-monitor approve
hit this one endpoint — so any bug here breaks both at once.
**How to apply:** can't be e2e-tested in dev (no key; a success moves real money) — confirm with a single
tiny real withdrawal after deploy + secret rotation. Probe-safe checks: GET route = 401 (valid), POST = 404.

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

## The main agent CANNOT run `git commit`/`git push` — the sandbox blocks them
Destructive git (incl. `git commit`, force-push, reset, rebase) errors in the main
agent with "Destructive git operations are not allowed in the main agent." The
platform auto-commits the working tree at task end, so to actually deploy you must
push to GitHub via a **background Project Task** (it has the protections to run git).
**Why:** main agent is sandboxed; only Project-Task agents can perform git writes.
**How to apply:** when the user wants changes pushed to GitHub, finish + verify the
work (it auto-commits to local `main`), then create & propose a Project Task whose
sole job is `git push origin main`. Don't waste a turn trying to commit/push yourself.

## drizzle UPDATE/DELETE: a second chained `.where()` SILENTLY OVERWRITES the first (NOT an AND)
In drizzle-orm pg-core, `.update(t).set(...).where(a).where(b)` keeps ONLY `b`; the first
condition is discarded silently (no runtime error, no reliable type guard). The intended atomic
"update row WHERE id = X AND balance >= amount" must be ONE call:
`.where(and(eq(t.id, x), sql\`CAST(balance AS NUMERIC) >= ${amount}\`))`.
The buggy `.where(eq(id)).where(sql\`balance>=amt\`)` dropped the id filter, so the UPDATE
matched EVERY row with sufficient balance — a mass balance-deduct across all users.
**Why:** real bug found in `bets.ts` (place bet) and `mines.ts` (start) deduct paths; the same
pattern in `transactions.ts` withdrawal was masked only because it ALSO forgot to import `sql`
and threw before the overwrite mattered.
**How to apply:** never chain `.where()` twice on an UPDATE/DELETE — always combine with
`and(...)`. If you find a shipped double-`.where()` on a mutation, AUDIT the affected table:
it may have changed far more rows than intended.

## Auditing the Neon PRODUCTION DB (read-only) from this repl
The `code_execution` sandbox has `process.env` stripped (it's `undefined`), so it CANNOT read
secrets. To query prod, run a Node `.mjs` via the `bash` tool (env vars ARE available there).
Pattern: read `process.env.PROD_DATABASE_URL` (a user-provided secret — NOT the dev `DATABASE_URL`,
which points at the Replit Helium DB), connect with `pg` resolved via
`createRequire('/home/runner/workspace/lib/db/index.js')`, and force read-only:
`SET default_transaction_read_only = on; BEGIN; SET TRANSACTION READ ONLY; …; ROLLBACK`.
Neon needs `ssl: { rejectUnauthorized: false }`. Never print the connection string.
**Why:** prod is external Neon, off-limits for writes; this is the only safe way to inspect it.

## All money columns are `numeric(18,8)` in BOTH dev and prod — never assign a text-cast expression
`users.balance`, `total_won`, `total_wagered_amount`, `total_deposited`, `wager_requirement`,
`promo_balance` are all `numeric` (confirmed in dev Helium AND prod Neon). The shipped pattern
`set({ balance: sql\`CAST((CAST(balance AS NUMERIC) - ${x}) AS TEXT)\` })` assigns TEXT to a numeric
column → Postgres throws `column "balance" is of type numeric but expression is of type text` and
500s EVERY balance mutation (withdrawals AND all games: bets/mines/blackjack deduct+payout).
**Why:** columns were migrated text→numeric but the SQL still cast results back to text; deposits/
tips/refunds escaped because they bind `String(x)` params (unknown type, Postgres coerces) instead
of casting. The 500 only surfaced loudly on withdrawals because that's what got tested.
**How to apply:** for numeric columns write `sql\`balance - ${x}\`` / `sql\`coalesce(total_won,0) + ${x}\``
(no CAST). Bound params like `String(x)` also work. Verify any money UPDATE with a rolled-back
`BEGIN; UPDATE ...; ROLLBACK;` against the real column type before trusting it.

## Money-state transitions must gate the balance change behind a GUARDED status flip inside a DB transaction
Atomic increments (`sql`balance + ${x}``) fix read-modify-write races but, ALONE, DOUBLE-APPLY when an
event can fire twice (duplicate/retried Plisio deposit webhook; double-clicked admin approve/reject).
Correct pattern for deposit-credit and withdrawal-refund: inside `db.transaction(...)` run a guarded
`UPDATE transactions SET status=<next> WHERE id=? AND status<>'<next>' RETURNING id`; credit/refund the
user ONLY if it returns a row. Concurrent duplicates block on the row lock, then match 0 rows and skip.
**Why:** the deposit callback + admin reject/refund were first converted to bare atomic increments without
an idempotency gate — that turned a "accidentally clobber to one credit" bug into a "double-credit real
money" bug under duplicate webhooks. Verified e2e: two identical deposit callbacks now credit exactly once.
**How to apply:** any handler that moves real money on a state change (pending→completed/failed) must make
the status transition ITSELF the idempotency key, in the SAME transaction as the balance mutation.
The admin APPROVE→Plisio payout path adds outcome classification on top of this: a guarded
`pending→processing` claim BEFORE the call, then the result is classified by CERTAINTY and NEVER
auto-reverted — an AMBIGUOUS outcome (network error, timeout, non-JSON, or an error carrying an operation
id) goes to `needs_review` (payout MAY have been sent — never auto-retry); only an AUTHORITATIVE rejection
with NO operation id reverts to `pending`; success is guarded on the claimed state. Guard EVERY post-claim
write on the claimed status so a concurrent resolution can't be clobbered.

## Ambiguous payouts: human-gated reconcile, never auto-refund money that MAY have been sent
Ambiguous withdrawals are resolved through a reconcile flow (a queue of `needs_review` rows plus `processing`
rows stuck past a stale cutoff, with resolutions to mark-sent / cancel+refund / requeue), not silent auto-retry.
**Why:** a payout outcome is often genuinely unknown; auto-refunding or auto-retrying real money on an unknown
outcome causes double-pay or loss — so cancel+refund and requeue MUST be human-gated (owner verifies in the
Plisio dashboard first).
**How to apply:** the local payout fetch is timeout-bounded FAR below the stale-`processing` reconcile cutoff,
so `processing` is transient and a row stuck past the cutoff can only be a crashed handler (no live fetch can
overwrite a reconciliation). Never raise the fetch bound toward the cutoff. The residual "Plisio settles
server-side after our client aborts" gap is now closed: before cancel+refund or requeue we look the operation
up by its retained id and HARD-STOP (409) if Plisio reports it `completed` (sent) or still pending/unknown;
only a confirmed failure / missing reference / unreachable Plisio is inconclusive and falls through to the
owner's dashboard judgement. The check only ADDS restrictions — never loosen it. The retained operation id is
stored in the EXISTING payout-reference column (txHash) on the needs_review path — no schema change.

## Plisio IPN verify_hash = hmac_sha1(PHP serialize(ksort(POST minus verify_hash)), secret) — NOT a query string
Making the HMAC mandatory with the WRONG algorithm silently rejects every genuine callback (breaks ALL
deposits) once the key is set — strictly worse than no check. Plisio signs PHP `serialize()` of the ksorted
POST array (`a:N:{s:<utf8_bytelen>:"k";s:<utf8_bytelen>:"v";...}`), values coerced to strings, `tx_urls`
html-entity-decoded, compared constant-time. A `k=v&...` query-string hash never matches.
**Why:** the IPN body is form-urlencoded, so PHP `$_POST` values are all strings — use UTF-8 BYTE length, not
JS `.length`. Mandatory only when the secret is set; dev (no key) skips with a warning.
**How to apply:** CANNOT be e2e-tested in dev (no key; the IP allowlist 403s localhost before the HMAC runs).
Verify with byte-exact unit vectors, then ONE real Plisio deposit callback after deploy + secret config
before trusting it. To make that first real callback conclusive, the mismatch path logs secret-free
diagnostics (sorted field names, serialized byte-length + bounded preview, the attacker-supplied receivedHash).
NEVER log the full server-computed `expectedHash`: for the attacker-controllable callback body it IS a valid
`verify_hash`, so full-value logging turns logs into a signing/replay oracle — log only a short prefix.
