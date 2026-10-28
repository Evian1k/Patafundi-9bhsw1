import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { getPgPoolConfig } from '../src/pg-config.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new pg.Pool(getPgPoolConfig(databaseUrl));
  let client;
  try {
    client = await pool.connect();
    await client.query('select pg_advisory_lock(1380013902, 47)');
    await client.query(`
      create table if not exists schema_migrations (
        id serial primary key,
        filename text not null unique,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = await client.query('select filename from schema_migrations order by filename');
    const appliedSet = new Set(applied.rows.map((row) => row.filename));

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] apply ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client?.release();
    await pool.end();
  }
  console.log('[migrate] done');
}

main().catch((error) => {
  console.error('[migrate] failed:', error.message);
  process.exit(1);
});
