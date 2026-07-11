# Live Sportsbook Realtime Research

## Verified findings

SportsGameOdds provides two relevant integration models. Its REST events endpoint supports event retrieval and the current repository already uses the documented `status.live` boolean for live-event filtering. SportsGameOdds also offers a beta realtime streaming API using the Pusher protocol. Access to that upstream stream is restricted to Allstar and custom plans. The upstream streaming connection first returns credentials, URL/channel information, and an initial snapshot from `/v2/stream/events`; subsequent update messages identify changed `eventID` values, after which clients fetch full event details from `/v2/events`. Because plan access is not guaranteed and the user's attachment explicitly requests a 30-second sync, the production-safe baseline is to poll SportsGameOdds from the server every 30 seconds and broadcast normalized snapshots to the site's browsers.

Render web services support inbound WebSocket connections on the same public service port without additional platform configuration. Public clients must use secure WebSockets (`wss`). Render does not impose a fixed maximum connection duration, but deploys, instance replacements, maintenance, and network interruptions can disconnect clients. Production clients therefore need automatic reconnection, while the server needs heartbeat/keepalive handling and graceful shutdown on `SIGTERM`. Render assigns connections to service instances independently; if the API is horizontally scaled, instance-local broadcasts do not reach clients on other instances unless a shared pub/sub adapter is added. The current deployment can use one API instance plus Neon as durable snapshot storage; future horizontal scaling should add a shared Socket.IO adapter such as Redis.

Socket.IO is appropriate for this repository because it supplies automatic reconnection and transport fallback while integrating with the existing Node HTTP server. No separate Socket.IO account or vendor subscription is required.

## Sources

1. SportsGameOdds API documentation: https://sportsgameodds.com/docs
2. SportsGameOdds realtime streaming guide: https://sportsgameodds.com/docs/guides/realtime-streaming-api
3. Render WebSocket documentation: https://render.com/docs/websocket
4. Render realtime WebSocket architecture article: https://render.com/articles/building-real-time-applications-with-websockets
