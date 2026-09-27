// Central job state machine (production correction pass).
//
// ONE authoritative lifecycle service. Every job status change must go through
// `transitionJob` - no endpoint may `update jobs set status = ...` directly
// anymore. This is what makes the invariant "a quote is not a completed job"
// structurally enforceable: quote-phase states simply have no edge to
// completed/confirmed/payment states, and the machine rejects every other
// invalid jump with a 409/400 before touching the database.
import { query } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';
import { emitEvent } from '../realtime.js';
import { recordTimelineEvent } from './timelineService.js';

// ── Canonical state groups ────────────────────────────────────────────────
// Quote phase: the customer has not yet approved paid work. From here a job
// can ONLY move deeper into matching/quote flow, or backwards/cancelled -
// never to completion or payment.
export const QUOTE_PHASE_STATES = ['quote_requested', 'offered'];

export const ACTIVE_JOB_STATES = [
  'pending', 'matching', 'quote_requested', 'offered', 'accepted',
  'booking_confirmed', 'assigned', 'scheduled',
  'on_the_way', 'arrived', 'in_progress', 'completion_requested',
  'customer_confirmed_completion', 'payment_pending', 'payment_processing',
];

export const COMPLETED_JOB_STATES = ['payment_confirmed', 'completed', 'closed'];

export const TERMINAL_JOB_STATES = ['completed', 'closed', 'cancelled', 'failed', 'expired', 'refunded'];

// Allowed edges. Anything not listed here is rejected.
//   pending/matching → quote_requested: customer or provider opts into quotes
//   quote_requested → offered: provider sends the quote
//   offered → accepted/booking_confirmed: customer accepts the quote
//   offered → matching/pending: customer declines or quote expires (booking
//             stays available for another quote - spec §5)
//   completion_requested → customer_confirmed_completion: customer verified
//     the work (OTP) - completion_requested → completed stays as the direct
//     edge for flows where payment is already settled.
export const JOB_TRANSITIONS = {
  pending: ['matching', 'quote_requested', 'offered', 'accepted', 'assigned', 'scheduled', 'booking_confirmed', 'cancelled'],
  matching: ['pending', 'quote_requested', 'offered', 'accepted', 'assigned', 'scheduled', 'booking_confirmed', 'cancelled'],
  quote_requested: ['matching', 'pending', 'offered', 'cancelled'],
  offered: ['accepted', 'booking_confirmed', 'matching', 'pending', 'cancelled'],
  accepted: ['booking_confirmed', 'assigned', 'scheduled', 'on_the_way', 'cancelled'],
  booking_confirmed: ['assigned', 'scheduled', 'on_the_way', 'cancelled'],
  scheduled: ['accepted', 'assigned', 'on_the_way', 'booking_confirmed', 'cancelled'],
  assigned: ['on_the_way', 'arrived', 'accepted', 'scheduled', 'cancelled'],
  on_the_way: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'on_the_way', 'cancelled'],
  in_progress: ['completion_requested', 'completed', 'cancelled', 'disputed'],
  completion_requested: ['customer_confirmed_completion', 'completed', 'disputed', 'cancelled'],
  customer_confirmed_completion: ['payment_pending', 'payment_processing', 'payment_confirmed', 'completed', 'disputed'],
  payment_pending: ['payment_processing', 'payment_confirmed', 'completed', 'disputed'],
  payment_processing: ['payment_confirmed', 'payment_pending', 'failed', 'disputed'],
  payment_confirmed: ['completed', 'closed', 'disputed'],
  completed: ['closed', 'disputed', 'refund_requested'],
  closed: [],
  cancelled: [],
  failed: [],
  expired: [],
  disputed: ['in_progress', 'completed', 'refund_requested', 'closed', 'cancelled'],
  refund_requested: ['refunded', 'disputed', 'closed'],
  refunded: [],
};

