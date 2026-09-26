// seed-takeover.js — PataFundi ZAI takeover demo ecosystem (DEVELOPMENT ONLY).
// Idempotent: safe to run repeatedly. Creates:
//   • 12 demo accounts matching DEMO_ACCOUNTS.md (all roles, unified password)
//   • "Apex Home Services Ltd" demo company (branches, technicians, services)
//   • Jobs across the full lifecycle, reviews, settlements, notifications
// NEVER run against production: refuses when NODE_ENV=production.
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { getEmbeddedDb } from '../src/pglite-instance.js';
import pg from 'pg';

if (process.env.NODE_ENV !== 'production') dotenv.config();

export const DEMO_PASSWORD = 'PataFundi#2026';

const DEMO_USERS = [
  { email: 'customer.demo@patafundi.test', fullName: 'Amina Customer (Demo)', role: 'customer', phone: '254730000001' },
  { email: 'fundi.demo@patafundi.test', fullName: 'John Kamau (Demo Fundi)', role: 'fundi', phone: '254730000002' },
  { email: 'company.demo@patafundi.test', fullName: 'Grace Owner (Demo Company)', role: 'company_admin', phone: '254730000003' },
  { email: 'dispatcher.demo@patafundi.test', fullName: 'David Dispatcher (Demo)', role: 'customer', phone: '254730000004' },
  { email: 'technician.demo@patafundi.test', fullName: 'Peter Tech (Demo Technician)', role: 'customer', phone: '254730000005' },
  { email: 'operations.demo@patafundi.test', fullName: 'Faith Ops (Demo Staff)', role: 'admin', phone: '254730000006' },
  { email: 'support.demo@patafundi.test', fullName: 'Sam Support (Demo Staff)', role: 'support_agent', phone: '254730000007' },
  { email: 'finance.demo@patafundi.test', fullName: 'Nancy Finance (Demo Staff)', role: 'finance_team', phone: '254730000008' },
  { email: 'fraud.demo@patafundi.test', fullName: 'Oscar Fraud (Demo Staff)', role: 'fraud_analyst', phone: '254730000009' },
  { email: 'devops.demo@patafundi.test', fullName: 'Dennis DevOps (Demo Staff)', role: 'devops_engineer', phone: '254730000010' },
  { email: 'auditor.demo@patafundi.test', fullName: 'Alice Auditor (Demo Staff)', role: 'auditor', phone: '254730000011' },
  { email: 'admin.demo@patafundi.test', fullName: 'Super Admin (Demo)', role: 'super_admin', phone: '254730000012' },
];

async function getDb() {
  // Mirror ensure-dev-db logic: try real PostgreSQL first, fall back to the
  // embedded database when no DATABASE_URL is configured or it is unreachable.
  if (process.env.DATABASE_URL && process.env.PATAFUNDI_EMBEDDED_DB !== '1') {
    try {
      const { getPgPoolConfig } = await import('../src/pg-config.js');
      const pool = new pg.Pool(getPgPoolConfig(process.env.DATABASE_URL, { connectionTimeoutMillis: 3000 }));
      await pool.query('select 1');
      console.log('[seed-takeover] using PostgreSQL from DATABASE_URL');
      return pool;
    } catch {
      console.warn('[seed-takeover] DATABASE_URL unreachable — falling back to embedded PostgreSQL (PGlite)');
    }
  }
  process.env.PATAFUNDI_EMBEDDED_DB = '1';
  return getEmbeddedDb();
}

async function upsertUser(db, { email, fullName, role, phone }, hash) {
  const res = await db.query(
    `insert into users (email, password_hash, full_name, phone, role, status, email_verified_at)
     values (lower($1), $2, $3, $4, $5, 'active', now())
     on conflict (email) do update set password_hash = excluded.password_hash,
       full_name = excluded.full_name, role = excluded.role, email_verified_at = now()
     returning id, email, role`,
    [email, hash, fullName, phone, role],
  );
  return res.rows[0];
}

