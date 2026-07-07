import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * PERFORMANCE OPTIMIZATION FOR SINGAPORE DB ↔ OREGON BACKEND
 * 
 * This configuration implements:
 * 1. Connection pooling with aggressive reuse (min 5, max 50)
 * 2. TCP keep-alive to prevent connection drops over long distances
 * 3. Query timeout tuned for intercontinental latency
 * 4. Idle connection management to reduce overhead
 * 5. Regional connection string preference (pooler endpoint)
 */

// Neon provides a -pooler endpoint for better connection reuse
// Use DATABASE_POOL_URL if available (e.g., "postgres://...pooler.neon.tech")
// Falls back to DATABASE_URL for direct connections
const connectionString =
  process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon.tech requires SSL from external hosts like Render (Oregon)
const ssl =
  process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined;

/**
 * Pool configuration optimized for Singapore ↔ Oregon latency
 * 
 * Key settings:
 * - max: 50 (allows more concurrent queries to overlap network latency)
 * - min: 5 (keeps warm connections ready)
 * - idleTimeoutMillis: 120s (longer timeout for intercontinental connections)
 * - connectionTimeoutMillis: 15s (account for ~300ms round trip)
 * - keepAlive: true (maintains TCP connection across queries)
 * - keepAliveInitialDelayMillis: 10s (proactive keep-alive)
 */
const poolConfig: pg.PoolConfig = {
  connectionString,
  ssl,
  // Increased pool size for better concurrency under latency
  max: Number(process.env.PG_POOL_MAX ?? 50),
  min: Number(process.env.PG_POOL_MIN ?? 5),
  // Longer timeouts for intercontinental connections
  idleTimeoutMillis: 120_000,
  connectionTimeoutMillis: 15_000,
  // TCP keep-alive to prevent connection drops
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: "dgc-arcade-api",
};

export const pool = new Pool(poolConfig);

// Per-connection settings for timeout and transaction behavior
pool.on("connect", (client) => {
  // 30s statement timeout (accounts for network latency)
  client.query("SET statement_timeout = 30000").catch(() => {});
  // 35s idle-in-transaction timeout (prevents long-held locks)
  client.query("SET idle_in_transaction_session_timeout = 35000").catch(() => {});
  // Enable pipelining for batch queries
  client.query("SET pipelining = true").catch(() => {});
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client in pool", err);
});

export const db = drizzle(pool, { schema, logger: false });

export * from "./schema";