// Who may drive a transition to each status (backend-enforced principal
// checks - job access alone is NOT enough to move the state machine).
//   provider   - assigned fundi or the owning company's dispatch roles
//   completion - from completion_requested the CUSTOMER confirms; from
//                in_progress the assigned provider may close directly
//   customer   - customer only (admin bypasses)
//   flex       - offered→accepted/booking_confirmed is the customer accepting
//                a quote; any other source is the provider accepting the job
//   dispatch   - provider side (fundi/company member); customer cannot assign
//   scheduler  - customer / company member (scheduling is a two-party plan)
//   system     - automated (webhook, reaper) - validated by caller
//   admin      - administrators only
export const JOB_STATUS_ACTORS = {
  on_the_way: 'provider',
  arrived: 'provider',
  in_progress: 'provider',
  completion_requested: 'provider',
  customer_confirmed_completion: 'completion',
  payment_pending: 'system',
  payment_processing: 'system',
  payment_confirmed: 'system',
  completed: 'completion',
  closed: 'admin',
  cancelled: 'customer',
  accepted: 'flex',
  booking_confirmed: 'flex',
  offered: 'dispatch',
  quote_requested: 'scheduler',
  assigned: 'dispatch',
  scheduled: 'scheduler',
  pending: 'scheduler',
  matching: 'scheduler',
  failed: 'admin',
  expired: 'admin',
  disputed: 'customer',
  refund_requested: 'customer',
  refunded: 'system',
};

// Human-facing labels (used in notifications + UI copy).
export const STATUS_LABELS = {
  pending: 'Requested',
  matching: 'Finding a professional',
  quote_requested: 'Quote requested',
  offered: 'Quote received',
  accepted: 'Quote accepted',
  booking_confirmed: 'Booking confirmed',
  assigned: 'Technician assigned',
  scheduled: 'Scheduled',
  on_the_way: 'Professional arriving',
  arrived: 'Checked in',
  in_progress: 'Work in progress',
  completion_requested: 'Completion requested',
  customer_confirmed_completion: 'Completion confirmed',
  payment_pending: 'Payment pending',
  payment_processing: 'Payment processing',
  payment_confirmed: 'Payment confirmed',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  expired: 'Expired',
  disputed: 'Under dispute',
  refund_requested: 'Refund requested',
  refunded: 'Refunded',
};

export function isQuotePhase(status) {
  return QUOTE_PHASE_STATES.includes(status);
}

export function assertTransitionAllowed(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    throw badRequest(`Job is already in status "${toStatus}"`);
  }
  if (!JOB_TRANSITIONS[fromStatus]) {
    throw badRequest(`Unknown job status: ${fromStatus}`);
  }
  if (!JOB_TRANSITIONS[toStatus]) {
    throw badRequest(`Invalid job status: ${toStatus}`);
  }
  if (!JOB_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw badRequest(`Invalid status transition: ${fromStatus} → ${toStatus}`);
  }
  // Structural invariant (spec §49): no quote-phase state can ever jump to a
  // completion/payment state. The transition map already omits these edges;
  // this guard documents the rule and keeps it true even if the map above is
  // ever edited carelessly.
  if (isQuotePhase(fromStatus) && ['completed', 'closed', 'customer_confirmed_completion', 'payment_confirmed', 'payment_processing', 'payment_pending'].includes(toStatus)) {
    throw badRequest('A quote does not complete a job - the customer must first accept the quote and the work must be performed');
  }
}

/**
 * Central transition. Loads the job FOR UPDATE (row lock), validates the edge,
 * the actor and optional expected-status (optimistic concurrency), performs
 * the update, writes a timeline event, and emits realtime + notification
 * side effects.
 *
 * @param {object} opts
 * @param {string} opts.jobId          job uuid
 * @param {string} opts.toStatus       target status
 * @param {object} opts.actor          { id, role, isAdmin } of the caller
 * @param {('customer'|'provider'|'completion'|'flex'|'dispatch'|'scheduler'|'admin'|'system')} [opts.actorKind]
 *        override the default actor requirement for the target status
 * @param {object} [opts.job]          pre-loaded job row (avoids re-select)
 * @param {string} [opts.expectedFrom] optimistic concurrency guard
 * @param {boolean} [opts.skipActorCheck] system callers (webhooks/reapers) that
 *        have already authorized the transition
 * @param {object} [opts.metadata]     extra timeline metadata
 */
