# PataFundi — Screen & Route Matrix

Frontend is a Vite + React SPA (react-router v6). API is Express under `/api/*`.
All screens render responsively (360→1920px); app surfaces add mobile bottom navigation.

Legend: 🔒 = guarded (server-enforced behind the guard) · 🌐 public · 📱 mobile bottom-nav

## Public website
| Route | Screen | Data |
|---|---|---|
| `/` | Landing (hero, services, providers, business, trust) | live testimonials |
| `/services/:slug` | Service marketing + fundi list | `GET /services/:slug` |
| `/companies` | **Company directory (real data)** 📱 | `GET /api/companies` |
| `/companies/:id` | **Company profile — customer-safe + booking** | `GET /api/companies/:id` |
| `/partner-program` | **Partner With PataFundi application (4-step)** | `POST /api/company/applications` |
| `/demo/company` | → redirects to `/companies` | — |
| `/how-it-works /about /careers /blog /press /trust-safety /investors /contact /help /safety-guidelines /contact-support /report-problem /socials` | content pages (Careers/Blog/Help fetch API) | various |
| `/privacy /terms /cookies /refund-policy /platform-rules /enforcement /policies/:slug` | policy pages | `GET /policies/:slug` |

## Auth
| Route | Screen | Notes |
|---|---|---|
| `/auth` `/register/customer` | Login / signup + OTP / forgot password | role-aware redirect after login: admin→`/admin`, fundi→`/fundi`, `company_admin`→`/company`, company members→`/company` (technicians→`/technician`), else `/dashboard` |
| `/register/fundi` | Fundi onboarding (docs upload) | `POST /auth/register/fundi` |
| `/demo` | One-click demo login (dev-only) | all takeover + legacy accounts |

## Customer app
| Route | Screen | Data |
|---|---|---|
| `/dashboard` | Customer home: active/completed jobs, cancel, refer & earn | `GET /users/me`, `GET /jobs` |
| `/create-job` | 4-step booking wizard (property, photos, emergency, schedule) | `POST /jobs` (+propertyId/companyId) |
| `/job/:jobId/tracking` | Live tracking, payment (STK/dev provider), OTP confirm, review | sockets + polling |
| `/settings` | Profile, password, saved places, deletion | `PUT /users/me` |
| `/disputes` | Disputes center | `/disputes` |

## Fundi app (individual professionals)
| Route | Screen |
|---|---|
| `/fundi` | Dashboard: online toggle, GPS stream, job requests, subscription |
| `/fundi/job/:jobId` `/fundi/job/active` | Job execution: check-in, complete + photos |
| `/fundi/wallet` | Balance, transactions, withdrawals |
| `/fundi/pending` `/fundi/resources` `/fundi/app` | onboarding status / resources / app funnel |

## Company portal 🔒 📱 (`requireCompanyMember` per request)
| Route | Screen | Backend |
|---|---|---|
| `/company` | Dashboard — real stats + recent jobs | `GET /company/portal/overview` |
| `/company/jobs` | Dispatch board: Incoming / Dispatch / Open pool / Active / To confirm / Completed; accept, reject, quote, assign/unassign technician | `/company/portal/jobs`, `/company/portal/open-pool`, `/company/jobs/:id/*` |
| `/company/team` | Team CRUD: roles, availability, suspend, temp-password invite | `/company/portal/team` |
| `/company/services` | Service catalog CRUD (customer-safe) | `/company/portal/services` |
| `/company/schedule` | Scheduled jobs + technician availability/workload | `GET /company/portal/schedule` |
| `/company/quality` | Ratings, reviews, aggregates | `GET /company/portal/reviews` |
| `/company/finance` | Earnings, settlements (owner/finance only) | `GET /company/portal/finance` |
| `/company/settings` | Business profile, areas, branches, availability | `GET|PUT /company/portal/profile` |

## Technician experience 🔒 📱
| Route | Screen | Backend |
|---|---|---|
| `/technician` | My jobs only: on the way → arrived → start work, navigation, no finance/company admin | `GET /company/technician/assignments`, `PATCH /jobs/:id/status` |

## Staff portal 🔒 (`/staff` — permission-filtered nav + server RBAC)
| Route | Screen |
|---|---|
| `/staff/login` | Staff-only login |
| `/staff` `/staff/admin` | **Role-specific dashboards** (ops / dispatch / finance / fraud / audit / devops / support) |
| `/staff/dispatch` | Active jobs, online fundis, emergencies |
| `/staff/finance` `/staff/finance/revenue` | Payments, escrow, payouts |
| `/staff/fraud` | Alerts + risk signals |
| `/staff/audit` | Audit trail (read-only) |
| `/staff/devops` | System health + integrations |
| `/staff/support` `/staff/support/disputes` | Disputes & tickets |
| `/staff/operations` `/staff/admin/fundis` `/staff/admin/jobs` `/staff/admin/users` | Live ops + data tables |
| `/staff/executive` `/staff/ai` `/staff/staff-mgmt` `/staff/commission` `/staff/security` `/staff/system` | super_admin surfaces |

## Super admin 🔒 (`/admin` — `ProtectedAdminRoute` + server `requireRole('admin')`)
| Route | Screen |
|---|---|
| `/admin/login` `/admin/dashboard` | login, stats + charts |
| `/admin/fundis` `/admin/customers` `/admin/jobs` | verification, block/unblock, job inspection |
| `/admin/payments` | transactions + escrow queue actions |
| **`/admin/companies`** | **application review (approve/reject/review) + company suspend/reactivate** |
| `/admin/disputes` `/admin/security` `/admin/reports` `/admin/settings` `/admin/audit-logs` | dispute resolution, fraud center, analytics, platform settings, audit trail |

## Backend API surface (additions in this takeover)
```
GET    /api/companies                      public directory (customer-safe)
GET    /api/companies/:id                  public profile (customer-safe)
POST   /api/company/applications           partner application
GET    /api/company/applications/me
POST   /api/company/applications/:id/review|approve|submit
GET    /company/portal/overview|profile|services|team|jobs|open-pool|schedule|reviews|finance
PUT    /company/portal/profile
POST   /company/portal/services  · PATCH|DELETE /:serviceId
POST   /company/portal/team      · PATCH|DELETE /:memberId
POST   /company/jobs/:jobId/claim|accept|reject|quote|assign-technician|unassign-technician
GET    /company/technician/assignments?scope=
POST   /jobs/:id/quote/decision            customer quote approve/reject
GET|POST|PATCH|DELETE /api/properties       multi-property book
GET    /admin/company-applications · /admin/companies · POST /admin/companies/:id/action
```
