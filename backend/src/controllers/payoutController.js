import { query, transaction } from '../db.js';
import { badRequest } from '../utils/http.js';
import { emitEvent } from '../realtime.js';

export async function requestPayout(req, res) {
  const { amount, mpesaNumber } = req.body || {};
  if (!amount || !mpesaNumber) throw badRequest('Amount and M-Pesa number are required');
  const result = await query(
    `insert into payouts (fundi_id, amount, mpesa_number, status)
     values ($1, $2, $3, 'requested') returning *`,
    [req.user.id, amount, mpesaNumber],
  );
  emitEvent('payout:requested', { payoutId: result.rows[0].id, fundiId: req.user.id });
  emitEvent('payout:processing', { payoutId: result.rows[0].id, fundiId: req.user.id });
  res.status(201).json({ success: true, payout: result.rows[0] });
}

export async function releaseEscrow(req, res) {
  const result = await transaction(async (client) => {
    const job = await client.query('select * from jobs where id = $1 for update', [req.params.jobId]);
    const row = job.rows[0];
    if (!row) throw badRequest('Job not found');
    const payment = await client.query(
      `select * from payments where job_id = $1 and escrow_status = 'held' order by created_at desc limit 1 for update`,
      [req.params.jobId],
    );
    if (!payment.rows[0]) throw badRequest('No held escrow found');
    await client.query(
      `insert into escrow_transactions (job_id, payment_id, type, amount, status)
       values ($1, $2, 'release', $3, 'released')`,
      [req.params.jobId, payment.rows[0].id, payment.rows[0].amount],
    );
    await client.query(`update payments set escrow_status = 'released' where id = $1`, [payment.rows[0].id]);
    await client.query(`update jobs set escrow_status = 'released', payment_status = 'payout_processing' where id = $1`, [req.params.jobId]);
    return client.query(
      `insert into payouts (job_id, fundi_id, amount, status)
       values ($1, $2, $3, 'processing') returning *`,
      [req.params.jobId, row.fundi_id, payment.rows[0].amount],
    );
  });
  emitEvent('payout:processing', { jobId: req.params.jobId, payout: result.rows[0] }, `job:${req.params.jobId}`);
  res.json({ success: true, payout: result.rows[0] });
}

export async function freezeEscrow(req, res) {
  await query(
    `update payments set escrow_status = 'frozen', updated_at = now() where job_id = $1 and escrow_status = 'held'`,
    [req.params.jobId],
  );
  await query(`update jobs set escrow_status = 'frozen' where id = $1`, [req.params.jobId]);
  res.json({ success: true });
}
