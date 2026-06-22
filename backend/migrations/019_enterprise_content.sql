-- ============================================================
-- Migration 019: Enterprise Content — Policies, Help Articles, Fines
-- ============================================================
-- Seeds the policies table with comprehensive enterprise content:
--   - Terms of Service (full legal document)
--   - Privacy Policy (GDPR/Kenya DPA compliant)
--   - Cookies Policy
--   - Refund Policy (detailed with timelines)
--   - Platform Rules (customers + fundis)
--   - Enforcement Policy (warning system + fines)
--   - Community Guidelines
--   - Anti-Fraud Policy
--   - AML Policy
--   - KYC Policy
--   - Data Retention Policy
--   - Incident Response Policy
--   - SLA
--   - Escrow Policy
--   - Insurance Policy
--   - Vendor Policy
--   - Partner Program
--   - Affiliate Program
--   - API Documentation
--   - Business Verification Policy
--   - Accessibility Policy
--   - Transparency Report
--   - Compliance Center
--   - Security Center
-- ============================================================

-- ── Add columns to policies table (if not exists) ──────────────
ALTER TABLE policies ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'legal';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

-- Insert comprehensive policies (using upsert so re-running is safe)
INSERT INTO policies (slug, title, category, body, is_published, sort_order) VALUES
-- ── LEGAL ──────────────────────────────────────────────────────
('terms', 'Terms of Service', 'legal', '## 1. Definitions

**Customer** — A user who requests services through the PataFundi platform.

**Fundi** — A verified service professional who provides services through the PataFundi platform.

**Job** — A service request created by a Customer and accepted by a Fundi.

**Platform** — The PataFundi application, website, and all associated services.

**Account** — A user account on the PataFundi platform.

## 2. Eligibility

You must be at least 18 years old to use PataFundi. By creating an account, you confirm that you are 18 or older and legally capable of entering into binding contracts.

## 3. User Responsibilities

### Customer Responsibilities
- Provide accurate job descriptions and locations
- Be available at the agreed time
- Pay the agreed amount through the platform
- Treat fundis with respect
- Do not request services outside the platform

### Fundi Responsibilities
- Provide accurate qualifications and skills
- Arrive on time for accepted jobs
- Complete work to a professional standard
- Communicate professionally with customers
- Do not solicit payment outside the platform

## 4. Platform Responsibilities

PataFundi will:
- Verify fundi identities through national ID and selfie verification
- Maintain escrow accounts for payment protection
- Provide 24/7 customer support
- Investigate and resolve disputes fairly
- Protect user data through encryption and access controls

## 5. Prohibited Activities

The following are strictly prohibited:
- **Payment Circumvention** — Paying or receiving payment outside the platform
- **Fake Reviews** — Writing or soliciting fake reviews
- **Harassment** — Any form of harassment, discrimination, or threats
- **Fraud** — Any attempt to defraud the platform, customers, or fundis
- **Identity Fraud** — Using false identities or documents
- **Chargeback Fraud** — Initiating fraudulent chargebacks
- **Fake Qualifications** — Misrepresenting skills or credentials

Violations result in warnings, fines, suspensions, or permanent bans per the Enforcement Policy.

## 6. Fees

PataFundi charges a commission of 15% on each completed job. This commission is deducted from the fundi''s payout. Customers pay no fees beyond the agreed job price.

## 7. Payments

All payments are processed through M-Pesa Daraja API. Funds are held in escrow until the customer confirms job completion. Payouts to fundis are processed within 24-48 hours of confirmation.

## 8. Refunds

Refunds are governed by our Refund Policy. Full refunds are issued for fraud, duplicate payments, or fundi no-shows. Partial refunds may be issued for poor workmanship. Refunds are processed within 3-14 business days.

## 9. Intellectual Property

All content on PataFundi (logos, text, graphics, software) is owned by PataFundi Ltd. Users retain ownership of content they post (reviews, photos) but grant PataFundi a license to use it for platform operations.

## 10. Liability Limits

PataFundi is not liable for:
- Acts of third parties (fundis or customers)
- Indirect or consequential damages
- Loss of profits or data
- Service interruptions

PataFundi''s total liability is limited to the amount paid for the specific job in dispute.

## 11. Account Termination

Accounts may be terminated for:
- Violations of these Terms
- Fraudulent activity
- Inactivity for 12+ months
- User request

## 12. Arbitration

Disputes will be resolved through binding arbitration in Nairobi, Kenya, under the Arbitration Act of Kenya.

## 13. Governing Law

These Terms are governed by the laws of the Republic of Kenya.

## 14. Changes to Terms

PataFundi may update these Terms at any time. Users will be notified 30 days before changes take effect. Continued use after the effective date constitutes acceptance.', true, 1),

('privacy', 'Privacy Policy', 'legal', '## Data We Collect

### Personal Information
- **Name** — Full legal name
- **Email** — For account verification and communication
- **Phone** — For OTP verification and support contact
- **Location** — For job matching and fundi tracking
- **Device Information** — For fraud detection and security

### Verification Data
- **National ID** — For fundi identity verification
- **Selfie** — For face match verification
- **Device Fingerprint** — For fraud prevention

### Transaction Data
- **Payment Information** — M-Pesa transaction IDs (we do not store card numbers)
- **Job History** — Services requested and completed
- **Chat Messages** — For dispute resolution (retained 90 days)

## Why We Collect Data

- **Account Creation** — To create and manage your account
- **Service Delivery** — To match customers with fundis
- **Payment Processing** — To process M-Pesa payments and escrow
- **Fraud Prevention** — To detect and prevent fraudulent activity
- **Customer Support** — To resolve disputes and provide support
- **Legal Compliance** — To comply with Kenyan law and regulations

## Data Storage

- **Database** — Encrypted PostgreSQL database hosted on Neon (AWS)
- **File Storage** — Cloudflare R2 with AES-256 encryption
- **Backups** — Daily encrypted backups retained for 30 days
- **PII Encryption** — Phone numbers and IDs encrypted at rest with AES-256-GCM

## Data Sharing

We do NOT sell your data. We share data only with:
- **M-Pesa** — For payment processing (transaction IDs only)
- **Cloudflare** — For file storage (encrypted)
- **Google Maps** — For location services (anonymous)
- **Law Enforcement** — Only when legally compelled

## User Rights

You have the right to:
- **Access** — Request a copy of your data
- **Correction** — Correct inaccurate data
- **Deletion** — Request account deletion (subject to legal retention)
- **Portability** — Export your data in JSON format
- **Objection** — Object to data processing for marketing

## Data Retention

- **Active Accounts** — Retained while account is active
- **Inactive Accounts** — Deleted after 12 months of inactivity
- **Transaction Records** — Retained for 7 years (Kenyan tax law)
- **Chat Messages** — Retained for 90 days
- **Audit Logs** — Retained for 3 years

## Security

- **Encryption at Rest** — AES-256-GCM for PII
- **Encryption in Transit** — TLS 1.3 for all connections
- **Access Controls** — RBAC with 8 staff roles
- **Audit Logging** — All privileged actions logged
- **Penetration Testing** — Regular security audits

## Contact

For privacy questions: patafundi6@gmail.com
For data requests: patafundi6@gmail.com', true, 2),

('cookies', 'Cookies Policy', 'legal', '## Types of Cookies

### Essential Cookies (Always Active)
- **access_token** — JWT authentication token (httpOnly, SameSite=strict)
- **refresh_token** — Session refresh token (httpOnly, SameSite=strict)
- **csrf_token** — CSRF protection token (SameSite=strict)

### Analytics Cookies (Optional)
- We use anonymous analytics to understand platform usage. No personal data is collected.

### Marketing Cookies
- We do NOT use marketing or advertising cookies.

### Security Cookies
- **Device Fingerprint** — For fraud detection (hashed, not reversible)

## Cookie Controls

You can control cookies through your browser settings. Essential cookies cannot be disabled as they are required for the platform to function.

## Third-Party Cookies

- **Google Maps** — Uses cookies for map functionality
- **M-Pesa** — Does not set cookies on our domain

## Cookie Retention

- **access_token** — 15 minutes
- **refresh_token** — 30 days
- **csrf_token** — 30 days

## Updates

We may update this policy when new cookies are added. Users will be notified via email.', true, 3),

-- ── POLICIES ───────────────────────────────────────────────────
('refund-policy', 'Refund Policy', 'policy', '## Full Refund (100%)

A full refund is issued in the following cases:
- **Fundi never arrived** — Fundi did not show up for an accepted job
- **Duplicate payment** — Customer was charged twice for the same job
- **Fraud detected** — Fraudulent activity confirmed by our Trust & Safety team
- **Platform error** — Technical error caused incorrect charge

## Partial Refund (25-75%)

A partial refund may be issued in the following cases:
- **Poor workmanship** — Job completed but quality is substandard (requires photo evidence)
- **Incomplete job** — Job partially completed (refund proportional to incomplete portion)
- **Wrong service** — Fundi performed a different service than requested

## No Refund

Refunds are NOT issued in the following cases:
- **Job completed successfully** — Customer confirmed completion with OTP
- **Customer changed mind** — Cancellation after fundi has traveled to location
- **Customer not available** — Fundi arrived but customer was not present
- **Dispute resolved in fundi''s favor** — After investigation

## Refund Timeline

- **M-Pesa to M-Pesa** — 3-5 business days
- **Bank transfer** — 5-10 business days
- **Disputed refunds** — 7-14 business days (includes investigation time)

## Appeal Process

If your refund request is denied, you may appeal:
1. **Submit appeal** — Email patafundi6@gmail.com within 7 days of denial
2. **Review** — Senior support agent reviews within 3 business days
3. **Final decision** — Decision is final and binding

## How to Request a Refund

1. Go to **Dashboard** → **Job History**
2. Select the job → click **"Request Refund"**
3. Select reason and provide evidence (photos, description)
4. Submit — you''ll receive a response within 48 hours', true, 4),

('platform-rules', 'Platform Rules', 'policy', '## Customer Rules

### Allowed
- Request legitimate services
- Leave honest, factual reviews
- Communicate professionally with fundis
- Request refunds for legitimate issues
- Save favorite fundis for future jobs

### Not Allowed
- Writing fake reviews (positive or negative)
- Harassing or threatening fundis
- Paying fundis outside the platform
- Requesting services for illegal activities
- Creating multiple accounts to abuse referrals
- Sharing fundi contact details publicly

## Fundi Rules

### Allowed
- Accept or decline job requests
- Communicate professionally with customers
- Set availability status (online/offline)
- Build a portfolio of completed work
- Withdraw earnings to M-Pesa

### Not Allowed
- Falsifying qualifications or skills
- Overcharging customers (charging above agreed price)
- Harassing or threatening customers
- Sharing personal contact details before booking completion
- Soliciting payment outside the platform
- Creating multiple accounts
- Abusing the referral system', true, 5),

('enforcement', 'Enforcement Policy', 'policy', '## Warning System

### First Offense — Warning
Written warning via email and in-app notification.

### Second Offense — Temporary Restriction
Account restricted for 7 days. Cannot create jobs or accept work.

### Third Offense — Suspension
Account suspended for 30 days. All active jobs cancelled.

### Fourth Offense — Permanent Ban
Account permanently banned. Funds in escrow refunded to customer.

## Fine Schedule

### Fake Reviews
- 1st offense: Warning
- 2nd offense: KES 2,000 penalty
- 3rd offense: Account suspension (30 days)

### Payment Circumvention (paying outside platform)
- 1st offense: Warning
- 2nd offense: KES 5,000 fine
- 3rd offense: Permanent ban

### Fake Fundi Profile
- Immediate suspension
- Possible permanent ban

### Harassment
- Immediate investigation
- Possible permanent ban (zero tolerance)

### Threats
- Immediate suspension
- Reported to authorities

### Fraud
- Immediate permanent ban
- All funds frozen
- Reported to Kenyan authorities

### Identity Fraud
- Permanent ban
- Blacklisted across platform
- Reported to authorities

### Chargeback Fraud
- Account suspended
- Debt recovery process initiated
- Reported to credit bureaus

## Appeal Process

Suspended users may appeal within 7 days by emailing patafundi6@gmail.com. Appeals are reviewed by senior staff within 5 business days.', true, 6),

('community-guidelines', 'Community Guidelines', 'policy', '## Our Community Values

PataFundi is built on trust, respect, and professionalism. All users must follow these guidelines:

## Respect
- Treat all users with dignity regardless of gender, race, religion, or background
- Use professional language in all communications
- No hate speech, discrimination, or harassment

## Honesty
- Provide accurate information in profiles and job descriptions
- Do not misrepresent qualifications or services
- Leave only honest, factual reviews

## Safety
- Never share personal contact details before a booking is confirmed
- Report any safety concerns immediately via the SOS button
- Keep all communications on the platform

## Professionalism
- Arrive on time for appointments
- Complete work to a professional standard
- Communicate delays or issues promptly

## Compliance
- Follow all Kenyan laws and regulations
- Do not use the platform for illegal activities
- Respect intellectual property rights', true, 7),

-- ── FINANCIAL POLICIES ─────────────────────────────────────────
('escrow-policy', 'Escrow Policy', 'financial', '## How Escrow Works

1. **Customer pays** — Payment is held in escrow when the customer initiates M-Pesa STK push
2. **Fundi completes job** — Fundi marks job as complete and customer confirms with OTP
3. **Escrow releases** — 85% goes to fundi wallet, 15% to platform commission
4. **Fundi withdraws** — Fundi requests payout to M-Pesa (processed 24-48h)

## Escrow Protection

- Funds are held securely in a dedicated escrow account
- Funds are only released when both parties confirm completion
- Disputes freeze escrow release pending investigation
- Refunds are issued from escrow if customer''s claim is upheld

## Escrow Disputes

If a dispute is opened:
1. Escrow is frozen immediately
2. Both parties have 48 hours to provide evidence
3. Trust & Safety team reviews within 72 hours
4. Decision is final — funds released to the prevailing party', true, 8),

('aml-policy', 'Anti-Money Laundering (AML) Policy', 'financial', '## Purpose

PataFundi complies with Kenyan AML laws under the Proceeds of Crime and Anti-Money Laundering Act (POCAMLA).

## Customer Due Diligence (CDD)

- All users must verify email and phone before transacting
- Fundis must complete identity verification (national ID + selfie)
- Transactions above KES 100,000 trigger enhanced due diligence
- Suspicious transactions are flagged for review

## Suspicious Activity Reporting (SAR)

- Transactions matching fraud patterns are automatically flagged
- AI fraud detection runs every 15 minutes
- Suspicious accounts are frozen pending investigation
- Confirmed fraud is reported to the Financial Reporting Centre (FRC)

## Record Keeping

- Transaction records retained for 7 years
- Identity verification records retained for 5 years post-account-closure
- Audit logs retained for 3 years

## Prohibited Activities

- No cash transactions (all payments via M-Pesa)
- No transactions above KES 1,000,000 without enhanced verification
- No transactions from sanctioned countries
- No structuring (breaking large transactions into smaller ones)', true, 9),

('kyc-policy', 'Know Your Customer (KYC) Policy', 'financial', '## Customer KYC

### Standard Verification
- Email verification (OTP)
- Phone verification (OTP)
- Optional: National ID for enhanced trust score

### Enhanced Verification (for high-value jobs)
- National ID required
- Selfie verification
- Address verification (utility bill)

## Fundi KYC

### Mandatory Verification
- National ID (front and back)
- Selfie with ID (face match via AWS Rekognition)
- Phone verification
- Skills verification

### Background Checks
- Criminal record check (for high-value categories)
- Reference checks (optional)

## Re-verification

- Annual re-verification for fundis
- Immediate re-verification if fraud score > 70
- Re-verification on suspicious activity', true, 10),

-- ── SECURITY POLICIES ──────────────────────────────────────────
('security-center', 'Security Center', 'security', '## Security Overview

PataFundi uses defense-in-depth security:

### Network Security
- HTTPS only (TLS 1.3)
- HSTS with preload
- Cloudflare CDN with DDoS protection

### Application Security
- Helmet security headers (CSP, X-Frame-Options, X-Content-Type-Options)
- Rate limiting (120 req/min global, 20/15min for auth)
- CSRF protection (double-submit cookie)
- Input validation on all endpoints

### Authentication Security
- bcrypt password hashing (cost 12)
- JWT with HS256 algorithm pinning
- Refresh token rotation
- Account lockout after 5 failed attempts
- 2FA via TOTP (optional, required for super_admin)

### Authorization Security
- 8-role RBAC with 66 permissions
- IDOR protection on all sensitive reads
- Mass-assignment protection

### Data Security
- AES-256-GCM encryption for PII at rest
- Encrypted PostgreSQL on Neon (AWS)
- Cloudflare R2 with server-side encryption
- Daily encrypted backups

### Monitoring
- Audit logging on all privileged actions
- AI fraud detection (runs every 15 min)
- Real-time alerting for critical events
- Staff login history tracking

## Vulnerability Reporting

If you find a security vulnerability, email patafundi6@gmail.com. We offer bug bounties for confirmed critical vulnerabilities.', true, 11),

('incident-response', 'Incident Response Policy', 'security', '## Incident Classification

### Critical (P0)
- Data breach
- Payment system compromise
- Platform-wide outage

### High (P1)
- Single service failure
- Security vulnerability exploited
- Fraud cluster detected

### Medium (P2)
- Performance degradation
- Minor bug affecting users

### Low (P3)
- Cosmetic issues
- Non-urgent improvements

## Response Process

1. **Detect** — Automated monitoring or user report
2. **Triage** — On-call engineer assesses severity (15 min for P0)
3. **Contain** — Stop the bleeding (isolate systems, revoke tokens)
4. **Investigate** — Determine root cause and impact
5. **Resolve** — Apply fix and verify
6. **Communicate** — Notify affected users (within 72h for data breaches per Kenya DPA)
7. **Post-mortem** — Document lessons learned

## Communication

- **P0** — All users notified within 4 hours
- **P1** — Affected users notified within 24 hours
- **Data breaches** — Reported to Office of the Data Protection Commissioner within 72 hours

## Contact

- **Security incidents** — patafundi6@gmail.com
- **Emergency** — SOS button in app', true, 12),

-- ── OPERATIONAL POLICIES ───────────────────────────────────────
('sla', 'Service Level Agreement (SLA)', 'operational', '## Uptime Guarantee

PataFundi targets 99.5% uptime per month (excluding scheduled maintenance).

## Response Times

| Priority | First Response | Resolution |
|----------|----------------|------------|
| Critical | 15 minutes | 4 hours |
| High | 1 hour | 24 hours |
| Medium | 4 hours | 72 hours |
| Low | 24 hours | 7 days |

## Scheduled Maintenance

- **Weekly** — Every Wednesday 2:00 AM - 4:00 AM EAT
- **Notification** — 24 hours advance notice via email
- **Emergency maintenance** — May occur without notice for critical security issues

## Support Channels

- **In-app chat** — 24/7
- **Email** — Response within 24 hours
- **Phone** — Available for P0/P1 incidents

## Compensation

If we fail to meet SLA:
- **< 99.5% uptime** — 10% credit on next month''s fees
- **< 99% uptime** — 25% credit on next month''s fees
- **< 95% uptime** — 50% credit + post-mortem report

## Exclusions

- Force majeure (natural disasters, government actions)
- Internet outages outside our infrastructure
- Issues caused by user''s device or network', true, 13),

('data-retention', 'Data Retention Policy', 'operational', '## Retention Periods

### User Data
- **Active accounts** — Retained while account is active
- **Inactive accounts** — Deleted after 12 months of inactivity
- **Banned accounts** — Retained for 7 years (legal hold)

### Transaction Data
- **Payment records** — 7 years (Kenyan tax law)
- **Job records** — 5 years
- **Refund records** — 7 years

### Communications
- **Chat messages** — 90 days after job completion
- **Support tickets** — 3 years
- **Email logs** — 1 year

### Verification Data
- **ID images** — 5 years after account closure
- **Selfie images** — 1 year after verification
- **Device fingerprints** — 2 years

### Audit Logs
- **Admin actions** — 3 years
- **Auth events** — 1 year
- **Fraud events** — 7 years

## Deletion Process

- **Soft delete** — Data marked as deleted but retained for legal hold
- **Hard delete** — Data permanently removed after legal hold expires
- **Backup deletion** — Backups overwritten within 30 days', true, 14),

('accessibility', 'Accessibility Policy', 'operational', '## Our Commitment

PataFundi is committed to making our platform accessible to all users, including those with disabilities.

## WCAG 2.1 AA Compliance

We strive to meet Web Content Accessibility Guidelines (WCAG) 2.1 Level AA:

### Perceivable
- Text alternatives for non-text content
- Captions for multimedia
- Content adaptable to different screen sizes

### Operable
- Keyboard navigation support
- No time limits on content
- No flashing content (seizure prevention)

### Understandable
- Clear, simple language
- Consistent navigation
- Error identification and suggestions

### Robust
- Compatible with assistive technologies
- Valid HTML
- ARIA labels where needed

## Features

- Screen reader compatibility
- High contrast mode
- Adjustable text size
- Voice search support
- Mobile-responsive design

## Contact

If you encounter accessibility issues, email patafundi6@gmail.com', true, 15),

('transparency-report', 'Transparency Report', 'operational', '## Government Requests

PataFundi publishes a transparency report every 6 months detailing:

### Data Requests
- Number of government data requests received
- Number of requests complied with
- Number of requests refused
- Types of data requested

### Content Takedowns
- Number of takedown requests
- Number of accounts suspended
- Reasons for takedowns

### Law Enforcement Requests
- Number of law enforcement inquiries
- Number of accounts reported to authorities
- Categories of offenses

## Current Period (H1 2026)

- **Data requests received** — 0
- **Accounts reported to authorities** — 0
- **Fraud cases escalated** — 0
- **Takedown requests** — 0

## Commitment

We only disclose user data when legally compelled. We notify users of data requests unless prohibited by law.', true, 16),

('compliance-center', 'Compliance Center', 'operational', '## Regulatory Compliance

PataFundi complies with:

### Kenyan Law
- **Kenya Data Protection Act 2019** — Data privacy and protection
- **Proceeds of Crime and Anti-Money Laundering Act (POCAMLA)** — AML compliance
- **Consumer Protection Act** — Consumer rights protection
- **Employment Act** — For our staff
- **Tax Procedures Act** — Tax compliance

### International Standards
- **GDPR** — For EU users (if applicable)
- **PCI DSS** — Payment card industry standards (via M-Pesa)
- **ISO 27001** — Information security management (in progress)

### Industry Standards
- **OWASP Top 10** — Web application security
- **NIST Cybersecurity Framework** — Security best practices

## Certifications (Planned)

- ISO 27001 — Information Security
- ISO 9001 — Quality Management
- SOC 2 Type II — Service Organization Controls

## Audits

- Annual security audit by external firm
- Quarterly internal compliance review
- Monthly fraud review

## Contact

For compliance questions: patafundi6@gmail.com', true, 17),

-- ── BUSINESS POLICIES ──────────────────────────────────────────
('vendor-policy', 'Vendor Policy', 'business', '## Vendor Selection

PataFundi works with vendors who meet our standards:

### Requirements
- Valid business registration
- Tax compliance certificate
- Data protection compliance
- Security audit (for tech vendors)
- References from 3+ clients

### Approved Vendors
- **Cloudflare** — CDN and DDoS protection
- **Neon** — PostgreSQL database hosting
- **Vercel** — Frontend hosting
- **Render** — Backend hosting
- **M-Pesa** — Payment processing
- **Google Maps** — Location services
- **AWS Rekognition** — Face verification
- **Resend** — Transactional email

## Vendor Management

- Annual vendor review
- Security assessment for new vendors
- Data processing agreements (DPAs) with all vendors
- Vendor performance monitoring', true, 18),

('insurance-policy', 'Insurance Policy', 'business', '## Coverage

PataFundi maintains insurance coverage:

### Professional Indemnity
- Covers claims of negligence or errors in services
- Limit: KES 10,000,000 per claim

### Public Liability
- Covers injury or damage to third parties
- Limit: KES 5,000,000 per incident

### Cyber Liability
- Covers data breaches and cyber attacks
- Limit: KES 5,000,000 per incident

### Workers Compensation
- Covers staff injuries
- Per Kenyan law requirements

## Fundi Insurance

Fundis are independent contractors, not employees. They are responsible for their own:
- Health insurance
- Liability insurance
- Equipment insurance

PataFundi recommends fundis obtain appropriate insurance coverage.

## Claims

Claims should be directed to: patafundi6@gmail.com', true, 19),

('business-verification', 'Business Verification Policy', 'business', '## Business Account Verification

For businesses using PataFundi for bulk services:

### Requirements
- Business registration certificate (CR12)
- KRA PIN certificate
- Business bank account verification
- Authorized signatory identification

### Verification Process

1. **Submit documents** — Upload via business portal
2. **Review** — Compliance team reviews (3-5 business days)
3. **Verification call** — Phone verification with authorized signatory
4. **Approval** — Business account activated

### Benefits

- Higher transaction limits (up to KES 1,000,000 per job)
- Bulk job creation
- Net-30 payment terms (for verified businesses)
- Dedicated account manager
- Priority support

### Maintaining Verification

- Annual re-verification
- Immediate review if suspicious activity detected
- Business must maintain good standing with KRA', true, 20),

-- ── PARTNER PROGRAMS ───────────────────────────────────────────
('partner-program', 'Partner Program', 'partners', '## Partner with PataFundi

PataFundi partners with businesses that complement our services:

### Partner Types

#### Service Partners
- Companies offering complementary services (e.g., building materials suppliers)
- Benefit: Featured placement on PataFundi
- Revenue: Commission sharing

#### Corporate Partners
- Companies needing bulk fundi services
- Benefit: Discounted rates, dedicated fundis
- Revenue: Volume-based pricing

#### Government Partners
- County governments for skilled trades training
- Benefit: Workforce development
- Revenue: Grant-funded

### Partner Requirements
- Valid business registration
- Minimum 2 years in business
- Good reputation
- Compliance with Kenyan law

### How to Apply

Email partners@patafundi.com with:
- Company profile
- Business registration documents
- Proposed partnership model', true, 21),

('affiliate-program', 'Affiliate Program', 'partners', '## Earn with PataFundi Affiliates

### How It Works

1. **Sign up** — Register as an affiliate
2. **Get your link** — Receive a unique referral link
3. **Share** — Promote PataFundi on your channels
4. **Earn** — Get KES 200 for each new customer who completes a paid job

### Commission Structure

- **Customer referral** — KES 200 per first paid job
- **Fundi referral** — KES 500 per approved fundi
- **Corporate referral** — 5% of first 3 months'' revenue

### Payment

- Monthly payouts via M-Pesa
- Minimum payout: KES 1,000
- 30-day hold on commissions (to account for refunds)

### Rules

- No spam marketing
- No misleading claims
- No paid ads on "PataFundi" keyword
- Comply with Kenyan advertising laws

### How to Join

Email affiliates@patafundi.com with:
- Your name and contact
- Marketing channels (blog, social media, etc.)
- Estimated monthly referrals', true, 22),

-- ── TECHNICAL ──────────────────────────────────────────────────
('api-documentation', 'API Documentation', 'technical', '## PataFundi Public API

PataFundi provides a REST API for partners and integrations.

### Authentication

All API requests require a JWT bearer token:
```
Authorization: Bearer <your-jwt-token>
```

### Base URL

```
https://patafundi-9bhsw1.onrender.com/api
```

### Endpoints

#### Authentication
- `POST /api/auth/register` — Register new customer
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `POST /api/auth/refresh` — Refresh token
- `POST /api/auth/otp-verify` — Verify OTP
- `POST /api/auth/forgot-password` — Request password reset

#### Jobs
- `POST /api/jobs` — Create job
- `GET /api/jobs` — List user''s jobs
- `GET /api/jobs/:id` — Get job details
- `PATCH /api/jobs/:id` — Update job
- `POST /api/jobs/:id/accept` — Fundi accepts job
- `POST /api/jobs/:id/complete` — Fundi marks complete
- `POST /api/jobs/:id/confirm-completion` — Customer confirms with OTP

#### Payments
- `POST /api/payments/stk-push` — Initiate M-Pesa payment
- `GET /api/payments/job/:jobId` — Get payment status
- `POST /api/payments/webhook` — M-Pesa webhook (signed)

### Rate Limits

- **Global** — 120 requests/minute
- **Auth** — 20 requests/15 minutes
- **OTP** — 10 requests/15 minutes

### Response Format

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

### Errors

```json
{
  "success": false,
  "message": "Error description"
}
```

### Contact

For API access: patafundi6@gmail.com', true, 23)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  body = EXCLUDED.body,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ── Help Articles ──────────────────────────────────────────────
-- Insert a comprehensive help article set
INSERT INTO policies (slug, title, category, body, is_published, sort_order) VALUES
('help-accounts', 'Account Help', 'help', '# Account Help

## How do I create an account?
Visit /auth and click "Sign up". Enter your name, email, and password. Verify your email with the OTP code sent to you.

## How do I reset my password?
Click "Forgot password" on the login page. Enter your email, check for the reset code, and create a new password.

## How do I change my phone number?
Go to Settings → Profile → Phone → Update. You''ll need to verify the new number with an OTP.

## How do I delete my account?
Go to Settings → Account → Delete Account. Enter your password to confirm. Account is soft-deleted; data is removed after 12 months.', true, 100),
('help-payments', 'Payment Help', 'help', '# Payment Help

## How do I pay for a job?
When your job is accepted, you''ll receive an M-Pesa STK push prompt. Enter your M-Pesa PIN to authorize payment.

## What is escrow?
Your payment is held securely in escrow until you confirm the job is complete. The fundi only gets paid after you confirm.

## How do refunds work?
If eligible, refunds are processed to your M-Pesa within 3-14 business days. See Refund Policy for details.

## Why was my payment declined?
Common reasons: insufficient M-Pesa balance, wrong PIN, network issues. Try again or contact support.', true, 101),
('help-jobs', 'Job Help', 'help', '# Job Help

## How do I create a job?
Go to Dashboard → Create Job. Select service, enter description, set budget, pick location. Submit and wait for a fundi to accept.

## How do I cancel a job?
Go to Job Details → Cancel. If the fundi hasn''t started, full refund. If fundi is en route, partial refund may apply.

## What if my fundi doesn''t show up?
Wait 30 minutes past the agreed time. Open the job and click "Report No-Show". You''ll receive a full refund.

## Can I rebook the same fundi?
Yes. Go to Job History → Completed Jobs → Rebook. Or save them to Favorites.', true, 102),
('help-refunds', 'Refund Help', 'help', '# Refund Help

## When am I eligible for a full refund?
- Fundi never arrived
- Duplicate payment
- Fraud detected
- Platform error

## How long do refunds take?
- M-Pesa to M-Pesa: 3-5 business days
- Bank transfer: 5-10 business days
- Disputed refunds: 7-14 business days

## My refund was denied. What now?
You can appeal within 7 days by emailing patafundi6@gmail.com with evidence.', true, 103),
('help-reviews', 'Review Help', 'help', '# Review Help

## How do I leave a review?
After job completion, you''ll be prompted to rate your fundi 1-5 stars and leave a comment.

## Can I edit my review?
No. Reviews are permanent once submitted. This ensures authenticity.

## What if I receive a fake review?
Report it via Report a Problem. Our team investigates and removes fake reviews.

## Can fundis respond to reviews?
Yes. Fundis can leave one public response to each review.', true, 104),
('help-fundis', 'Fundi Help', 'help', '# Fundi Help

## How do I become a fundi?
Visit /register/fundi. Submit your details, upload ID and selfie. Wait for admin approval (usually 1-2 business days).

## How do I get paid?
After job completion, funds go to your PataFundi wallet. Withdraw to M-Pesa via Wallet → Withdraw.

## How long do payouts take?
Payouts are processed within 24-48 hours of withdrawal request.

## What if I disagree with a bad review?
You can respond publicly to the review. If it''s fake or violates policy, report it.', true, 105),
('help-security', 'Security Help', 'help', '# Security Help

## How do I enable 2FA?
Go to Settings → Security → Enable 2FA. Scan the QR code with Google Authenticator, enter the code to confirm.

## What should I do if my account is hacked?
Immediately email patafundi6@gmail.com. We''ll freeze your account and investigate.

## Is my data safe?
Yes. We use AES-256 encryption for PII, TLS 1.3 for transit, and strict access controls. See Privacy Policy.

## How do I report fraud?
Use the Report a Problem feature, or email patafundi6@gmail.com with evidence.', true, 106)
ON CONFLICT (slug) DO UPDATE SET
  body = EXCLUDED.body,
  updated_at = now();

-- ── Add fine_schedule table for enforcement ────────────────────
CREATE TABLE IF NOT EXISTS fine_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_type text NOT NULL,
  offense_number integer NOT NULL CHECK (offense_number BETWEEN 1 AND 4),
  penalty text NOT NULL,
  fine_kes numeric(12,2),
  duration_days integer, -- for suspensions
  is_permanent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (violation_type, offense_number)
);

INSERT INTO fine_schedule (violation_type, offense_number, penalty, fine_kes, duration_days, is_permanent) VALUES
('fake_reviews', 1, 'Warning', null, null, false),
('fake_reviews', 2, 'KES 2,000 penalty', 2000, null, false),
('fake_reviews', 3, 'Account suspension', null, 30, false),
('payment_circumvention', 1, 'Warning', null, null, false),
('payment_circumvention', 2, 'KES 5,000 fine', 5000, null, false),
('payment_circumvention', 3, 'Permanent ban', null, null, true),
('fake_fundi_profile', 1, 'Immediate suspension', null, null, false),
('fake_fundi_profile', 2, 'Permanent ban', null, null, true),
('harassment', 1, 'Investigation + possible permanent ban', null, null, false),
('threats', 1, 'Immediate suspension', null, null, false),
('threats', 2, 'Permanent ban + reported to authorities', null, null, true),
('fraud', 1, 'Permanent ban + funds frozen + reported to authorities', null, null, true),
('identity_fraud', 1, 'Permanent ban + blacklist + reported to authorities', null, null, true),
('chargeback_fraud', 1, 'Account suspended + debt recovery', null, null, false),
('chargeback_fraud', 2, 'Permanent ban + reported to credit bureau', null, null, true)
ON CONFLICT (violation_type, offense_number) DO UPDATE SET
  penalty = EXCLUDED.penalty,
  fine_kes = EXCLUDED.fine_kes,
  duration_days = EXCLUDED.duration_days,
  is_permanent = EXCLUDED.is_permanent;

-- ── Add categories to policies table if missing ────────────────
-- (policies table already has category column from migration 016)
