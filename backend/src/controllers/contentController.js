import { query, transaction } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { detectBypass, recordFraudAlert } from '../services/fraudService.js';
import { auditLog } from '../services/auditService.js';
import { logNonFatal } from '../utils/logError.js';

const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export async function supportTicket(req, res) {
  const { name = null, email = null, subject = null, message = '', priority = 'normal' } = req.body || {};
  if (!message.trim()) throw badRequest('Message is required');
  if (!TICKET_PRIORITIES.includes(priority)) {
    throw badRequest(`Valid priorities: ${TICKET_PRIORITIES.join(', ')}`);
  }
  // Authenticated filers get their user attached so they can follow up on the
  // thread from the app (spec §71); anonymous filers keep the email fallback.
  const userId = req.user?.id || null;
  const attachmentUrl = typeof req.body?.attachmentUrl === 'string' ? req.body.attachmentUrl.slice(0, 500) : null;
  const result = await transaction(async (client) => {
    const ticket = await client.query(
      `insert into support_tickets (name, email, subject, message, priority, user_id)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [userId ? null : name, userId ? null : email, subject, message, priority, userId],
    );
    await client.query(
      `insert into support_ticket_messages (ticket_id, author_id, author_role, body, attachment_url)
       values ($1, $2, 'customer', $3, $4)`,
      [ticket.rows[0].id, userId, message, attachmentUrl],
    );
    return ticket.rows[0];
  });
  res.status(201).json({ success: true, ticket: result });
}

/** GET /api/support/tickets/mine — the authenticated user's tickets with threads (spec §71). */
export async function mySupportTickets(req, res) {
  const tickets = await query(
    `select t.*,
            (select json_agg(json_build_object(
                'id', m.id, 'authorRole', m.author_role, 'body', m.body,
                'attachmentUrl', m.attachment_url, 'createdAt', m.created_at)
                order by m.created_at asc)
             from support_ticket_messages m where m.ticket_id = t.id) as messages
     from support_tickets t
     where t.user_id = $1
     order by t.created_at desc limit 50`,
    [req.user.id],
  );
  res.json({ success: true, tickets: tickets.rows });
}

/** GET /api/support/tickets/:id — one ticket with its thread (owner or staff only). */
export async function getSupportTicket(req, res) {
  const staffRoles = ['admin', 'super_admin', 'support_agent', 'fraud_analyst', 'finance_team', 'dispatch_team', 'devops_engineer', 'auditor'];
  const ticket = await query(`select * from support_tickets where id = $1`, [req.params.id]);
  if (!ticket.rows[0]) throw notFound('Ticket not found');
  const t = ticket.rows[0];
  const isStaff = staffRoles.includes(req.user.role);
  if (t.user_id !== req.user.id && !isStaff) {
    return res.status(403).json({ success: false, message: 'You can only view your own tickets' });
  }
  const messages = await query(
    `select id, author_role, body, attachment_url, created_at
     from support_ticket_messages where ticket_id = $1 order by created_at asc limit 200`,
    [req.params.id],
  );
  res.json({
    success: true,
    ticket: { ...t, internal_notes: isStaff ? t.internal_notes : undefined },
    messages: messages.rows,
  });
}

/** POST /api/support/tickets/:id/messages — filer replies on their own ticket. */
export async function replySupportTicket(req, res) {
  const { message = '', attachmentUrl = null } = req.body || {};
  if (!message.trim()) throw badRequest('Message is required');
  const ticket = await query(`select * from support_tickets where id = $1`, [req.params.id]);
  if (!ticket.rows[0]) throw notFound('Ticket not found');
  if (ticket.rows[0].user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'You can only reply to your own tickets' });
  }
  const inserted = await query(
    `insert into support_ticket_messages (ticket_id, author_id, author_role, body, attachment_url)
     values ($1, $2, 'customer', $3, $4) returning *`,
    [req.params.id, req.user.id, message, attachmentUrl],
  );
  await query(`update support_tickets set status = 'open', updated_at = now() where id = $1 and status = 'waiting_customer'`, [req.params.id]);
  res.status(201).json({ success: true, message: inserted.rows[0] });
}

/** GET /api/admin/support/tickets — list tickets with search + filter (staff only) */
export async function listSupportTickets(req, res) {
  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;

  const params = [];
  const filters = [];
  if (status) { params.push(status); filters.push(`status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(name ilike $${params.length} or email ilike $${params.length} or subject ilike $${params.length} or message ilike $${params.length})`);
  }
  const where = filters.length ? `where ${filters.join(' and ')}` : '';

  const countResult = await query(`select count(*)::int as total from support_tickets ${where}`, params);
  const total = countResult.rows[0]?.total || 0;

  params.push(limit, offset);
  const result = await query(
    `select * from support_tickets ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  res.json({
    success: true,
    tickets: result.rows,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}

const TICKET_STATUSES = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];

/** PATCH /api/admin/support/tickets/:id — status, assignment, internal notes, priority (staff only) */
export async function updateSupportTicket(req, res) {
  const { status, internalNote = null, assignedTo = undefined, priority } = req.body || {};
  if (status && !TICKET_STATUSES.includes(status)) {
    throw badRequest(`Valid statuses: ${TICKET_STATUSES.join(', ')}`);
  }
  if (priority && !TICKET_PRIORITIES.includes(priority)) {
    throw badRequest(`Valid priorities: ${TICKET_PRIORITIES.join(', ')}`);
  }
  if (!status && internalNote == null && assignedTo === undefined && !priority) {
    throw badRequest('Nothing to update: provide status, internalNote, assignedTo or priority');
  }
  // Validate assignee exists and is platform staff (least privilege, spec §20).
  let assigneeId = null;
  let assigneeCleared = false;
  if (assignedTo !== undefined) {
    if (assignedTo === null) {
      assigneeCleared = true;
    } else {
      const staff = await query(
        `select id from users where id = $1 and role in ('admin','super_admin','support_agent','fraud_analyst','finance_team','dispatch_team','devops_engineer','auditor')`,
        [assignedTo],
      );
      if (!staff.rows[0]) throw badRequest('assignedTo must be a platform staff member');
      assigneeId = staff.rows[0].id;
    }
  }
  const result = await query(
    `update support_tickets set
       status = coalesce($2, status),
       internal_notes = case when $3::text is not null then $3 else internal_notes end,
       assigned_to = case
         when $4::boolean then null
         when $5::uuid is not null then $5
         else assigned_to end,
       priority = coalesce($6, priority),
       updated_at = now()
     where id = $1 returning *`,
    [req.params.id, status || null, internalNote, assigneeCleared, assigneeId, priority || null],
  );
  if (!result.rows[0]) throw notFound('Ticket not found');
  await auditLog({
    userId: req.user.id,
    action: 'support.ticket_update',
    entityType: 'support_ticket',
    entityId: req.params.id,
    metadata: { status: status || null, internalNote: internalNote ? String(internalNote).slice(0, 200) : null, assignedTo: assigneeId, assignedToCleared: assigneeCleared, priority: priority || null },
  });
  res.json({ success: true, ticket: result.rows[0] });
}

/** GET /api/admin/support/tickets/:id/messages — full thread for staff (spec §71). */
export async function adminTicketMessages(req, res) {
  const messages = await query(
    `select m.*, u.email as author_email
     from support_ticket_messages m left join users u on u.id = m.author_id
     where m.ticket_id = $1 order by m.created_at asc limit 200`,
    [req.params.id],
  );
  res.json({ success: true, messages: messages.rows });
}

/** POST /api/admin/support/tickets/:id/messages — staff reply on the thread. */
export async function adminReplyTicket(req, res) {
  const { message = '', attachmentUrl = null } = req.body || {};
  if (!message.trim()) throw badRequest('Message is required');
  const ticket = await query(`select id from support_tickets where id = $1`, [req.params.id]);
  if (!ticket.rows[0]) throw notFound('Ticket not found');
  const inserted = await query(
    `insert into support_ticket_messages (ticket_id, author_id, author_role, body, attachment_url)
     values ($1, $2, 'staff', $3, $4) returning *`,
    [req.params.id, req.user.id, message, attachmentUrl],
  );
  // A staff reply means the ball is in the customer's court.
  await query(`update support_tickets set status = 'waiting_customer', updated_at = now() where id = $1 and status in ('open', 'in_progress')`, [req.params.id]);
  await auditLog({
    userId: req.user.id,
    action: 'support.ticket_reply',
    entityType: 'support_ticket',
    entityId: req.params.id,
  });
  res.status(201).json({ success: true, message: inserted.rows[0] });
}

export async function fraudReport(req, res) {
  const content = req.body?.content || req.body?.messagePreview || '';
  const detection = detectBypass(content);
  const reportedUserId = req.body?.reportedUserId || req.body?.userId;
  if (!req.user?.id && !req.body?.email) {
    throw badRequest('Authentication or contact email required for fraud reports');
  }
  // IDOR guard (spec §10): an authenticated reporter may only attach a job to
  // a fraud report if they are actually a party to it. Anonymous reporters are
  // still allowed (contact email required) but cannot reference job IDs.
  const jobId = req.body?.jobId || req.params?.jobId || null;
  if (jobId && req.user?.id) {
    const jobCheck = await query('select customer_id, fundi_id, technician_user_id, company_id from jobs where id = $1', [jobId]);
    const job = jobCheck.rows[0];
    if (job) {
      let isParty = [job.customer_id, job.fundi_id, job.technician_user_id].includes(req.user.id);
      if (!isParty && job.company_id) {
        const member = await query(
          'select 1 from company_members where company_id = $1 and user_id = $2 limit 1',
          [job.company_id, req.user.id],
        );
        isParty = Boolean(member.rows[0]);
      }
      if (!isParty && req.user.role !== 'admin') {
        delete req.body.jobId; // strip the unverifiable reference, keep the report
      }
    } else {
      delete req.body.jobId;
    }
  }
  if (detection.isBypass && reportedUserId && req.user?.role === 'admin') {
    await recordFraudAlert({
      jobId: jobId && req.user?.id ? jobId : null,
      userId: reportedUserId,
      userRole: req.body.userRole || 'unknown',
      content,
      detection,
      source: 'admin_report',
    });
  }
  if (jobId) {
    await query(
      `insert into support_tickets (name, email, subject, message, status)
       values ($1, $2, $3, $4, 'open')`,
      [
        req.user?.full_name || req.body?.name || 'Anonymous',
        req.user?.email || req.body?.email,
        'Fraud Report',
        content || 'Fraud report submitted',
      ],
    );
  }
  res.json({ success: true, detection, message: 'Report received' });
}

export function genericList(key) {
  return async (_req, res) => {
    const tableMap = {
      posts: { table: 'blog_posts', columns: 'slug, title, excerpt, published_at, author' },
      jobs: { table: 'career_jobs', columns: 'id, title, department, location, type, status' },
    };
    const config = tableMap[key];
    if (!config) {
      // Fallback to hardcoded for unknown keys
      const data = { posts: [], jobs: [] };
      return res.json({ success: true, [key]: data[key] || [] });
    }
    try {
      const result = await query(`select ${config.columns} from ${config.table} where status = 'published' or status = 'open' order by created_at desc`);
      res.json({ success: true, [key]: result.rows });
    } catch {
      // Table might not exist yet — return empty
      res.json({ success: true, [key]: [] });
    }
  };
}

export async function blogPost(req, res) {
  try {
    const result = await query('select * from blog_posts where slug = $1 and status = $2', [req.params.slug, 'published']);
    res.json({ success: true, post: result.rows[0] || null });
  } catch {
    res.json({ success: true, post: null });
  }
}

export async function help(_req, res) {
  res.json({
    success: true,
    categories: [
      { id: 'bookings', title: 'Bookings' },
      { id: 'quotes', title: 'Quotes' },
      { id: 'payments', title: 'Payments' },
      { id: 'refunds', title: 'Refunds' },
      { id: 'cancellations', title: 'Cancellations' },
      { id: 'safety', title: 'Safety' },
      { id: 'accounts', title: 'Accounts' },
      { id: 'fundis', title: 'Fundis' },
      { id: 'companies', title: 'Companies' },
      { id: 'reviews', title: 'Reviews' },
      { id: 'disputes', title: 'Disputes' },
      { id: 'location', title: 'Location' },
      { id: 'notifications', title: 'Notifications' },
    ],
    faqs: [
      // Bookings
      { id: 'faq-booking-1', question: 'How do I book a service?', answer: 'Pick a service, describe your problem, add photos, choose your location and time, then confirm. You can book an individual fundi or a company - both are verified through the platform.', category: 'bookings' },
      { id: 'faq-booking-2', question: 'What is a booking number?', answer: 'Every booking gets a permanent number like PF-2026-000001 when it is created. Quote it when contacting support, reference it in receipts, disputes and payments - it identifies your booking across the whole platform.', category: 'bookings' },
      { id: 'faq-booking-3', question: 'How do I track my booking?', answer: 'Open the booking from My Bookings. You see live status: quote review, booking confirmed, professional on the way, checked in, work in progress, completion confirmation and payment.', category: 'bookings' },
      { id: 'faq-booking-4', question: 'When is a booking actually completed?', answer: 'Only after the real work: the professional finishes, requests completion, you verify the work and confirm with the one-time code, and payment is finalized. A price quote is never a completed job.', category: 'bookings' },
      // Quotes
      { id: 'faq-quote-1', question: 'I received a quote - what do I do?', answer: 'Open the booking from your notification or My Bookings. You will see the quote from the company or professional: total price, breakdown, estimated duration, notes and expiry. You can accept it, decline it, or ask a question before deciding.', category: 'quotes' },
      { id: 'faq-quote-2', question: 'Does receiving a quote mean the job is done?', answer: 'No. A quote is only a proposed price. The booking only moves forward when you accept the quote, and the job is only completed after the work is performed and you confirm it.', category: 'quotes' },
      { id: 'faq-quote-3', question: 'What happens if I decline a quote?', answer: 'The quote is marked declined and your booking stays open - you can receive another quote, cancel the booking, or ask support to step in. Nothing is charged for declining.', category: 'quotes' },
      { id: 'faq-quote-4', question: 'Do quotes expire?', answer: 'Yes. Every quote carries an expiry time set by the provider (72 hours by default). Expired quotes are marked expired automatically and the booking stays available.', category: 'quotes' },
      // Payments
      { id: 'faq-pay-1', question: 'How is payment protected?', answer: 'Customer payments are held in escrow until completion is confirmed. The fundi or company is only paid after you confirm the job is done with your one-time confirmation code.', category: 'payments' },
      { id: 'faq-pay-2', question: 'Can I pay outside PataFundi?', answer: 'No. Off-platform payments are blocked to protect both sides. Sharing phone numbers or M-Pesa details in chat triggers fraud alerts and can lead to suspension.', category: 'payments' },
      { id: 'faq-pay-3', question: 'Which payment methods are supported?', answer: 'M-Pesa is supported in Kenya, with Stripe for card payments where configured. Your available methods are shown at checkout.', category: 'payments' },
      // Refunds
      { id: 'faq-refund-1', question: 'How do I request a refund?', answer: 'Open the completed booking and use the refund request option, or contact support. Requests are reviewed by our team: REQUESTED, UNDER_REVIEW, APPROVED or REJECTED, then PROCESSING and REFUNDED.', category: 'refunds' },
      { id: 'faq-refund-2', question: 'When do refunds apply?', answer: 'Refunds apply when work was not performed as agreed, was incomplete, or the charge was incorrect. Each case is investigated with the evidence you provide.', category: 'refunds' },
      // Cancellations
      { id: 'faq-cancel-1', question: 'How do I cancel a booking?', answer: 'Open the booking and use Cancel. Bookings can be cancelled while they are still pending, in matching or in the quote phase. Once work has started, use support or a dispute instead.', category: 'cancellations' },
      { id: 'faq-cancel-2', question: 'What happens if the professional cancels?', answer: 'The booking returns to matching and other professionals can accept it. Repeated cancellations by a provider lower their standing on the platform.', category: 'cancellations' },
      // Safety
      { id: 'faq-safety-1', question: 'Is my data safe?', answer: 'Yes. Your ID documents are stored privately with signed-URL access. Only authorized verification staff can view them, every access is logged, and OCR never auto-approves a document.', category: 'safety' },
      { id: 'faq-safety-2', question: 'What should I do in an emergency?', answer: 'Contact your local emergency service first. PataFundi is not an emergency-response organization. Then notify support so we can act on the account involved.', category: 'safety' },
      // Accounts
      { id: 'faq-account-1', question: 'How do I reset my password?', answer: 'Click "Forgot password" on the login page. You will receive a 6-digit code to reset your password.', category: 'accounts' },
      { id: 'faq-account-2', question: 'How do I delete my account or export my data?', answer: 'Contact support with an account-data request. You can request a copy of your data or deletion of your account, subject to legal record-keeping obligations.', category: 'accounts' },
      // Fundis
      { id: 'faq-fundi-1', question: 'How do I become a fundi?', answer: 'Register as a fundi, upload your ID and a selfie for verification, pick your skills and service area, and wait for admin review. Your profile shows Pending until verification completes.', category: 'fundis' },
      { id: 'faq-fundi-2', question: 'What do verification badges mean?', answer: 'ID Verified means your government ID passed document verification. Skill Verified means your trade qualifications were checked. Badges only appear after real checks - never just for uploading a photo.', category: 'fundis' },
      // Companies
      { id: 'faq-company-1', question: 'How does a company join PataFundi?', answer: 'Submit a partner application with your business details, upload your business registration and owner identification documents, then submit for verification. An admin reviews the documents before your company is verified and listed.', category: 'companies' },
      { id: 'faq-company-2', question: 'Why is a company not bookable?', answer: 'A company only appears bookable when it is approved, document-verified, active and (where required) has a valid subscription. Anything else and it will not appear in the marketplace.', category: 'companies' },
      // Reviews
      { id: 'faq-review-1', question: 'Who can leave a review?', answer: 'Only customers with a completed, confirmed booking can review the provider. Fake, duplicate or self-reviews are blocked, and providers can post one public reply to each review.', category: 'reviews' },
      // Disputes
      { id: 'faq-dispute-1', question: 'What if I have a dispute?', answer: 'File a dispute from your booking page with evidence. Our team investigates, escrow can be frozen while a case is open, and outcomes include refunds, partial refunds or dismissal.', category: 'disputes' },
      { id: 'faq-dispute-2', question: 'Can professionals open disputes?', answer: 'Yes. Fundis and companies can report false complaints, payment issues, customer misconduct and cancellation issues through the same dispute system.', category: 'disputes' },
      // Location
      { id: 'faq-location-1', question: 'Why do you need my location?', answer: 'Location powers nearby matching and accurate arrival tracking. You can grant permission, search manually instead, or continue without it - matching still works, just without distance ranking.', category: 'location' },
      // Notifications
      { id: 'faq-notif-1', question: 'What notifications will I get?', answer: 'Booking updates (quote received, accepted, on the way, started, completion requested, payment confirmed), replies to your messages, dispute and verification updates, and security alerts. You can read them all in the notifications page.', category: 'notifications' },
    ],
  });
}

/** Split a markdown policy body on '## ' headings into renderable sections. */
function policyBodyToSections(body) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const parts = text.split(/\n(?=## )/g).map((chunk) => chunk.trim()).filter(Boolean);
  return parts.map((chunk, idx) => {
    const m = chunk.match(/^##\s+([^\n]+)/);
    const title = m ? m[1].replace(/^\d+\.\s*/, '').trim() : `Section ${idx + 1}`;
    const content = m ? chunk.slice(m[0].length).trim() : chunk;
    return { id: `s${idx + 1}`, title, content, order: idx + 1 };
  });
}

export async function policy(req, res) {
  try {
    const result = await query('select * from policies where slug = $1 and status = $2', [req.params.slug, 'active']);
    if (result.rows[0]) {
      const row = result.rows[0];
      res.json({
        success: true,
        policy: {
          slug: row.slug,
          title: row.title,
          version: `v${row.version}`,
          sections: policyBodyToSections(row.body),
        },
      });
      return;
    }
  } catch (error) {
    logNonFatal('content.policyLookup', error, { slug: req.params.slug });
  }
  // Fallback mirrors the DB shape (structured sections) so the page renders
  // even before migration 040 has run.
  const policies = {
    privacy: { slug: 'privacy', title: 'Privacy Policy', body: 'PataFundi stores account, job, payment, and safety data needed to operate the platform. We never sell your data. Verification documents are stored in a private bucket with signed URL access only.' },
    terms: { slug: 'terms', title: 'Terms of Service', body: 'Users must keep communication and payments on-platform and comply with local law. Off-platform payments are blocked and may result in account suspension.' },
    safety: { slug: 'safety', title: 'Safety Policy', body: 'Fraud, harassment, unsafe work, and off-platform payment solicitation can lead to restrictions.' },
  };
  const p = policies[req.params.slug];
  if (!p) {
    res.json({ success: true, policy: null });
    return;
  }
  res.json({
    success: true,
    policy: { slug: p.slug, title: p.title, version: 'v1', sections: policyBodyToSections(p.body) },
  });
}

export async function service(req, res) {
  try {
    const result = await query('select * from service_categories where slug = $1 and is_active = true', [req.params.slug]);
    if (result.rows[0]) {
      // Also fetch approved fundis for this service
      const fundis = await query(
        `select f.user_id, u.full_name as name, f.skills, f.rating, f.trust_score
         from fundis f join users u on u.id = f.user_id
         where f.approval_status = 'approved' and $1 = any(f.skills)
         limit 10`,
        [result.rows[0].title],
      );
      res.json({ success: true, service: result.rows[0], fundis: fundis.rows });
      return;
    }
  } catch (error) {
    logNonFatal('content.serviceLookup', error, { slug: req.params.slug });
  }
  const services = {
    plumbing: { slug: 'plumbing', title: 'Plumbing', description: 'Leaks, fixtures, drainage, and urgent plumbing repairs.' },
    electrical: { slug: 'electrical', title: 'Electrical', description: 'Fault diagnosis, wiring, lighting, and appliance electrical work.' },
    cleaning: { slug: 'cleaning', title: 'Cleaning', description: 'Home and office cleaning with vetted professionals.' },
  };
  res.json({ success: true, service: services[req.params.slug] || null, fundis: [] });
}

export async function careerApply(req, res) {
  const { jobId = null, fullName = '', email = '', phone = '', coverLetter = '', resumeUrl = '', linkedinUrl = '', portfolioUrl = '' } = req.body || {};
  if (!fullName.trim() || !email.trim()) {
    return res.status(400).json({ success: false, message: 'Full name and email are required' });
  }
  const result = await query(
    `insert into career_applications (job_id, full_name, email, phone, cover_letter, resume_url, linkedin_url, portfolio_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, status, applied_at`,
    [jobId, fullName.trim(), email.trim().toLowerCase(), phone.trim() || null, coverLetter.trim() || null, resumeUrl.trim() || null, linkedinUrl.trim() || null, portfolioUrl.trim() || null],
  );
  res.status(201).json({ success: true, application: result.rows[0] });
}

export async function listCareerApplications(req, res) {
  const status = req.query.status || 'pending';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const result = await query(
    `select ca.*, cj.title as job_title, cj.department
     from career_applications ca
     left join career_jobs cj on cj.id = ca.job_id
     where ca.status = $1
     order by ca.applied_at desc limit $2`,
    [status, limit],
  );
  res.json({ success: true, applications: result.rows });
}

// ────────────────────────────────────────────────────────────────────────────
// Admin content management (spec §46-47): blog posts + career jobs are real
// database-backed content. Admins can create, edit, publish and retire them.
// ────────────────────────────────────────────────────────────────────────────
function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || `post-${Date.now()}`;
}

export async function adminListBlogPosts(_req, res) {
  const result = await query(
    `select id, slug, title, excerpt, author, status, published_at, created_at, updated_at
     from blog_posts order by created_at desc limit 200`,
  );
  res.json({ success: true, posts: result.rows });
}

export async function adminCreateBlogPost(req, res) {
  const { title, excerpt = null, body, author = 'PataFundi Team', status = 'draft', publishedAt = null } = req.body || {};
  if (!String(title || '').trim()) throw badRequest('Title is required');
  if (!String(body || '').trim()) throw badRequest('Body is required');
  if (!['draft', 'published', 'archived'].includes(status)) throw badRequest('Invalid status');
  const slug = slugify(req.body?.slug || title);
  const existing = await query('select 1 from blog_posts where slug = $1', [slug]);
  if (existing.rows[0]) throw badRequest('A post with this slug already exists');
  const result = await query(
    `insert into blog_posts (slug, title, excerpt, body, author, status, published_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [slug, title.trim(), excerpt, body, author, status, status === 'published' ? (publishedAt || new Date().toISOString()) : publishedAt],
  );
  await auditLog({
    userId: req.user.id, action: 'content.blog_created',
    entityType: 'blog_post', entityId: result.rows[0].id,
    metadata: { slug, title, status },
  });
  res.status(201).json({ success: true, post: result.rows[0] });
}

export async function adminUpdateBlogPost(req, res) {
  const allowed = ['title', 'excerpt', 'body', 'author', 'status'];
  const updates = [];
  const params = [];
  for (const field of allowed) {
    if (req.body?.[field] !== undefined) {
      params.push(req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (req.body?.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(req.body.status)) throw badRequest('Invalid status');
    if (req.body.status === 'published') {
      params.push(new Date().toISOString());
      updates.push(`published_at = coalesce(published_at, $${params.length})`);
    }
  }
  if (!updates.length) throw badRequest('Nothing to update');
  params.push(req.params.id, new Date().toISOString());
  const result = await query(
    `update blog_posts set ${updates.join(', ')}, updated_at = $${params.length} where id = $${params.length - 1} returning *`,
    params,
  );
  if (!result.rows[0]) throw notFound('Post not found');
  await auditLog({
    userId: req.user.id, action: 'content.blog_updated',
    entityType: 'blog_post', entityId: req.params.id,
    metadata: { fields: allowed.filter((f) => req.body?.[f] !== undefined) },
  });
  res.json({ success: true, post: result.rows[0] });
}

export async function adminDeleteBlogPost(req, res) {
  const result = await query('delete from blog_posts where id = $1 returning id, slug', [req.params.id]);
  if (!result.rows[0]) throw notFound('Post not found');
  await auditLog({
    userId: req.user.id, action: 'content.blog_deleted',
    entityType: 'blog_post', entityId: req.params.id,
    metadata: { slug: result.rows[0].slug },
  });
  res.json({ success: true });
}

export async function adminListCareerJobs(_req, res) {
  const result = await query(
    `select id, title, department, location, type, status, created_at
     from career_jobs order by created_at desc limit 200`,
  );
  res.json({ success: true, jobs: result.rows });
}

export async function adminCreateCareerJob(req, res) {
  const { title, department = null, location = 'Nairobi, Kenya', type = 'Full-time', description = null, requirements = null, status = 'open' } = req.body || {};
  if (!String(title || '').trim()) throw badRequest('Title is required');
  if (!['Full-time', 'Part-time', 'Contract', 'Internship'].includes(type)) throw badRequest('Invalid job type');
  if (!['open', 'closed', 'filled'].includes(status)) throw badRequest('Invalid status');
  const result = await query(
    `insert into career_jobs (title, department, location, type, description, requirements, status)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [title.trim(), department, location, type, description, requirements, status],
  );
  await auditLog({
    userId: req.user.id, action: 'content.career_job_created',
    entityType: 'career_job', entityId: result.rows[0].id,
    metadata: { title, status },
  });
  res.status(201).json({ success: true, job: result.rows[0] });
}

export async function adminUpdateCareerJob(req, res) {
  const allowed = ['title', 'department', 'location', 'type', 'description', 'requirements', 'status'];
  const updates = [];
  const params = [];
  for (const field of allowed) {
    if (req.body?.[field] !== undefined) {
      if (field === 'type' && !['Full-time', 'Part-time', 'Contract', 'Internship'].includes(req.body.type)) {
        throw badRequest('Invalid job type');
      }
      if (field === 'status' && !['open', 'closed', 'filled'].includes(req.body.status)) {
        throw badRequest('Invalid status');
      }
      params.push(req.body[field]);
      updates.push(`${field} = $${params.length}`);
    }
  }
  if (!updates.length) throw badRequest('Nothing to update');
  params.push(req.params.id);
  const result = await query(
    `update career_jobs set ${updates.join(', ')} where id = $${params.length} returning *`,
    params,
  );
  if (!result.rows[0]) throw notFound('Career job not found');
  await auditLog({
    userId: req.user.id, action: 'content.career_job_updated',
    entityType: 'career_job', entityId: req.params.id,
    metadata: { fields: allowed.filter((f) => req.body?.[f] !== undefined) },
  });
  res.json({ success: true, job: result.rows[0] });
}

export async function adminDeleteCareerJob(req, res) {
  const inUse = await query('select 1 from career_applications where job_id = $1 limit 1', [req.params.id]);
  if (inUse.rows[0]) {
    // Retire instead of delete when applications reference the job.
    const result = await query(`update career_jobs set status = 'closed' where id = $1 returning id, status`, [req.params.id]);
    if (!result.rows[0]) throw notFound('Career job not found');
    res.json({ success: true, closed: true, job: result.rows[0] });
    return;
  }
  const result = await query('delete from career_jobs where id = $1 returning id', [req.params.id]);
  if (!result.rows[0]) throw notFound('Career job not found');
  await auditLog({
    userId: req.user.id, action: 'content.career_job_deleted',
    entityType: 'career_job', entityId: req.params.id, metadata: {},
  });
  res.json({ success: true });
}
