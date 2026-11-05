import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Use a dedicated Restaurant OS database.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 5000,
});
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../migrations');

try {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [74092161]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS restaurant_os_schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files) {
      const already = await client.query('SELECT 1 FROM restaurant_os_schema_migrations WHERE filename = $1', [filename]);
      if (already.rowCount) { console.log('skip ' + filename + ' (already applied)'); continue; }
      const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO restaurant_os_schema_migrations(filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log('applied ' + filename);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [74092161]).catch(() => {});
    client.release();
  }
} catch (error) {
  console.error('Restaurant OS migrations failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
