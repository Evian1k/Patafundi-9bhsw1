# PataFundi Screen and Route Matrix

Source: [src/routes/AppRoutes.tsx](src/routes/AppRoutes.tsx)

## Public / customer-facing routes

| Route | Purpose | UI status | Auth status | Evidence level |
|---|---|---:|---:|---:|
| `/` | Landing / home | Present | Public | Code-level only |
| `/auth` | Auth entry | Present | Public | Code-level only |
| `/maintenance` | Maintenance page | Present | Public | Code-level only |
| `/status` | Status page | Present | Public | Code-level only |
| `/demo` | Demo credentials page | Present | DEV-only | Code-level only |
| `/register/customer` | Customer sign-up | Present | Public | Code-level only |
| `/register/fundi` | Fundi registration | Present | Public | Code-level only |
| `/dashboard` | Customer dashboard | Present | Protected customer | Code-level only |
| `/create-job` | Create service request | Present | Protected customer | Code-level only |
| `/job/:jobId/tracking` | Job tracking | Present | Protected customer | Code-level only |
| `/settings` | User settings | Present | Protected customer | Code-level only |
| `/disputes` | Dispute center | Present | Protected customer | Code-level only |
| `/services/:slug` | Service detail page | Present | Public | Code-level only |
| `/customers` | Customer marketing page | Present | Public | Code-level only |
| `/fundis` | Fundi marketplace page | Present | Public | Code-level only |
| `/companies` | Company marketplace page | Present | Public | Code-level only |
| `/about` | About page | Present | Public | Code-level only |
| `/careers` | Careers page | Present | Public | Code-level only |
| `/blog` | Blog index | Present | Public | Code-level only |
| `/blog/:slug` | Blog post | Present | Public | Code-level only |
| `/press` | Press page | Present | Public | Code-level only |
| `/how-it-works` | How it works | Present | Public | Code-level only |
| `/trust-safety` | Trust & safety | Present | Public | Code-level only |
| `/investors` | Investors page | Present | Public | Code-level only |
| `/contact` | Contact page | Present | Public | Code-level only |
| `/help` | Help center | Present | Public | Code-level only |
| `/safety-guidelines` | Safety guidelines | Present | Public | Code-level only |
| `/contact-support` | Support contact | Present | Public | Code-level only |
| `/report-problem` | Report issue | Present | Public | Code-level only |
| `/socials` | Social links | Present | Public | Code-level only |
| Policy routes | Privacy, terms, cookies, refund policy, platform rules, etc. | Present | Public | Code-level only |

## Fundi routes

| Route | Purpose | UI status | Auth status | Evidence level |
|---|---|---:|---:|---:|
| `/fundi/register` | Redirect to register | Present | Public | Code-level only |
| `/fundi/pending` | Pending approval | Present | Protected fundi | Code-level only |
| `/fundi` | Fundi dashboard | Present | Protected fundi | Code-level only |
| `/fundi/job/:jobId` | Fundi job detail | Present | Protected fundi | Code-level only |
| `/fundi/job/active` | Active job | Present | Protected fundi | Code-level only |
| `/fundi/wallet` | Wallet / payouts | Present | Protected fundi | Code-level only |
| `/fundi/disputes` | Fundi dispute center | Present | Protected fundi | Code-level only |
| `/fundi/resources` | Resources | Present | Protected fundi | Code-level only |
| `/fundi/app` | Fundi app shell/page | Present | Protected fundi | Code-level only |

## Admin routes

| Route | Purpose | UI status | Auth status | Evidence level |
|---|---|---:|---:|---:|
| `/admin/login` | Admin login | Present | Public | Code-level only |
| `/admin` | Redirect | Present | Public | Code-level only |
| `/admin/dashboard` | Admin dashboard | Present | Protected admin | Code-level only |
| `/admin/fundis` | Fundi verification | Present | Protected admin | Code-level only |
| `/admin/customers` | Customer management | Present | Protected admin | Code-level only |
| `/admin/jobs` | Job management | Present | Protected admin | Code-level only |
| `/admin/payments` | Payments | Present | Protected admin | Code-level only |
| `/admin/security` | Security | Present | Protected admin | Code-level only |
| `/admin/reports` | Reports & analytics | Present | Protected admin | Code-level only |
| `/admin/settings` | Admin settings | Present | Protected admin | Code-level only |
| `/admin/audit-logs` | Audit logs | Present | Protected admin | Code-level only |
| `/admin/disputes` | Admin dispute management | Present | Protected admin | Code-level only |

## Staff routes

| Route | Purpose | UI status | Auth status | Evidence level |
|---|---|---:|---:|---:|
| `/staff/login` | Staff login | Present | Public | Code-level only |
| `/staff` | Staff layout + overview | Present | Staff-scoped | Code-level only |
| `/staff/executive` | Executive dashboard | Present | Staff-scoped | Code-level only |
| `/staff/ai` | AI command center | Present | Staff-scoped | Code-level only |
| `/staff/security` | Security center | Present | Staff-scoped | Code-level only |
| `/staff/system` | System settings | Present | Staff-scoped | Code-level only |
| `/staff/staff-mgmt` | Staff management | Present | Staff-scoped | Code-level only |
| `/staff/commission` | Commission control | Present | Staff-scoped | Code-level only |
| `/staff/operations` | Live operations | Present | Staff-scoped | Code-level only |
| `/staff/dispatch` | Dispatch view | Present | Staff-scoped | Code-level only |
| `/staff/support` | Support dashboard | Present | Staff-scoped | Code-level only |
| `/staff/fraud` | Fraud view | Present | Staff-scoped | Code-level only |
| `/staff/finance` | Finance dashboard | Present | Staff-scoped | Code-level only |
| `/staff/devops` | DevOps view | Present | Staff-scoped | Code-level only |
| `/staff/audit` | Audit logs | Present | Staff-scoped | Code-level only |
| `/staff/admin` | Admin management view | Present | Staff-scoped | Code-level only |
| `/staff/admin/fundis` | Fundi management | Present | Staff-scoped | Code-level only |
| `/staff/admin/jobs` | Job management | Present | Staff-scoped | Code-level only |
| `/staff/admin/users` | User activity | Present | Staff-scoped | Code-level only |

## Screen-level assessment

- Route inventory is broad and well-defined.
- The application has a large number of screens and pages declared in code.
- No automated browser proof exists here that all screens render without console/runtime faults.
- This means the route matrix is a code inventory, not a fully-evidenced production QA matrix.

## Overall route confidence

- Code presence: strong
- Route wiring: strong
- Browser runtime proof: not yet complete
- Authorization proof: partial backend evidence only
