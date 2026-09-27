// seed-pending-settlement.mjs — dev-only helper: creates one 'pending'
// company settlement for the Apex demo company so the payout verification
// probe has a real balance to withdraw. MUST run BEFORE the API server
// starts (PGlite allows a single process on the data dir).
import { query } from '../backend/src/db.js';
import { closeEmbeddedDb } from '../backend/src/pglite-instance.js';

const company = await query("select id from company_profiles where company_name = 'Apex Home Services Ltd' limit 1");
if (!company.rows[0]) {
  console.error('Apex demo company not found — run seeding first');
  process.exit(1);
}
const companyId = company.rows[0].id;
const existing = await query("select count(*)::int as n from company_settlements where company_id = $1 and status = 'pending'", [companyId]);
if (existing.rows[0].n === 0) {
  await query(
    `insert into company_settlements (company_id, gross_amount, commission_amount, net_amount, status)
     values ($1, 5000, 750, 4250, 'pending')`,
    [companyId],
  );
  console.log('pending settlement seeded for Apex (4250 net)');
} else {
  console.log(`pending settlements already present: ${existing.rows[0].n}`);
}
await closeEmbeddedDb();
process.exit(0);
