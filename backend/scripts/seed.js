import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { getEmbeddedDb } from '../src/pglite-instance.js';
import { canSeedDemoData } from '../src/demoDataPolicy.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const demoUsers = [
  { email: 'demo@patafundi.com', fullName: 'Demo Customer', role: 'customer', phone: '254712000001' },
  { email: 'company@patafundi.com', fullName: 'Demo Company Admin', role: 'company_admin', phone: '254712000002' },
  { email: 'fundi@patafundi.com', fullName: 'Demo Fundi', role: 'fundi', phone: '254712000003' },
  { email: 'admin@patafundi.com', fullName: 'Demo Admin', role: 'admin', phone: '254712000004' },
];

async function getDb() {
  if (process.env.PATAFUNDI_EMBEDDED_DB === '1') {
    return getEmbeddedDb();
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new pg.Pool({ connectionString: databaseUrl });
}

async function query(db, sql, params = []) {
  if (typeof db.query === 'function' && !db.connect) {
    return db.query(sql, params);
  }
  return db.query(sql, params);
}

async function main() {
  if (!canSeedDemoData()) {
    console.error('[seed] refusing to create demo accounts outside isolated embedded storage or an allowlisted local test database');
    return;
  }
  const demoPassword = process.env.PATAFUNDI_DEMO_SEED_PASSWORD;
  if (!demoPassword) {
    throw new Error('PATAFUNDI_DEMO_SEED_PASSWORD is required to seed demo accounts');
  }
  const db = await getDb();
  const isPool = Boolean(db.end);
  try {
    for (const user of demoUsers) {
      const hash = await bcrypt.hash(demoPassword, 12);
      const inserted = await query(db,
        `insert into users (email, password_hash, full_name, phone, role, status, is_demo)
         values (lower($1), $2, $3, $4, $5, 'active', true)
         on conflict (email) do nothing
         returning id, email, role, is_demo`,
        [user.email, hash, user.fullName, user.phone, user.role],
      );
      let row = inserted.rows[0];
      if (!row) {
        const existing = await query(db,
          `select id, email, role, is_demo from users where lower(email) = lower($1)`,
          [user.email],
        );
        row = existing.rows[0];
        if (!row) throw new Error(`[seed] conflicting account ${user.email} disappeared during lookup`);
        if (row.is_demo !== true || row.role !== user.role) {
          console.warn(`[seed] preserving existing non-demo or mismatched account ${row.email}; related demo records skipped`);
          continue;
        }
      }
      await query(db,
        `insert into trust_scores (user_id, score, level) values ($1, 85, 'trusted')
         on conflict (user_id) do nothing`,
        [row.id],
      );
      if (user.role === 'fundi') {
        await query(db,
          `insert into fundis (user_id, skills, experience, mpesa_number, approval_status, online)
           values ($1, $2, $3, $4, 'approved', false)
           on conflict (user_id) do nothing`,
          [row.id, ['plumbing', 'electrical'], '5 years experience', user.phone],
        );
        await query(db,
          `insert into wallets (user_id, balance, currency) values ($1, 0, 'KES')
           on conflict (user_id) do nothing`,
          [row.id],
        );
      }
      if (user.role === 'customer') {
        await query(db,
          `insert into customers (user_id) values ($1) on conflict (user_id) do nothing`,
          [row.id],
        );
      }
      console.log(`[seed] ${row.email} (${row.role})`);
    }
  } finally {
    if (isPool) await db.end();
  }
  console.log('[seed] done');
}

main().catch((error) => {
  console.error('[seed] failed:', error.message);
  process.exit(1);
});
