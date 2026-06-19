-- Migration 016: DB-backed content (blog posts, careers, policies, services)
-- Replaces hardcoded JSON stubs with database tables

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body text not null,
  author text default 'PataFundi Team',
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists career_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  location text default 'Nairobi, Kenya',
  type text default 'Full-time' check (type in ('Full-time', 'Part-time', 'Contract', 'Internship')),
  description text,
  requirements text,
  status text not null default 'open' check (status in ('open', 'closed', 'filled')),
  created_at timestamptz not null default now()
);

create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null,
  version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed default services
insert into service_categories (slug, title, description, icon, sort_order) values
  ('plumbing', 'Plumbing', 'Leaks, fixtures, drainage, and urgent plumbing repairs.', 'wrench', 1),
  ('electrical', 'Electrical', 'Fault diagnosis, wiring, lighting, and appliance electrical work.', 'zap', 2),
  ('cleaning', 'Cleaning', 'Home and office cleaning with vetted professionals.', 'sparkles', 3),
  ('painting', 'Painting', 'Interior and exterior painting services.', 'paintbrush', 4),
  ('mechanic', 'Mechanic', 'Vehicle repair and maintenance at your location.', 'car', 5),
  ('carpentry', 'Carpentry', 'Furniture repair, installation, and custom woodwork.', 'hammer', 6),
  ('moving', 'Moving', 'Relocation and heavy item transport services.', 'truck', 7),
  ('hvac', 'AC & HVAC', 'Air conditioning installation, servicing, and repair.', 'wind', 8)
on conflict (slug) do nothing;

-- Seed default policies
insert into policies (slug, title, body) values
  ('privacy', 'Privacy Policy', 'PataFundi stores account, job, payment, and safety data needed to operate the platform. We never sell your data. Verification documents are stored in a private bucket with signed URL access only.'),
  ('terms', 'Terms of Service', 'Users must keep communication and payments on-platform and comply with local law. Off-platform payments are blocked and may result in account suspension.'),
  ('cookies', 'Cookies Policy', 'PataFundi uses essential cookies for authentication and session management. We do not use third-party tracking cookies.'),
  ('refund-policy', 'Refund Policy', 'Payments held in escrow are refundable if the job is not completed satisfactorily. Refunds are processed within 5 business days after dispute resolution.'),
  ('platform-rules', 'Platform Rules', 'No off-platform payments, no harassment, no fake reviews, no impersonation. Violations result in warnings, suspensions, or permanent bans.'),
  ('enforcement', 'Enforcement Policy', 'PataFundi enforces platform rules through a 4-strike system: warning, temporary suspension, extended suspension, permanent ban. Serious violations may result in immediate ban.'),
  ('safety', 'Safety Policy', 'Fraud, harassment, unsafe work, and off-platform payment solicitation can lead to restrictions. Always keep communication and payments within PataFundi.')
on conflict (slug) do nothing;

-- Seed default blog posts
insert into blog_posts (slug, title, excerpt, body, author) values
  ('staying-safe-with-home-service-bookings', 'Staying safe with home service bookings', 'Practical checks customers and fundis can use before, during, and after a job.', 'Use in-app chat, keep payment in escrow, and report off-platform payment requests immediately. PataFundi verifies every fundi with ID documents and selfie face-match before approval.', 'PataFundi Team')
on conflict (slug) do nothing;

-- Seed default career jobs
insert into career_jobs (title, department, location, type, description) values
  ('Operations Support Associate', 'Operations', 'Nairobi, Kenya', 'Full-time', 'Support our growing marketplace of fundis and customers. Handle disputes, verify fundis, and ensure platform quality.')
on conflict do nothing;
