// Quote service (production correction pass).
//
// A quote is a first-class entity with its own lifecycle:
//   DRAFT → SENT → VIEWED → ACCEPTED / DECLINED / EXPIRED / CANCELLED
//
// THE core invariant (spec §1/§49): sending or viewing a quote NEVER completes
// a job. Only accepting a quote moves the booking forward (to
// booking_confirmed), and completion itself requires the real work + customer
// OTP confirmation enforced by the job state machine.
import { query } from '../db.js';
import { badRequest, forbidden, notFound } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { recordTimelineEvent } from './timelineService.js';
import { transitionJob } from './jobStateMachine.js';

export const LIVE_QUOTE_STATUSES = ['draft', 'sent', 'viewed'];
const DEFAULT_QUOTE_TTL_HOURS = 72;

function quotePublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    job_id: row.job_id,
    customerId: row.customer_id,
    companyId: row.company_id,
    fundiId: row.fundi_id,
    serviceCategory: row.service_category,
    description: row.description,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency,
    laborAmount: row.labor_amount == null ? null : Number(row.labor_amount),
    materialsAmount: row.materials_amount == null ? null : Number(row.materials_amount),
    additionalCharges: row.additional_charges || [],
    estimatedDurationHours: row.estimated_duration_hours == null ? null : Number(row.estimated_duration_hours),
    notes: row.notes,
    attachments: row.attachments || [],
    expiresAt: row.expires_at,
    status: row.status,
    viewedAt: row.viewed_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    questionThread: row.question_thread || [],
    companyName: row.company_name || null,
    companyLogoUrl: row.company_logo_url || null,
    fundiName: row.fundi_name || null,
    bookingNumber: row.booking_number || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create + send a quote for a job. Moves the job into the quote phase
 * (status 'offered') through the central state machine, or creates the quote
 * while the job is already being quoted.
 */
export async function createQuote({
  jobId, actor, companyId = null, fundiId = null, amount,
  serviceCategory = null, description = null, currency = 'KES',
  laborAmount = null, materialsAmount = null, additionalCharges = [],
  estimatedDurationHours = null, notes = null, attachments = [],
  expiresInHours = DEFAULT_QUOTE_TTL_HOURS,
}) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) throw badRequest('A valid quote amount is required');
  const jobRes = await query('select * from jobs where id = $1', [jobId]);
  const job = jobRes.rows[0];
  if (!job) throw notFound('Job not found');

  if (['completed', 'closed', 'cancelled', 'failed', 'expired', 'refunded'].includes(job.status)) {
    throw badRequest('This booking can no longer be quoted');
  }

  // One live quote per job (DB enforces with a partial unique index too).
  const live = await query(
    `select id from quotes where job_id = $1 and status in ('draft','sent','viewed')`,
    [jobId],
  );
  if (live.rows[0]) {
    throw badRequest('This booking already has a pending quote. Cancel it before sending a new one.');
  }

  const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInHours) || DEFAULT_QUOTE_TTL_HOURS) * 3600 * 1000);
  const inserted = await query(
    `insert into quotes (job_id, customer_id, company_id, fundi_id, service_category, description,
       amount, currency, labor_amount, materials_amount, additional_charges,
       estimated_duration_hours, notes, attachments, expires_at, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb,$15,'sent',$16)
     returning *`,
    [jobId, job.customer_id, companyId, fundiId,
     serviceCategory || job.service_category, description || job.description,
     parsed, currency, laborAmount, materialsAmount,
     JSON.stringify(additionalCharges), estimatedDurationHours, notes,
     JSON.stringify(attachments), expiresAt, actor?.id || null],
  );
  const quote = inserted.rows[0];

  // Move the job into the quote-review phase (idempotent if already there).
  // Actor authorization happened in the endpoint that called createQuote
  // (company portal access / fundi accept flow), so the state machine runs
  // with skipActorCheck - but the EDGE itself is still validated.
  if (job.status !== 'offered') {
    if (['pending', 'matching', 'quote_requested', 'accepted', 'scheduled', 'booking_confirmed'].includes(job.status)) {
      await transitionJob({
        jobId: job.id, toStatus: 'offered', actor,
        actorKind: 'dispatch', job, skipActorCheck: true,
        metadata: { quoteId: quote.id, amount: parsed, source: 'quote_created' },
      });
    }
  } else {
    await recordTimelineEvent({
      jobId: job.id, eventType: 'quote_updated', actorId: actor?.id || null,
      actorRole: actor?.role || 'system', metadata: { quoteId: quote.id, amount: parsed },
    });
  }

  // Keep the job's estimate in sync with the live quote (display + escrow math
  // only ever uses customer-approved values; acceptance re-affirms it).
  await query('update jobs set estimated_price = $2, updated_at = now() where id = $1', [jobId, parsed]);

  await notifyCustomerQuote(job, quote, 'sent');
  emitEvent('job:quote', { jobId: job.id, quoteId: quote.id, amount: parsed }, `job:${job.id}`);
  return quotePublic(await loadQuoteById(quote.id));
}

