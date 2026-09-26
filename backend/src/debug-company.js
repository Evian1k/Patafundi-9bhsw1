import { ensureDevDatabase } from '../scripts/ensure-dev-db.js';
import { query } from './db.js';
import { createPartnerApplication, approvePartnerApplication } from './controllers/companyController.js';

await ensureDevDatabase();

const owner = (await query("select id from users where email = $1", ['demo@patafundi.com'])).rows[0];
const admin = (await query("select id, role from users where email = $1", ['admin@patafundi.com'])).rows[0];
const res = {
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return payload; },
};

const app = await createPartnerApplication({
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

console.log('APP', JSON.stringify(app, null, 2));
console.log('APP ROW', JSON.stringify((await query('select * from company_partner_applications')).rows, null, 2));

const approved = await approvePartnerApplication({
  user: { id: admin.id, role: 'super_admin' },
  params: { id: app.application.id },
  body: { verificationNotes: 'Approved after document review' },
}, res);

console.log('APPROVED', JSON.stringify(approved, null, 2));
console.log('COMPANY ROWS', JSON.stringify((await query('select * from company_profiles')).rows, null, 2));
console.log('MEMBERS', JSON.stringify((await query('select * from company_members')).rows, null, 2));
