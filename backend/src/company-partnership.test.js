import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { query } from './db.js';
import {
  createPartnerApplication,
  approvePartnerApplication,
  getCompanyPortalOverview,
  assignTechnicianToJob,
} from './controllers/companyController.js';

test.before(async () => {
  await ensureDevDatabase();
});

test.beforeEach(async () => {
  await query('delete from company_members');
  await query('delete from company_profiles');
  await query('delete from company_partner_applications');
});

test('company partner application is created and approved into an isolated company profile', async () => {
  const owner = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const admin = (await query('select id, role from users where email = $1', ['admin@patafundi.com'])).rows[0];

  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };

  await createPartnerApplication({
    user: { id: owner.id, role: 'customer' },
    body: {
      companyName: 'Nairobi Fix Works',
      legalName: 'Nairobi Fix Works Ltd',
      contactName: 'Aisha Njeri',
      contactEmail: 'partnership@nairofix.co.ke',
      contactPhone: '+254700000001',
      companyRegistrationNumber: 'REG-0001',
      businessCategories: ['plumbing', 'electrical'],
      serviceAreas: ['Nairobi', 'Kiambu'],
      branches: [{ name: 'HQ', city: 'Nairobi' }],
      technicianCount: 12,
      licenseDetails: 'Electrical installation license',
      description: 'Full-service home maintenance and repair company',
    },
  }, res);

  assert.equal(res.statusCode, 201);
  const appId = res.payload.application.id;
  assert.equal(res.payload.application.status, 'submitted');

  await approvePartnerApplication({
    user: { id: admin.id, role: 'super_admin' },
    params: { id: appId },
    body: { verificationNotes: 'Approved after document review' },
  }, res);

  const profile = (await query('select * from company_profiles where application_id = $1', [appId])).rows[0];
  assert.ok(profile, 'approved application should create a company profile');
  assert.equal(profile.status, 'approved');

  const companyMember = (await query('select * from company_members where company_id = $1 and user_id = $2', [profile.id, owner.id])).rows[0];
  assert.ok(companyMember, 'company owner should be linked to the approved company');
  assert.equal(companyMember.role, 'owner');

  const portal = await getCompanyPortalOverview({ user: { id: owner.id, role: 'customer' }, companyId: profile.id });
  assert.equal(portal.company.id, profile.id);
  assert.ok(portal.summary.totalJobs >= 0);
});

test('company isolation prevents one company from accessing another company data', async () => {
  const customer = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const admin = (await query('select id from users where email = $1', ['admin@patafundi.com'])).rows[0];

  const companyA = (await query(`insert into company_profiles (
      company_name, legal_name, contact_name, contact_email, contact_phone,
      status, owner_user_id, service_areas, branches, business_categories, technician_count)
    values ('Alpha Build Works', 'Alpha Build Works Ltd', 'Alpha Contact', 'alpha@example.com', '+254700000010',
      'approved', $1, $2, $3, $4, 6)
    returning *`, [customer.id, ['Nairobi'], [{ name: 'HQ', city: 'Nairobi' }], ['plumbing']])).rows[0];

  const companyB = (await query(`insert into company_profiles (
      company_name, legal_name, contact_name, contact_email, contact_phone,
      status, owner_user_id, service_areas, branches, business_categories, technician_count)
    values ('Beta Repairs Co', 'Beta Repairs Co Ltd', 'Beta Contact', 'beta@example.com', '+254700000011',
      'approved', $1, $2, $3, $4, 4)
    returning *`, [admin.id, ['Mombasa'], [{ name: 'Mombasa Branch', city: 'Mombasa' }], ['electrical']])).rows[0];

  await query('insert into company_members (company_id, user_id, role, status) values ($1, $2, $3, $4)', [companyA.id, customer.id, 'owner', 'active']);
  await query('insert into company_members (company_id, user_id, role, status) values ($1, $2, $3, $4)', [companyB.id, admin.id, 'owner', 'active']);

  const appUser = (await query('select id from users where email = $1', ['demo@patafundi.com'])).rows[0];
  const companyAData = await getCompanyPortalOverview({ user: { id: appUser.id, role: 'customer' }, companyId: companyA.id });
  const companyBData = await getCompanyPortalOverview({ user: { id: appUser.id, role: 'customer' }, companyId: companyB.id });

  assert.equal(companyAData.company.id, companyA.id);
  assert.notEqual(companyAData.company.id, companyBData.company.id);

  const job = (await query(`insert into jobs (customer_id, company_id, status, service_category, description, estimated_price, customer_latitude, customer_longitude, location_name)
    values ($1, $2, 'accepted', 'plumbing', 'Leak under sink', 2500, -1.2864, 36.8172, 'Nairobi') returning *`, [appUser.id, companyA.id])).rows[0];

  const assignment = await assignTechnicianToJob({
    user: { id: appUser.id, role: 'customer' },
    params: { id: job.id },
    body: { technicianId: admin.id },
  }, { status() { return this; }, json(payload) { this.payload = payload; return payload; } });

  assert.equal(assignment.statusCode, 403);
});