async function loadQuoteById(id) {
  const res = await query(`${QUOTE_SELECT} where q.id = $1`, [id]);
  return res.rows[0];
}

const QUOTE_SELECT = `
  select q.*, cp.company_name, cp.logo_url as company_logo_url,
         u.full_name as fundi_name, j.booking_number
  from quotes q
  left join company_profiles cp on cp.id = q.company_id
  left join fundis f on f.user_id = q.fundi_id
  left join users u on u.id = f.user_id
  left join jobs j on j.id = q.job_id`;

export async function getLiveQuoteForJob(jobId) {
  // Lazy expiry: anything past its expiry flips before the caller sees it.
  await query(
    `update quotes set status = 'expired', updated_at = now()
     where job_id = $1 and status in ('sent','viewed') and expires_at is not null and expires_at < now()`,
    [jobId],
  );
  const res = await query(`${QUOTE_SELECT} where q.job_id = $1 order by q.created_at desc limit 1`, [jobId]);
  return quotePublic(res.rows[0]);
}

export async function listQuotesForJob(jobId) {
  await query(
    `update quotes set status = 'expired', updated_at = now()
     where job_id = $1 and status in ('sent','viewed') and expires_at is not null and expires_at < now()`,
    [jobId],
  );
  const res = await query(`${QUOTE_SELECT} where q.job_id = $1 order by q.created_at desc`, [jobId]);
  return res.rows.map(quotePublic);
}

/** Customer opens the quote: SENT → VIEWED (never touches the job status). */
export async function markQuoteViewed(quoteId, viewer) {
  const res = await query(
    `update quotes set status = 'viewed', viewed_at = coalesce(viewed_at, now()), updated_at = now()
     where id = $1 and status = 'sent' and customer_id = $2 returning *`,
    [quoteId, viewer.id],
  );
  if (res.rows[0]) {
    emitEvent('quote:viewed', { quoteId, jobId: res.rows[0].job_id }, `job:${res.rows[0].job_id}`);
  }
  return res.rows[0] ? quotePublic(res.rows[0]) : null;
}

/**
 * Customer decision. Accept: quote → accepted, job → booking_confirmed.
 * Decline: quote → declined, job → matching (still available for another
 * quote, cancellation or support - spec §5). Never touches completion.
 */
