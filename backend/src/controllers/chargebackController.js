import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { auditLog } from '../services/auditService.js';

const CHARGEBACK_STATUSES = ['open', 'under_review', 'won', 'lost', 'reversed'];

/**
 * Payment chargebacks (spec §26-28): disputes raised against real payments,
 * investigated by finance staff, with an audited decision. Detection exists in
 * fraudPreventionService; this gives the record + workflow behind it.
 */

/** GET /api/admin/chargebacks — list chargebacks (finance staff only). */
export async function listChargebacks(req, res) {
  const status = String(req.query.status || '').trim();
  const params = [];
  if (status) params.push(status);
  const where = status ? 'where c.status = $1' : '';
  const rows = await query(
    `select c.*, p.amount as payment_amount, p.status as payment_status,
            u.email as customer_email, j.id as job_id
     from payment_chargebacks c
     left join payments p on p.id = c.payment_id
     left join jobs j on j.id = p.job_id
     left join users u on u.id = j.customer_id
     ${where}
     order by c.created_at desc limit 100`,
    params,
  );
  res.json({ success: true, chargebacks: rows.rows });
}

/** POST /api/admin/chargebacks — record a chargeback against a payment. */
export async function createChargeback(req, res) {
  const { paymentId, amount, currency = 'KES', reason, provider = 'mpesa', providerReference = null } = req.body || {};
  if (!paymentId || !amount || !reason) throw badRequest('paymentId, amount and reason are required');
  const payment = await query(`select id, amount, status from payments where id = $1`, [paymentId]);
  if (!payment.rows[0]) throw notFound('Payment not found');
  const inserted = await query(
    `insert into payment_chargebacks (payment_id, provider, provider_reference, amount, currency, reason)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [paymentId, provider, providerReference, amount, currency, reason],
  );
  await auditLog({
    userId: req.user.id,
    action: 'finance.chargeback_created',
    entityType: 'payment_chargeback',
    entityId: inserted.rows[0].id,
    metadata: { paymentId, amount, reason: String(reason).slice(0, 200) },
  });
  res.status(201).json({ success: true, chargeback: inserted.rows[0] });
}

/** POST /api/admin/chargebacks/:id/decision — resolve a chargeback (audited). */
export async function decideChargeback(req, res) {
  const { status, notes = null, evidence } = req.body || {};
  if (!CHARGEBACK_STATUSES.includes(status)) {
    throw badRequest(`Valid statuses: ${CHARGEBACK_STATUSES.join(', ')}`);
  }
  const current = await query(`select id from payment_chargebacks where id = $1`, [req.params.id]);
  if (!current.rows[0]) throw notFound('Chargeback not found');
  const updated = await query(
    `update payment_chargebacks set
       status = $2,
       notes = coalesce($3, notes),
       evidence = case when $4::jsonb is not null then $4::jsonb else evidence end,
       decided_by = $5,
       decided_at = now(),
       updated_at = now()
     where id = $1 returning *`,
    [req.params.id, status, notes, evidence ? JSON.stringify(evidence) : null, req.user.id],
  );
  await auditLog({
    userId: req.user.id,
    action: 'finance.chargeback_decision',
    entityType: 'payment_chargeback',
    entityId: req.params.id,
    metadata: { status, notes: notes ? String(notes).slice(0, 200) : null },
  });
  res.json({ success: true, chargeback: updated.rows[0] });
}