export async function seedTakeover() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed-takeover] refusing to run in production');
    return;
  }
  const db = await getDb();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const ids = {};

  // 1. Demo accounts ────────────────────────────────────────────────────────
  for (const u of DEMO_USERS) {
    const user = await upsertUser(db, u, hash);
    ids[u.email.split('.')[0]] = user.id;
  }
  console.log('[seed-takeover] 12 demo accounts ready');

  // trust scores
  for (const id of Object.values(ids)) {
    await db.query(
      `insert into trust_scores (user_id, score) values ($1, 92) on conflict (user_id) do nothing`,
      [id],
    ).catch(() => {});
  }

  // 2. Individual demo fundi (John Kamau) ─────────────────────────────────
  await db.query(
    `insert into fundis (user_id, skills, experience, bio, mpesa_number, approval_status, online, rating, verification_badge)
     values ($1, $2, $3, $4, $5, 'approved', true, 4.9, true)
     on conflict (user_id) do update set approval_status = 'approved', online = true, rating = 4.9, verification_badge = true`,
    [ids.fundi, ['plumbing'], '8 years experience', 'DEMO Fundi — licensed plumber serving Nairobi.', '254730000002'],
  ).catch(async (e) => {
    console.warn('[seed-takeover] fundis insert fallback:', e.message);
    await db.query(
      `insert into fundis (user_id, skills, experience, bio, mpesa_number, approval_status, online)
       values ($1, $2, $3, $4, $5, 'approved', true)
       on conflict (user_id) do update set approval_status = 'approved', online = true`,
      [ids.fundi, ['plumbing'], '8 years experience', 'DEMO Fundi — licensed plumber serving Nairobi.', '254730000002'],
    );
  });

  // 3. Demo customer property ──────────────────────────────────────────────
  const propRes = await db.query(
    `select id from customer_properties where customer_id = $1 and label = 'Home' limit 1`,
    [ids.customer],
  );
  let propertyId = propRes.rows[0]?.id;
  if (!propertyId) {
    const inserted = await db.query(
      `insert into customer_properties (customer_id, label, property_type, address_line, location_name, latitude, longitude, is_default)
       values ($1, 'Home', 'home', '12 Kilimani Business Road', 'Kilimani, Nairobi', -1.2921, 36.7819, true)
       returning id`,
      [ids.customer],
    );
    propertyId = inserted.rows[0].id;
    await db.query(
      `insert into customer_properties (customer_id, label, property_type, address_line, location_name, latitude, longitude)
       values ($1, 'Office', 'office', 'Upper Hill Chambers, 4th Floor', 'Upper Hill, Nairobi', -1.3001, 36.8085),
              ($1, 'Rental — Kileleshwa', 'rental', '22 Oloitokitok Road', 'Kileleshwa, Nairobi', -1.2795, 36.7787)`,
      [ids.customer],
    );
  }

  // 4. Apex Home Services Ltd (demo company) ──────────────────────────────
  const companyRes = await db.query(
    `select id from company_profiles where company_name = 'Apex Home Services Ltd' limit 1`,
  );
  let companyId = companyRes.rows[0]?.id;
  if (!companyId) {
    const appRes = await db.query(
      `insert into company_partner_applications
         (user_id, company_name, legal_name, contact_name, contact_email, contact_phone,
          company_registration_number, business_categories, service_areas, branches,
          technician_count, license_details, description, status, approved_at)
       values ($1, 'Apex Home Services Ltd', 'Apex Home Services Limited', 'Grace Owner',
         'company.demo@patafundi.test', '254730000003', 'PVT-XYZ890',
         $2, $3, $4, 4, 'NEMA & EPRA licensed (DEMO)', $5, 'approved', now())
       returning id`,
      [ids.company,
       ['plumbing', 'electrical', 'hvac', 'appliance_repair'],
       ['Nairobi', 'Kiambu', 'Westlands', 'Karen'],
       JSON.stringify([
         { name: 'HQ — Westlands', address: 'Waiyaki Way, Westlands, Nairobi', phone: '254730000003' },
         { name: 'Karen Branch', address: 'Karen Road, Nairobi', phone: '254730000004' },
       ]),
       'DEMO partner company delivering verified home services: plumbing, electrical, HVAC and appliance repair across Nairobi.'],
    );
    const compIns = await db.query(
      `insert into company_profiles
         (application_id, owner_user_id, company_name, legal_name, contact_name, contact_email,
          contact_phone, registration_number, business_categories, service_areas, branches,
          technician_count, license_details, description, status, rating, completed_jobs,
          availability, guarantees, team_size)
       values ($1, $2, 'Apex Home Services Ltd', 'Apex Home Services Limited', 'Grace Owner',
         'company.demo@patafundi.test', '254730000003', 'PVT-XYZ890', $3, $4, $5, 4,
         'NEMA & EPRA licensed (DEMO)', $6, 'approved', 4.8, 1284, 'available', $7, 4)
       returning id`,
      [appRes.rows[0].id, ids.company,
       ['plumbing', 'electrical', 'hvac', 'appliance_repair'],
       ['Nairobi', 'Kiambu', 'Westlands', 'Karen'],
       JSON.stringify([
         { name: 'HQ — Westlands', address: 'Waiyaki Way, Westlands, Nairobi', phone: '254730000003' },
         { name: 'Karen Branch', address: 'Karen Road, Nairobi', phone: '254730000004' },
       ]),
       'DEMO partner company delivering verified home services: plumbing, electrical, HVAC and appliance repair across Nairobi.',
       JSON.stringify([
         { name: '6-month workmanship warranty', terms: 'All repairs covered for 6 months.', durationDays: 180 },
         { name: '24h emergency response', terms: 'Emergency jobs attended within 24 hours or dispatch fee waived.' },
       ])],
    );
    companyId = compIns.rows[0].id;
    console.log('[seed-takeover] Apex Home Services Ltd created:', companyId);
  }

  // 5. Company members (owner, dispatcher, finance, 3 technicians) ─────────
  const members = [
    { uid: ids.company, role: 'owner', skills: [], name: 'Grace Owner' },
    { uid: ids.dispatcher, role: 'dispatcher', skills: [], name: 'David Dispatcher' },
    { uid: ids.technician, role: 'technician', skills: ['plumbing', 'appliance_repair'], name: 'Peter Tech' },
  ];
  // two extra demo technicians
  for (const extra of [
    { email: 'tech2.demo@patafundi.test', fullName: 'Brian Electric (Demo Technician)', role: 'customer', phone: '254730000013', skills: ['electrical', 'hvac'] },
    { email: 'tech3.demo@patafundi.test', fullName: 'Carol Fixit (Demo Technician)', role: 'customer', phone: '254730000014', skills: ['appliance_repair', 'hvac'] },
  ]) {
    const user = await upsertUser(db, extra, hash);
    ids[extra.email.split('@')[0].split('.')[0] + '2'] = user.id;
    members.push({ uid: user.id, role: 'technician', skills: extra.skills, name: extra.fullName });
  }
  for (const m of members) {
    await db.query(
      `insert into company_members (company_id, user_id, role, status, skills, is_available, phone)
       values ($1, $2, $3, 'active', $4, true, $5)
       on conflict (company_id, user_id) do update set role = excluded.role, status = 'active', skills = excluded.skills`,
      [companyId, m.uid, m.role, m.skills, m.phone || null],
    );
  }

  // 6. Company services catalog ────────────────────────────────────────────
  const services = [
    { name: 'Leaking Pipe Repair', category: 'plumbing', price: 3500, minutes: 90 },
    { name: 'Water Tank Installation', category: 'plumbing', price: 8500, minutes: 240 },
    { name: 'Wiring & Socket Installation', category: 'electrical', price: 5000, minutes: 120 },
    { name: 'Electrical Fault Diagnosis', category: 'electrical', price: 2500, minutes: 60 },
    { name: 'AC Service & Regas', category: 'hvac', price: 6500, minutes: 150 },
    { name: 'Washing Machine Repair', category: 'appliance_repair', price: 3000, minutes: 90 },
  ];
  for (const s of services) {
    await db.query(
      `insert into company_services (company_id, name, category, description, base_price, duration_minutes)
       select $1, $2, $3, $4, $5, $6
       where not exists (select 1 from company_services where company_id = $1 and name = $2)`,
      [companyId, s.name, s.category, `DEMO service: ${s.name}`, s.price, s.minutes],
    );
  }

  // 7. Jobs across the lifecycle ───────────────────────────────────────────
  const jobSeed = [
    // [status, category, urgency, days offset, price, description, technicianIdx, withPayment, withReview]
    ['pending', 'plumbing', 'normal', 0, 3500, 'Kitchen sink is leaking from underneath the cabinet — DEMO incoming job.', null, false, false],
    ['accepted', 'electrical', 'normal', -0.2, 5000, 'Two power sockets in the living room stopped working — DEMO job awaiting dispatch.', null, false, false],
    ['assigned', 'hvac', 'normal', -0.3, 6500, 'AC not cooling; needs service and regas — DEMO job assigned to technician.', 0, false, false],
    ['on_the_way', 'appliance_repair', 'normal', -0.5, 3000, 'Washing machine drum not spinning — DEMO job, technician en route.', 1, false, false],
    ['in_progress', 'plumbing', 'emergency', -0.6, 5500, 'Burst pipe flooding the corridor — DEMO emergency job in progress.', 2, false, false],
    ['completed', 'electrical', 'normal', -3, 5000, 'Full wiring check and two new sockets installed — DEMO completed job.', 1, true, true],
    ['completed', 'plumbing', 'normal', -10, 4000, 'Bathroom drain unblocked and sealed — DEMO completed + paid + settled job.', 0, true, true],
    ['cancelled', 'hvac', 'normal', -6, 6500, 'AC regas request cancelled by customer — DEMO cancelled job.', null, false, false],
  ];
  const techMembers = await db.query(
    `select cm.user_id, u.full_name from company_members cm join users u on u.id = cm.user_id
     where cm.company_id = $1 and cm.role = 'technician' order by cm.joined_at`,
    [companyId],
  );
  const jobIds = [];
  for (const [status, category, urgency, dayOffset, price, description, techIdx, withPayment, withReview] of jobSeed) {
    const existing = await db.query(
      `select id from jobs where description = $1 limit 1`,
      [description],
    );
    if (existing.rows[0]) { jobIds.push(existing.rows[0].id); continue; }
    const technician = techIdx != null ? techMembers.rows[techIdx % techMembers.rows.length] : null;
    const created = await db.query(
      `insert into jobs (customer_id, service_category, description, location_name, customer_latitude,
         customer_longitude, status, urgency, estimated_price, final_price, scheduled_at, company_id,
         provider_type, technician_user_id, fundi_id, assigned_by, property_id, payment_status,
         customer_completion_confirmed, created_at, updated_at)
       values ($1, $2, $3, '12 Kilimani Business Road, Kilimani', -1.2921, 36.7819, $4, $5, $6, $7,
         now() + ($8 || ' days')::interval, $9, 'company', $10, $10, $11, $12, $13, $14,
         now() + ($8 || ' days')::interval, now())
       returning id`,
      [ids.customer, category, description, status, urgency, price,
       withPayment ? price : (status === 'completed' ? price : null),
       String(dayOffset), companyId, technician?.user_id || null,
       technician ? ids.company : null, propertyId,
       withPayment ? 'payout_completed' : 'pending',
       withPayment || status === 'completed' ? true : false],
    );
    const jobId = created.rows[0].id;
    jobIds.push(jobId);

    if (withPayment) {
      // escrow-held payment with server-side split + released + settlement + payout
      const commission = Math.round(price * 0.15);
      const net = price - commission;
      const payRes = await db.query(
        `insert into payments (job_id, customer_id, amount, currency, provider, status, escrow_status,
           commission_rate, commission_type, platform_commission, fundi_amount, idempotency_key, paid_at)
         values ($1, $2, $3, 'KES', 'mpesa', 'completed', 'released', 0.15, 'percentage', $4, $5, $6, now())
         returning id`,
        [jobId, ids.customer, price, commission, net, `demo_seed_${jobId}`],
      ).catch(async () => {
        // payments table without split columns (older schema) — insert minimal
        return db.query(
          `insert into payments (job_id, customer_id, amount, currency, provider, status, escrow_status, idempotency_key, paid_at)
           values ($1, $2, $3, 'KES', 'mpesa', 'completed', 'released', $4, now()) returning id`,
          [jobId, ids.customer, price, `demo_seed_${jobId}`],
        );
      });
      await db.query(
        `insert into escrow_transactions (job_id, payment_id, type, amount, status)
         values ($1, $2, 'hold', $3, 'held'), ($1, $2, 'release', $4, 'released')`,
        [jobId, payRes.rows[0].id, price, net],
      );
      await db.query(
        `insert into escrow_accounts (job_id, customer_id, fundi_id, balance, status)
         values ($1, $2, $3, 0, 'payout_completed')
         on conflict (job_id) do update set status = 'payout_completed', balance = 0`,
        [jobId, ids.customer, technician?.user_id || ids.fundi],
      ).catch(() => {});
      await db.query(
        `insert into company_settlements (company_id, job_id, payment_id, gross_amount, commission_amount, net_amount, status, paid_at, payout_reference)
         values ($1, $2, $3, $4, $5, $6, 'paid', now() - interval '1 day', 'DEMO-STL-001')
         on conflict do nothing`,
        [companyId, jobId, payRes.rows[0].id, price, commission, net],
      );
      await db.query(
        `insert into payouts (job_id, fundi_id, amount, status, net_amount, provider_reference)
         values ($1, $2, $3, 'completed', $3, 'DEMO-PAYOUT')
         on conflict do nothing`,
        [jobId, ids.fundi, net],
      ).catch(() => {});
      await db.query(
        `insert into revenue_ledger (job_id, transaction_type, amount, currency, customer_paid, commission_amount, net_revenue, notes)
         values ($1, 'commission_earned', $2, 'KES', $3, $2, $2, 'DEMO seed — platform commission')`,
        [jobId, commission, price],
      ).catch(() => {});
    }
    if (withReview) {
      await db.query(
        `insert into reviews (job_id, reviewer_id, rating, comment)
         select $1, $2, 5, 'Excellent, professional work — arrived on time. (DEMO review)'
         where not exists (select 1 from reviews where job_id = $1)`,
        [jobId, ids.customer],
      );
    }
  }
  console.log(`[seed-takeover] ${jobIds.length} lifecycle jobs ready`);

  // 8. Fundi wallet for the individual demo fundi ──────────────────────────
  await db.query(
    `insert into fundi_wallets (fundi_id, available_balance, pending_balance, total_earned)
     values ($1, 18500, 2400, 42000)
     on conflict (fundi_id) do nothing`,
    [ids.fundi],
  );

  // 9. Sample notifications for demo customer + company owner ──────────────
  await db.query(
    `insert into notifications (user_id, type, title, body, data)
     select $1, 'welcome', 'Welcome to PataFundi', 'Your demo account is ready. Book a verified Fundi or Company to get started.', '{}'::jsonb
     where not exists (select 1 from notifications where user_id = $1 and type = 'welcome')`,
    [ids.customer],
  );
  await db.query(
    `insert into notifications (user_id, type, title, body, data)
     select $1, 'company_incoming_job', 'New Incoming Job', 'A plumbing request is waiting in your dispatch board.', '{}'::jsonb
     where not exists (select 1 from notifications where user_id = $1 and type = 'company_incoming_job')`,
    [ids.company],
  );

  // 10. Refresh company aggregates ─────────────────────────────────────────
  await db.query(
    `update company_profiles cp set
       completed_jobs = greatest(cp.completed_jobs, (select count(*) from jobs j where j.company_id = cp.id and j.status = 'completed')),
       rating = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r join jobs j on j.id = r.job_id where j.company_id = cp.id), cp.rating, 0)
     where cp.id = $1`,
    [companyId],
  );

  console.log('[seed-takeover] DEMO ecosystem ready — see DEMO_ACCOUNTS.md for credentials');
}

const isDirectRun = process.argv[1] && process.argv[1].includes('seed-takeover');
if (isDirectRun) {
  seedTakeover()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[seed-takeover]', error);
      process.exit(1);
    });
}