export async function decideQuote({ jobId, decision, customer, note = null }) {
  if (!['accept', 'decline'].includes(decision)) throw badRequest('decision must be accept or decline');
  const jobRes = await query('select * from jobs where id = $1', [jobId]);
  const job = jobRes.rows[0];
  if (!job) throw notFound('Job not found');
  if (job.customer_id !== customer.id && !customer.isAdmin) {
    throw forbidden('Only the customer can decide on this quote');
  }

  await query(
    `update quotes set status = 'expired', updated_at = now()
     where job_id = $1 and status in ('sent','viewed') and expires_at is not null and expires_at < now()`,
    [jobId],
  );
  const liveRes = await query(
    `select * from quotes where job_id = $1 and status in ('sent','viewed') order by created_at desc limit 1`,
    [jobId],
  );
  const quote = liveRes.rows[0];
  if (!quote) throw badRequest('This booking has no pending quote to decide');
  if (job.status !== 'offered' && job.status !== 'quote_requested') {
    throw badRequest('This booking has no pending quote to decide');
  }

  if (decision === 'accept') {
    await query(
      `update quotes set status = 'accepted', decided_at = now(), decision_note = $2, updated_at = now() where id = $1`,
      [quote.id, note],
    );
    // THE acceptance transition: booking confirmed. Work still has to happen;
    // the state machine physically has no edge from here to completed.
    const updated = await transitionJob({
      jobId: job.id, toStatus: 'booking_confirmed', actor: customer,
      actorKind: 'flex', job,
      metadata: { quoteId: quote.id, amount: Number(quote.amount) },
    });
    await recordTimelineEvent({
      jobId: job.id, eventType: 'quote_accepted', actorId: customer.id,
      actorRole: customer.role, metadata: { quoteId: quote.id, amount: Number(quote.amount) },
    });
    await notifyQuoteSender(quote, job, 'accepted');
    emitEvent('quote:accepted', { jobId: job.id, quoteId: quote.id }, `job:${job.id}`);
    return { quote: quotePublic(await loadQuoteById(quote.id)), job: updated };
  }

  await query(
    `update quotes set status = 'declined', decided_at = now(), decision_note = $2, updated_at = now() where id = $1`,
    [quote.id, note],
  );
  // Booking stays alive for another quote / cancellation / support (§5).
  const updated = await transitionJob({
    jobId: job.id, toStatus: 'matching', actor: customer,
    actorKind: 'scheduler', job,
    metadata: { quoteId: quote.id, reason: 'quote_declined' },
  });
  await recordTimelineEvent({
    jobId: job.id, eventType: 'quote_declined', actorId: customer.id,
    actorRole: customer.role, metadata: { quoteId: quote.id },
  });
  await notifyQuoteSender(quote, job, 'declined', note);
  emitEvent('quote:declined', { jobId: job.id, quoteId: quote.id }, `job:${job.id}`);
  return { quote: quotePublic(await loadQuoteById(quote.id)), job: updated };
}

/** Customer asks a question on the live quote (spec §3 "Ask a Question"). */
export async function addQuoteQuestion({ jobId, customer, question }) {
  const text = String(question || '').trim();
  if (!text) throw badRequest('A question is required');
  if (text.length > 2000) throw badRequest('Question is too long (2000 characters max)');
  const liveRes = await query(
    `select * from quotes where job_id = $1 and status in ('sent','viewed') order by created_at desc limit 1`,
    [jobId],
  );
  const quote = liveRes.rows[0];
  if (!quote) throw notFound('No pending quote to ask about');
  if (quote.customer_id !== customer.id && !customer.isAdmin) {
    throw forbidden('Only the customer can ask about this quote');
  }
  const entry = { from: 'customer', text, at: new Date().toISOString() };
  await query(
    `update quotes set question_thread = question_thread || $2::jsonb, status = 'viewed',
       viewed_at = coalesce(viewed_at, now()), updated_at = now()
     where id = $1`,
    [quote.id, JSON.stringify([entry])],
  );
  await recordTimelineEvent({
    jobId, eventType: 'quote_question', actorId: customer.id, actorRole: customer.role,
    metadata: { quoteId: quote.id },
  });
  // Notify the quote sender (company owner or fundi).
  let recipient = quote.fundi_id || null;
  if (!recipient && quote.company_id) {
    const owner = await query('select owner_user_id from company_profiles where id = $1', [quote.company_id]);
    recipient = owner.rows[0]?.owner_user_id || null;
  }
  if (recipient) {
    await query(
      `insert into notifications (user_id, type, title, body, data, category)
       values ($1, 'quote_question', 'Customer question about your quote', $2, $3::jsonb, 'customers')`,
      [recipient, text.slice(0, 400), JSON.stringify({ jobId, quoteId: quote.id })],
    );
  }
  emitEvent('quote:question', { jobId, quoteId: quote.id }, `job:${jobId}`);
  return quotePublic(await loadQuoteById(quote.id));
}

