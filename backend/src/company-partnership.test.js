// company-partnership.test.js — company ecosystem + isolation (takeover rebuild).
// Covers: application → approval → provisioning, portal overview access,
// CROSS-COMPANY denial (the IDOR the old version never asserted) and the
// dispatch success path that used to crash on the jobs_status_check constraint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { query, pool } from './db.js';
import { getEmbeddedDb } from './pglite-instance.js';
import {
  createPartnerApplication,
  approvePartnerApplication,
  getCompanyPortalOverview,
  assignTechnician,
  portalFinance,
} from './controllers/companyController.js';
import { requireCompanyMember } from './middleware/companyAccess.js';

if (process.env.NODE_ENV !== 'production') dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mockRes() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; this.statusCode = this.statusCode || 200; return payload; },
  };
}

async function ensureSchema() {
  if (process.env.PATAFUNDI_EMBEDDED_DB === '1' || !process.env.DATABASE_URL) {
    const db = await getEmbeddedDb();
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const applied = await db.query('select filename from schema_migrations').catch(() => ({ rows: [] }));
    const appliedSet = new Set(applied.rows.map((r) => r.filename));
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.exec(sql).catch(() => { /* already applied via statements */ });
      await db.query('insert into schema_migrations (filename) values ($1) on conflict do nothing', [file]).catch(() => {});
    }
  }
}

async function ensureUser(email, fullName, role) {
  const hash = await bcrypt.hash('Test@1234!', 4);
  const res = await query(
    `insert into users (email, password_hash, full_name, role, status, email_verified_at)
     values (lower($1), $2, $3, $4, 'active', now())
     on conflict (email) do update set full_name = excluded.full_name, role = excluded.role
     returning id, email, role`,
    [email, hash, fullName, role],
  );
  return res.rows[0];
}

test('company partnership: apply → approve → provisioned with owner; portal access enforced; dispatch works; cross-company denied', async () => {
  await ensureSchema();

  const owner = await ensureUser('partner-owner-a@test.local', 'Partner Owner A', 'customer');
  const dispatcher = await ensureUser('partner-dispatcher-a@test.local', 'Partner Dispatcher A', 'customer');
  const outsider = await ensureUser('partner-outsider@test.local', 'Outsider', 'customer');
  const admin = await ensureUser('admin@patafundi.com', 'Super Admin', 'super_admin');

  // 1. Partner application
  const res1 = mockRes();
  await createPartnerApplication({
    user: { id: owner.id, role: 'customer' },
    body: {
      companyName: 'Nairobi Fix Works',
      legalName: 'Nairobi Fix Works Ltd',
      contactName: 'Aisha Njeri',
      contactEmail: 'partnership-a@nairofix.test',
      contactPhone: '+254700000001',
      businessCategories: ['plumbing', 'electrical'],
      serviceAreas: ['Nairobi', 'Kiambu'],
      branches: [{ name: 'HQ' }],
      technicianCount: 12,
      description: 'Takeover test company',
    },
  }, res1);
  assert.equal(res1.statusCode, 201);
  assert.equal(res1.payload.application.status, 'submitted');
  const appId = res1.payload.application.id;

  // 2. Approval provisions company + owner membership
  const res2 = mockRes();
  await approvePartnerApplication({
    user: { id: admin.id, role: 'super_admin' },
    params: { id: appId },
    body: { verificationNotes: 'Approved after document review' },
  }, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.payload.application.status, 'approved');

  const profile = (await query('select * from company_profiles where application_id = $1', [appId])).rows[0];
  assert.ok(profile, 'approved application should create a company profile');
  const ownerMembership = (await query(
    'select * from company_members where company_id = $1 and user_id = $2', [profile.id, owner.id],
  )).rows[0];
  assert.ok(ownerMembership, 'owner should be linked to the approved company');
  assert.equal(ownerMembership.role, 'owner');

  // dispatcher membership for dispatch test
  const dispatchMembership = (await query(
    `insert into company_members (company_id, user_id, role, status) values ($1, $2, 'dispatcher', 'active')
     on conflict (company_id, user_id) do update set role = 'dispatcher', status = 'active' returning *`,
    [profile.id, dispatcher.id],
  )).rows[0];

  // 3. Portal overview: owner CAN read own company
  const res3 = mockRes();
  await getCompanyPortalOverview(
    { user: { id: owner.id, role: 'customer' }, params: { companyId: profile.id } },
    res3,
  );
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.payload.company.id, profile.id);

  // 4. CROSS-COMPANY ISOLATION: outsider gets 403 via requireCompanyMember
  const middleware = requireCompanyMember({});
  const mwReq = { user: { id: outsider.id, role: 'customer' }, params: { companyId: profile.id }, body: {}, query: {} };
  let mwError = null;
  await new Promise((resolve) => {
    middleware(mwReq, {}, (err) => { mwError = err; resolve(); }).catch((e) => { mwError = e; resolve(); });
  });
  assert.ok(mwError, 'requireCompanyMember must reject a non-member');
  assert.equal(mwError.status, 403);

  // 5. Legacy overview endpoint also denies outsiders (the old IDOR hole)
  await assert.rejects(
    () => getCompanyPortalOverview(
      { user: { id: outsider.id, role: 'customer' }, params: { companyId: profile.id } },
      mockRes(),
    ),
    (err) => err.status === 403,
  );

  // 6. DISPATCH SUCCESS PATH (previously crashed on jobs_status_check):
  const job = (await query(
    `insert into jobs (customer_id, company_id, provider_type, status, service_category, description, estimated_price)
     values ($1, $2, 'company', 'accepted', 'plumbing', 'Takeover dispatch test', 2500) returning *`,
    [owner.id, profile.id],
  )).rows[0];

  const res6 = mockRes();
  await assignTechnician(
    {
      user: { id: dispatcher.id, role: 'customer' },
      company: profile,
      companyMembership: dispatchMembership,
      params: { jobId: job.id },
      body: { technicianMemberId: ownerMembership.id },
    },
    res6,
  );
  assert.equal(res6.statusCode, 200, `assign should succeed: ${JSON.stringify(res6.payload)}`);
  assert.equal(res6.payload.job.status, 'assigned');
  assert.equal(res6.payload.job.technician_user_id, owner.id);
  assert.equal(res6.payload.job.assigned_by, dispatcher.id);

  // 7. Non-member cannot dispatch
  await assert.rejects(
    () => assignTechnician(
      {
        user: { id: outsider.id, role: 'customer' },
        company: profile,
        companyMembership: { role: 'technician', status: 'active' },
        params: { jobId: job.id },
        body: { technicianMemberId: ownerMembership.id },
      },
      mockRes(),
    ),
    (err) => err.status === 403,
  );

  // 8. Finance scoped to company: dispatcher (non-finance role) denied
  await assert.rejects(
    () => portalFinance(
      {
        user: { id: dispatcher.id, role: 'customer' },
        company: profile,
        companyMembership: dispatchMembership,
        method: 'GET',
      },
      mockRes(),
    ),
    (err) => err.status === 403,
  );

  // Owner (finance-allowed role) can read finance
  const res8 = mockRes();
  await portalFinance(
    {
      user: { id: owner.id, role: 'customer' },
      company: profile,
      companyMembership: ownerMembership,
      method: 'GET',
    },
    res8,
  );
  assert.equal(res8.statusCode, 200);
  assert.ok(typeof res8.payload.summary.net === 'number');
});

