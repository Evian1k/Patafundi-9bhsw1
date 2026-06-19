import { query } from '../db.js';
import { badRequest, notFound } from '../utils/http.js';
import { detectBypass, recordFraudAlert } from '../services/fraudService.js';
import { auditLog } from '../services/auditService.js';

export async function supportTicket(req, res) {
  const { name = null, email = null, subject = null, message = '' } = req.body || {};
  if (!message.trim()) throw badRequest('Message is required');
  const result = await query(
    `insert into support_tickets (name, email, subject, message) values ($1, $2, $3, $4) returning *`,
    [name, email, subject, message],
  );
  res.status(201).json({ success: true, ticket: result.rows[0] });
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

/** PATCH /api/admin/support/tickets/:id — update ticket status (staff only) */
export async function updateSupportTicket(req, res) {
  const { status, internalNote = null } = req.body || {};
  if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    throw badRequest('Valid status required: open, in_progress, resolved, closed');
  }
  const result = await query(
    `update support_tickets set status = $2, updated_at = now() where id = $1 returning *`,
    [req.params.id, status],
  );
  if (!result.rows[0]) throw notFound('Ticket not found');
  await auditLog({
    userId: req.user.id,
    action: 'support.ticket_update',
    entityType: 'support_ticket',
    entityId: req.params.id,
    metadata: { status, internalNote },
  });
  res.json({ success: true, ticket: result.rows[0] });
}

export async function fraudReport(req, res) {
  const content = req.body?.content || req.body?.messagePreview || '';
  const detection = detectBypass(content);
  const reportedUserId = req.body?.reportedUserId || req.body?.userId;
  if (!req.user?.id && !req.body?.email) {
    throw badRequest('Authentication or contact email required for fraud reports');
  }
  if (detection.isBypass && reportedUserId && req.user?.role === 'admin') {
    await recordFraudAlert({
      jobId: req.body.jobId || req.params?.jobId || null,
      userId: reportedUserId,
      userRole: req.body.userRole || 'unknown',
      content,
      detection,
      source: 'admin_report',
    });
  }
  if (req.body?.jobId || req.params?.jobId) {
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
  return (_req, res) => {
    const data = {
      posts: [
        {
          slug: 'staying-safe-with-home-service-bookings',
          title: 'Staying safe with home service bookings',
          excerpt: 'Practical checks customers and fundis can use before, during, and after a job.',
          publishedAt: '2026-06-01',
        },
      ],
      jobs: [
        {
          id: 'operations-support-associate',
          title: 'Operations Support Associate',
          location: 'Nairobi, Kenya',
          type: 'Full-time',
        },
      ],
    };
    res.json({ success: true, [key]: data[key] || [] });
  };
}

export async function blogPost(req, res) {
  const posts = [
    {
      slug: 'staying-safe-with-home-service-bookings',
      title: 'Staying safe with home service bookings',
      body: 'Use in-app chat, keep payment in escrow, and report off-platform payment requests immediately.',
      publishedAt: '2026-06-01',
    },
  ];
  res.json({ success: true, post: posts.find((post) => post.slug === req.params.slug) || null });
}

export async function help(_req, res) {
  res.json({
    success: true,
    categories: [
      { id: 'customers', title: 'Customers' },
      { id: 'fundis', title: 'Fundis' },
      { id: 'payments', title: 'Payments and escrow' },
    ],
    faqs: [
      { question: 'How is payment protected?', answer: 'Customer payments are held in escrow until completion is confirmed.' },
      { question: 'Can I pay outside PataFundi?', answer: 'No. Off-platform payments are blocked to protect both sides.' },
    ],
  });
}

export async function policy(req, res) {
  const policies = {
    privacy: { slug: 'privacy', title: 'Privacy Policy', body: 'PataFundi stores account, job, payment, and safety data needed to operate the platform.' },
    terms: { slug: 'terms', title: 'Terms of Service', body: 'Users must keep communication and payments on-platform and comply with local law.' },
    safety: { slug: 'safety', title: 'Safety Policy', body: 'Fraud, harassment, unsafe work, and off-platform payment solicitation can lead to restrictions.' },
  };
  res.json({ success: true, policy: policies[req.params.slug] || null });
}

export async function service(req, res) {
  const services = {
    plumbing: { slug: 'plumbing', title: 'Plumbing', description: 'Leaks, fixtures, drainage, and urgent plumbing repairs.' },
    electrical: { slug: 'electrical', title: 'Electrical', description: 'Fault diagnosis, wiring, lighting, and appliance electrical work.' },
    cleaning: { slug: 'cleaning', title: 'Cleaning', description: 'Home and office cleaning with vetted professionals.' },
  };
  res.json({ success: true, service: services[req.params.slug] || null, fundis: [] });
}
