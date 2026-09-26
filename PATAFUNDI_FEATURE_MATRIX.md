# PataFundi — Feature Matrix (post-takeover)

Legend: ✅ IMPLEMENTED+TESTED · 🟡 PARTIAL · ⏸ CREDENTIAL REQUIRED · ❌ NOT IMPLEMENTED

## Public website
| Feature | Status | Notes |
|---|---|---|
| Landing, services, how-it-works, trust, blog, careers, policies | ✅ | pre-existing, verified |
| Company directory (real data, filters, search) | ✅ | NEW — replaced static marketing page |
| Company public profile (customer-safe) + direct booking | ✅ | NEW |
| Partner With PataFundi application (4-step) | ✅ | NEW |
| Dead `/partner-program` link fixed | ✅ | FIXED |

## Customer experience
| Feature | Status |
|---|---|
| Signup/login/OTP/refresh, session persistence | ✅ |
| Job wizard: category, description, photos, urgency, schedule | ✅ |
| **Book a company directly** | ✅ NEW |
| Post to open company pool | ✅ NEW |
| Multi-property book (home/office/rental…) | ✅ NEW |
| Quote approve/reject flow | ✅ NEW |
| Live tracking + polling fallback | ✅ |
| Chat (socket.io) | ✅ |
| Payment (dev provider in sandbox; M-Pesa adapter ready) | ✅ / ⏸ |
| OTP completion confirm + escrow auto-release | ✅ FIXED (never worked before) |
| Receipts, payment status, refund status | ✅ |
| Reviews | ✅ |
| Service history & rebook | 🟡 (history ✅; one-tap rebook = reuse wizard) |
| Emergency flow (urgency + priority matching) | ✅ |

## Fundi app
| Feature | Status |
|---|---|
| Registration + document upload + admin verification | ✅ |
| Online toggle, GPS streaming, job offers | ✅ |
| Accept → check-in → complete (+evidence) | ✅ |
| Wallet (escrow releases, balance, withdrawals) | ✅ FIXED (tables were missing) |
| Earnings visibility (available/pending/withdrawn) | ✅ |

## Company ecosystem
| Feature | Status |
|---|---|
| Partner application → review → approval → provisioning | ✅ REBUILT |
| Company portal (dashboard, jobs, dispatch, team, services, schedule, quality, finance, settings) | ✅ NEW |
| Team/technician CRUD with temp-password provisioning | ✅ NEW |
| Dispatch: accept/claim/reject/quote/assign/unassign | ✅ FIXED+NEW (assign used to crash) |
| Technician experience app | ✅ NEW |
| Company settlements (server-computed) | ✅ NEW |
| Company isolation (403 cross-company) | ✅ FIXED+TESTED |
| Suspension / reactivation | ✅ NEW |
| Open job pool (competitive claim) | ✅ NEW |
| Guarantees/warranties on profile | ✅ NEW |

## Staff & Super Admin
| Feature | Status |
|---|---|
| Role-specific staff dashboards (ops/support/dispatch/finance/fraud/devops/auditor) | ✅ REDESIGNED (were generic fallbacks) |
| Company applications review + companies management | ✅ NEW |
| Fundi verification, customers, jobs, payments, disputes | ✅ (pre-existing) |
| Escrow release/freeze, payouts, refunds (admin) | ✅ FIXED (release/refund paths were broken) |
| Fraud center, security center, 2FA, feature flags | ✅ (pre-existing) |
| Audit logs + system health | ✅ |
| Revenue/commission control | ✅ |

## Platform core
| Feature | Status |
|---|---|
| Job lifecycle state machine | ✅ NEW (arbitrary jumps were allowed) |
| Escrow + double-entry ledger + revenue ledger | ✅ FIXED |
| Notifications (scoped per user) + realtime events | ✅ |
| Audit logging on sensitive actions | ✅ EXPANDED |
| Rate limiting, helmet/CSP, CSRF, lockout, replay protection | ✅ (pre-existing) |
| Files: public photos + private documents with access checks | ✅ |
| AI assistant (advisory) | 🟡 (endpoints exist; advisory-only enforced) |
| Responsive UI 360→1920px + mobile bottom nav | ✅ NEW for company/technician surfaces |

## M-Pesa / Stripe / SMS / Email / Push / Maps
| Integration | Status |
|---|---|
| M-Pesa Daraja STK + webhook (signature/replay) | ⏸ CREDENTIAL REQUIRED (code complete; dev provider covers sandbox) |
| Stripe | ❌ NOT IMPLEMENTED (adapter interface available) |
| Email / SMS (OTP delivery) | ⏸ CREDENTIAL REQUIRED (OTP surfaces in dev) |
| Push (Expo tokens) | ⏸ CREDENTIAL REQUIRED |
| Maps | ✅ OSM/Leaflet (Google optional via key) |