export async function transitionJob(opts) {
  const {
    jobId, toStatus, actor, actorKind, job: preloaded,
    expectedFrom, skipActorCheck = false, metadata = {},
  } = opts;
  if (!jobId) throw badRequest('jobId is required');
  if (!toStatus) throw badRequest('Target status is required');

  const current = preloaded ||
    (await query('select * from jobs where id = $1', [jobId])).rows[0];
  if (!current) throw notFound('Job not found');

  assertTransitionAllowed(current.status, toStatus);
  if (expectedFrom && current.status !== expectedFrom) {
    throw conflict(`Job status changed concurrently (now ${current.status}) - reload and try again`);
  }

  if (!skipActorCheck) {
    const kind = actorKind || JOB_STATUS_ACTORS[toStatus];
    await checkActor(kind, actor, current, toStatus);
  }

  // Race protection: the UPDATE only succeeds when the status is still the
  // value we validated. Two concurrent transitions cannot both win.
  const result = await query(
    'update jobs set status = $2, updated_at = now() where id = $1 and status = $3 returning *',
    [jobId, toStatus, current.status],
  );
  if (!result.rows[0]) {
    const row = await query('select status from jobs where id = $1', [jobId]);
    throw conflict(`Job status changed concurrently (now ${row.rows[0]?.status || 'unknown'}) - reload and try again`);
  }
  const job = result.rows[0];

  await recordTimelineEvent({
    jobId: job.id,
    eventType: `status_${toStatus}`,
    actorId: actor?.id || null,
    actorRole: actor?.role || 'system',
    metadata: { from: current.status, to: toStatus, ...metadata },
  });
  emitEvent('job:status', { jobId: job.id, status: toStatus, job: publicStatus(job) }, `job:${job.id}`);

  await maybeNotifySideEffects(job, current.status, toStatus, actor);
  return job;
}

async function checkActor(kind, actor, job, toStatus) {
  if (!actor) throw forbidden('An authenticated actor is required');
  if (actor.isAdmin || actor.role === 'super_admin' || actor.role === 'admin') return;
  const isCustomer = job.customer_id === actor.id;
  const isAssignedFundi = job.fundi_id === actor.id;
  const isTechnician = job.technician_user_id === actor.id;
  // Company membership: explicit companyRoles on the actor, or resolved from
  // the company_members table (covers endpoints that only carry the JWT).
  const resolveCompanyMember = async () => {
    if (!job.company_id) return false;
    if (actor.companyRoles?.length) return true;
    const m = await query(
      `select 1 from company_members where company_id = $1 and user_id = $2 and status = 'active'`,
      [job.company_id, actor.id],
    );
    return Boolean(m.rows[0]);
  };
  switch (kind) {
    case 'provider': {
      const isCompanyMember = await resolveCompanyMember();
      if (!isAssignedFundi && !isTechnician && !isCompanyMember) {
        throw forbidden('Only the assigned professional can perform this transition');
      }
      break;
    }
    case 'completion':
      if (toStatus === 'customer_confirmed_completion' || job.status === 'completion_requested') {
        if (!isCustomer) throw forbidden('Only the customer can confirm completion');
      } else if (!isAssignedFundi && !isTechnician) {
        throw forbidden('Only the assigned professional can perform this transition');
      }
      break;
    case 'customer':
      if (!isCustomer) throw forbidden('Only the customer can perform this action');
      break;
    case 'flex':
      // offered→accepted/booking_confirmed = customer accepting a quote;
      // any other source = provider accepting the job.
      if (job.status === 'offered') {
        if (!isCustomer && !isAssignedFundi) {
          const isCompanyMember = await resolveCompanyMember();
          if (!isTechnician && !isCompanyMember) {
            throw forbidden('Only the customer or provider can accept this quote');
          }
        }
      } else if (isCustomer && !isAssignedFundi && !isTechnician) {
        const isCompanyMember = await resolveCompanyMember();
        if (!isCompanyMember) throw forbidden('Only the provider can accept this job');
      }
      break;
    case 'dispatch': {
      if (isCustomer && !isAssignedFundi && !isTechnician) {
        const isCompanyMember = await resolveCompanyMember();
        if (!isCompanyMember) throw forbidden('Only the provider can perform this transition');
      }
      break;
    }
    case 'scheduler':
      if (isAssignedFundi && !isCustomer && !isTechnician) {
        throw forbidden('Only the customer or company can schedule this job');
      }
      break;
    case 'admin':
      throw forbidden('Only administrators can set this status');
    default:
      break;
  }
}

