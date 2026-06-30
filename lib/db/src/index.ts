import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Prefer Neon's pooled endpoint (DATABASE_POOL_URL) when set — keeps warm
// connections to Singapore and cuts Oregon↔Singapore handshake latency.
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

const poolConfig: pg.PoolConfig = {
  connectionString,
  ssl,
  max: Number(process.env.PG_POOL_MAX ?? 20),
  min: Number(process.env.PG_POOL_MIN ?? 2),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  application_name: "dgc-arcade-api",
};

export const pool = new Pool(poolConfig);

// statement_timeout must be set per-connection — not a valid Pool option
pool.on("connect", (client) => {
  client.query("SET statement_timeout = 30000").catch(() => {});
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client in pool", err);
});

export const db = drizzle(pool, { schema, logger: false });

export * from "./schema";
