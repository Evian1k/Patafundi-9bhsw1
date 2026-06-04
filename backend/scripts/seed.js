import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { getEmbeddedDb } from '../src/pglite-instance.js';

dotenv.config();

const demoUsers = [
  { email: 'demo@patafundi.com', password: 'Demo@2024!', fullName: 'Demo Customer', role: 'customer', phone: '254712000001' },
  { email: 'fundi@patafundi.com', password: 'Fundi@2024!', fullName: 'Demo Fundi', role: 'fundi', phone: '254712000002' },
  { email: 'admin@patafundi.com', password: 'Admin@2024!', fullName: 'Demo Admin', role: 'admin', phone: '254712000003' },
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
  const db = await getDb();
  const isPool = Boolean(db.end);
  try {
    for (const user of demoUsers) {
      const hash = await bcrypt.hash(user.password, 12);
      const inserted = await query(db,
        `insert into users (email, password_hash, full_name, phone, role, status)
         values (lower($1), $2, $3, $4, $5, 'active')
         on conflict (email) do update set password_hash = excluded.password_hash, full_name = excluded.full_name
         returning id, email, role`,
        [user.email, hash, user.fullName, user.phone, user.role],
      );
      const row = inserted.rows[0];
      await query(db,
        `insert into trust_scores (user_id, score, level) values ($1, 85, 'trusted')
         on conflict (user_id) do nothing`,
        [row.id],
      );
      if (user.role === 'fundi') {
        await query(db,
          `insert into fundis (user_id, skills, experience, mpesa_number, approval_status, online)
           values ($1, $2, $3, $4, 'approved', false)
           on conflict (user_id) do update set approval_status = 'approved'`,
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
