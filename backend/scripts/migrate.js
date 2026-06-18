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
  await pool.query(`
    create table if not exists schema_migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = await pool.query('select filename from schema_migrations order by filename');
  const appliedSet = new Set(applied.rows.map((row) => row.filename));

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[migrate] skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] apply ${file}`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations (filename) values ($1)', [file]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  await pool.end();
  console.log('[migrate] done');
}

main().catch((error) => {
  console.error('[migrate] failed:', error.message);
  process.exit(1);
});
