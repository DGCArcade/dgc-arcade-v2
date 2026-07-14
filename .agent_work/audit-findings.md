# DGC Arcade Repair Audit

## Scope constraints

- Leave the entire slot system untouched and in the background.
- Repair only the non-slot arcade/table games; the race game is the known working reference.
- Do not push until application TypeScript checks, tests, and production build verification are complete.
- Preserve the existing D logo and remove/avoid the “D Sports” wordmark in the sportsbook.

## Confirmed production routing failure

Production domain: `https://dgcarcade.com`

Direct HTTP probes on 2026-07-14 showed:

| Route | Status | Response |
|---|---:|---|
| `/` | 200 | Vite SPA HTML shell |
| `/admin` | 404 | `Not Found` |
| `/admin/owner` | 404 | `Not Found` |
| `/sportsbook` | 404 | `Not Found` |
| `/games` | 404 | `Not Found` |
| `/games/blackjack` | 404 | `Not Found` |
| `/race` | 404 | `Not Found` |

The frontend Render service currently runs `vite preview`. Client-side navigation can render Wouter routes, but a browser reload sends the slug to the production HTTP server, which does not fall back to `index.html`. A production SPA fallback is required in the frontend server path.

## Initial code findings

- `App.tsx` already declares `/admin`, `/admin/:tab`, `/sportsbook`, `/games`, `/games/:gameId`, and `/race`; the reload failure is outside the React route table.
- The owner check in `App.tsx` uses `process.env.REACT_APP_OWNER_USERNAME` in Vite client code, which is unsafe because `process` is not guaranteed in the browser and Vite exposes client variables through `import.meta.env`.
- The sportsbook UI currently places every selected leg as a separate single bet with the full entered amount, calculates total stake as `amount × selection count`, and permits contradictory same-event selections. This matches the user-reported behavior and requires correction.

## Official Render deployment findings

Sources consulted on 2026-07-14:

- Render Blueprint YAML Reference: https://render.com/docs/blueprint-spec
- Render Static Site Redirects and Rewrites: https://render.com/docs/redirects-rewrites

Relevant supported behavior:

- Blueprint environment variables can reference another web service via `fromService`; supported private-network properties include `host`, `port`, and `hostport` (example format: `my-service:10000`).
- Render’s static-site rewrite rules support `source: /*` to `destination: /index.html` for client-side routing.
- The current DGC frontend is a Node web service, not a Render static site, so the robust fix is a small production server that serves built assets, falls back non-API GET/HEAD requests to `index.html`, and proxies `/api/*` to the API service over the Render private network. This preserves all existing relative `/api` calls and avoids cross-origin issues.
