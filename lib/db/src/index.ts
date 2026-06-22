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

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