/** Provider (company/fundi) cancels a live quote before the customer decides. */
export async function cancelQuote({ jobId, actor }) {
  const liveRes = await query(
    `select * from quotes where job_id = $1 and status in ('draft','sent','viewed') order by created_at desc limit 1`,
    [jobId],
  );
  const quote = liveRes.rows[0];
  if (!quote) throw notFound('No live quote to cancel');
  const allowed = actor.isAdmin || (quote.company_id && actor.companyRoles?.length) || quote.fundi_id === actor.id || quote.created_by === actor.id;
  if (!allowed) throw forbidden('Only the quote sender can cancel it');
  await query(`update quotes set status = 'cancelled', decided_at = now(), updated_at = now() where id = $1`, [quote.id]);
  // If the job was parked in the quote phase, re-open matching.
  const jobRes = await query('select * from jobs where id = $1', [jobId]);
  if (jobRes.rows[0]?.status === 'offered') {
    await transitionJob({
      jobId, toStatus: 'matching', actor, actorKind: 'dispatch',
      job: jobRes.rows[0], metadata: { quoteId: quote.id, reason: 'quote_cancelled' },
    }).catch(() => {});
  }
  return quotePublic(await loadQuoteById(quote.id));
}

/** Reaper: expire every stale live quote (called by the queue worker too). */
export async function expireStaleQuotes() {
  const res = await query(
    `update quotes set status = 'expired', updated_at = now()
     where status in ('sent','viewed') and expires_at is not null and expires_at < now()
     returning job_id`,
  );
  for (const row of res.rows) {
    await query(
      `update jobs set status = 'matching', updated_at = now()
       where id = $1 and status = 'offered'`,
      [row.job_id],
    ).catch(() => {});
  }
  return res.rows.length;
}

async function notifyCustomerQuote(job, quote, action) {
  const amount = Number(quote.amount).toLocaleString();
  await query(
    `insert into notifications (user_id, type, title, body, data, category)
     values ($1, 'quote_received', $2, $3, $4::jsonb, 'customers')`,
    [job.customer_id,
     `Quote from ${quote.company_id ? 'company' : 'professional'}`,
     `You received a quote of ${quote.currency} ${amount} for booking ${job.booking_number}. Review it to confirm the work.`,
     JSON.stringify({ jobId: job.id, quoteId: quote.id, bookingNumber: job.booking_number, amount: Number(quote.amount) })],
  ).catch(() => {});
}

async function notifyQuoteSender(quote, job, decision, note = null) {
  let recipients = [];
  if (quote.company_id) {
    const members = await query(
      `select user_id from company_members where company_id = $1 and status = 'active' and role in ('owner','manager','admin')`,
      [quote.company_id],
    );
    recipients = members.rows.map((r) => r.user_id);
  } else if (quote.fundi_id) {
    recipients = [quote.fundi_id];
  }
  const title = decision === 'accepted' ? 'Quote accepted' : 'Quote declined';
  const body = decision === 'accepted'
    ? `The customer accepted your quote for booking ${job.booking_number}. You can now proceed with the work.`
    : `The customer declined your quote for booking ${job.booking_number}.${note ? ` Note: ${String(note).slice(0, 200)}` : ''}`;
  for (const userId of recipients) {
    await query(
      `insert into notifications (user_id, type, title, body, data, category)
       values ($1, $2, $3, $4, $5::jsonb, 'customers')`,
      [userId, decision === 'accepted' ? 'quote_accepted' : 'quote_declined', title, body,
       JSON.stringify({ jobId: job.id, quoteId: quote.id, bookingNumber: job.booking_number })],
    ).catch(() => {});
  }
}

export { quotePublic, QUOTE_SELECT };
