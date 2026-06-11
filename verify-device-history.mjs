import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const result = await pool.query(`
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
ORDER BY table_name;
`);

console.table(result.rows);

await pool.end();
