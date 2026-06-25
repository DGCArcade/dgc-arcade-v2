import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon.tech requires SSL from external hosts like Render
const ssl =
  process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined;

// Optimized connection pool for Neon (Singapore region)
// Neon supports connection pooling for better performance
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl,
  // Connection pool settings optimized for production
  max: Number(process.env.PG_POOL_MAX ?? 20), // Increased from 10 for better concurrency
  min: Number(process.env.PG_POOL_MIN ?? 5), // Maintain minimum connections
  idleTimeoutMillis: 30_000, // 30 seconds
  connectionTimeoutMillis: 10_000, // 10 seconds
  keepAlive: true,
  // Neon-specific optimizations
  application_name: "dgc-arcade-api",
  // Enable TCP keepalive for long-lived connections
  statement_timeout: 30000, // 30 seconds per statement
};

export const pool = new Pool(poolConfig);

// Log pool events for monitoring
pool.on("connect", () => {
  // Connection established
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client in pool", err);
});
export const db = drizzle(pool, { schema, logger: false }); // Disable query logging in production for performance

export * from "./schema";