test('company isolation prevents one company from accessing another company data', async () => {
  const customerA = await ensureUser('iso-owner-a@test.local', 'Iso Owner A', 'customer');
  const customerB = await ensureUser('iso-owner-b@test.local', 'Iso Owner B', 'customer');

  const companyA = (await query(`insert into company_profiles (
      company_name, legal_name, contact_name, contact_email, contact_phone,
      status, owner_user_id, service_areas, branches, business_categories, technician_count)
    values ('Alpha Build Works', 'Alpha Build Works Ltd', 'Alpha Contact', 'alpha-a@test.local', '+254700000010',
      'approved', $1, $2, $3, $4, 6)
    returning *`, [customerA.id, ['Nairobi'], [{ name: 'HQ' }], ['plumbing']])).rows[0];

  const companyB = (await query(`insert into company_profiles (
      company_name, legal_name, contact_name, contact_email, contact_phone,
      status, owner_user_id, service_areas, branches, business_categories, technician_count)
    values ('Beta Repairs Co', 'Beta Repairs Co Ltd', 'Beta Contact', 'beta-b@test.local', '+254700000011',
      'approved', $1, $2, $3, $4, 4)
    returning *`, [customerB.id, ['Mombasa'], [{ name: 'Mombasa Branch' }], ['electrical']])).rows[0];

  await query(`insert into company_members (company_id, user_id, role, status) values ($1, $2, 'owner', 'active')
    on conflict (company_id, user_id) do nothing`, [companyA.id, customerA.id]);
  await query(`insert into company_members (company_id, user_id, role, status) values ($1, $2, 'owner', 'active')
    on conflict (company_id, user_id) do nothing`, [companyB.id, customerB.id]);

  // Owner of A can read A but is denied B
  const resA = mockRes();
  await getCompanyPortalOverview({ user: { id: customerA.id, role: 'customer' }, params: { companyId: companyA.id } }, resA);
  assert.equal(resA.payload.company.id, companyA.id);

  await assert.rejects(
    () => getCompanyPortalOverview({ user: { id: customerA.id, role: 'customer' }, params: { companyId: companyB.id } }, mockRes()),
    (err) => err.status === 403,
  );
});

// NOTE: no pool cleanup hook — in embedded mode the pg pool is never
// connected, and calling pool.end() hangs the test runner.
