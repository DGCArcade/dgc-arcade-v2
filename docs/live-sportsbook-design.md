# Live Sportsbook Realtime Design

## Objective

The sportsbook will maintain one authoritative, strictly live snapshot in Neon and broadcast each fresh snapshot through Socket.IO. The server, not the browser, owns SportsGameOdds ingestion. This keeps the API key private, keeps upstream request volume independent of browser count, and provides a durable fallback when a browser reconnects or an upstream refresh fails.[1]

## Architecture

| Layer                 | Responsibility                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SportsGameOdds client | Request all configured leagues in a comma-separated `leagueID` filter with `live=true`, `oddsAvailable=true`, `limit=100`, and cursor pagination. Normalize only sportsbook markets already supported by the UI.                                                              |
| Strict live filter    | Retain an event only when `status.live === true`, `status.started === true`, it is not ended/finalized/cancelled, and `status.startsAt <= now`. This guards against future events and malformed provider states.                                                              |
| Realtime worker       | Run once at server startup and every 30 seconds afterward. Use an overlap guard and a Neon advisory lock so only one process performs the upstream synchronization at a time. Retry one time only for transient 5xx responses; respect rate limiting without retry storms.[1] |
| Neon cache            | Upsert a single `system_caches` row keyed by `sportsbook_live_odds`. Store the normalized fixture array in JSONB with `updated_at`, `source_updated_at`, `version`, and optional metadata.                                                                                    |
| HTTP API              | Serve the durable Neon snapshot from `/api/sportsbook/live-now`, including freshness metadata. If no snapshot exists yet, trigger no per-browser upstream fan-out; return an empty but valid response while the worker initializes.                                           |
| Socket.IO server      | Attach to the existing Node HTTP server, send the latest Neon snapshot to each newly connected client, and emit `sportsbook:odds:update` after successful cache commits. Use automatic client reconnection and graceful server shutdown.                                      |
| React client          | Fetch the initial snapshot over HTTP, subscribe to `sportsbook:odds:update`, reconcile selections against changed prices, display connection/freshness state, and cleanly disconnect on unmount. Keep a slow HTTP fallback refresh for recovery.                              |
| Bet-slip UX           | Keep the existing sticky desktop panel and present the same panel as a fixed, accessible mobile bottom sheet with a persistent `View Bet Slip (n)` trigger.                                                                                                                   |

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS system_caches (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT 'null'::jsonb,
  version integer NOT NULL DEFAULT 1,
  source_updated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
```

The row-level upsert is atomic. Socket.IO broadcasts only after the transaction succeeds, so a reconnecting client and a continuously connected client observe the same committed snapshot.

## Realtime Contract

| Event                    | Direction         | Payload                                                                 |
| ------------------------ | ----------------- | ----------------------------------------------------------------------- |
| `sportsbook:subscribe`   | Browser to server | No body; requests the latest committed snapshot.                        |
| `sportsbook:odds:update` | Server to browser | `{ fixtures, updatedAt, sourceUpdatedAt, version, stale }`              |
| `sportsbook:status`      | Server to browser | `{ connected, workerHealthy, lastSuccessAt }` for operational UI state. |

Payloads are normalized fixtures rather than raw SportsGameOdds objects. This avoids leaking upstream internals and keeps the existing React component contract stable.

## Operational Safety

Render accepts WebSocket connections on the same public service port, so no separate vendor account or secondary public port is required.[2] The client will reconnect after deployments and transient network interruption. The initial implementation assumes the current single API instance. If Render is later scaled horizontally, a shared Socket.IO pub/sub adapter should be added because instance-local broadcasts do not cross instances.[2]

The worker will retain the last successful Neon snapshot when SportsGameOdds is unavailable. Freshness metadata will mark old data as stale rather than replacing it with an empty result after an upstream error. An empty snapshot will be committed only after a successful provider response that genuinely contains no live events.

## Validation and Release Gate

No push will occur until the repository passes its TypeScript checks, targeted tests, and production builds. The final diff will be reviewed for secrets, generated artifacts, migration safety, and unintended changes before commit and push.

## References

[1]: https://sportsgameodds.com/docs/info/best-practices "SportsGameOdds Best Practices and Common Mistakes"
[2]: https://render.com/docs/websocket "Render WebSocket Documentation"
