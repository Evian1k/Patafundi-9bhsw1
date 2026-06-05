import { query } from '../db.js';
import { badRequest } from '../utils/http.js';
import { detectBypass, recordFraudAlert } from '../services/fraudService.js';

export async function supportTicket(req, res) {
  const { name = null, email = null, subject = null, message = '' } = req.body || {};
  if (!message.trim()) throw badRequest('Message is required');
  const result = await query(
    `insert into support_tickets (name, email, subject, message) values ($1, $2, $3, $4) returning *`,
    [name, email, subject, message],
  );
  res.status(201).json({ success: true, ticket: result.rows[0] });
}

export async function fraudReport(req, res) {
  const content = req.body?.content || req.body?.messagePreview || '';
  const detection = detectBypass(content);
  if (detection.isBypass && req.body?.userId) {
    await recordFraudAlert({
      jobId: req.body.jobId || null,
      userId: req.body.userId,
      userRole: req.body.userRole || 'unknown',
      content,
      detection,
    });
  }
  res.json({ success: true, detection });
}

export async function genericList(key) {
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