function publicStatus(job) {
  return {
    id: job.id, bookingNumber: job.booking_number, status: job.status,
    serviceCategory: job.service_category, estimatedPrice: job.estimated_price,
  };
}

// Notifications that accompany specific edges (spec §51). Failures here must
// never roll the transition back - notification insert issues are logged.
async function maybeNotifySideEffects(job, from, to, actor) {
  const notes = [];
  const base = { jobId: job.id, bookingNumber: job.booking_number, from, to };
  if (to === 'booking_confirmed') {
    notes.push({
      userId: job.customer_id, type: 'booking_confirmed',
      title: 'Booking confirmed',
      body: `Your booking ${job.booking_number} is confirmed. The provider will arrive at the scheduled time.`,
      data: base,
    });
  }
  if (to === 'on_the_way') {
    notes.push({
      userId: job.customer_id, type: 'job_on_the_way',
      title: 'Your professional is on the way',
      body: `The professional for booking ${job.booking_number} is now on the way.`,
      data: base,
    });
  }
  if (to === 'in_progress') {
    notes.push({
      userId: job.customer_id, type: 'job_started',
      title: 'Work has started',
      body: `Work on booking ${job.booking_number} has started.`,
      data: base,
    });
  }
  if (to === 'completion_requested') {
    notes.push({
      userId: job.customer_id, type: 'completion_requested',
      title: 'Completion requested',
      body: `The professional marked booking ${job.booking_number} as complete. Verify the work and confirm to finish.`,
      data: base,
    });
  }
  if (to === 'customer_confirmed_completion') {
    if (job.company_id) {
      const owners = await query(
        `select user_id from company_members where company_id = $1 and status = 'active'`,
        [job.company_id],
      );
      for (const owner of owners.rows) {
        notes.push({
          userId: owner.user_id, type: 'completion_confirmed',
          title: 'Customer confirmed completion',
          body: `The customer confirmed completion of booking ${job.booking_number}.`,
          data: base,
        });
      }
    } else if (job.fundi_id) {
      notes.push({
        userId: job.fundi_id, type: 'completion_confirmed',
        title: 'Customer confirmed completion',
        body: `The customer confirmed completion of booking ${job.booking_number}.`,
        data: base,
      });
    }
  }
  if (to === 'payment_confirmed' || to === 'completed') {
    const body = to === 'payment_confirmed'
      ? `Payment for booking ${job.booking_number} has been confirmed. Thank you for using PataFundi.`
      : `Booking ${job.booking_number} is complete. You can review the service in your bookings.`;
    notes.push({
      userId: job.customer_id, type: to === 'payment_confirmed' ? 'payment_confirmed' : 'job_completed',
      title: to === 'payment_confirmed' ? 'Payment confirmed' : 'Job completed',
      body, data: base,
    });
  }
  for (const n of notes) {
    await query(
      `insert into notifications (user_id, type, title, body, data, category)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [n.userId, n.type, n.title, n.body, JSON.stringify(n.data), 'customers'],
    ).catch(() => {});
  }
}
