-- Migration 040: real policy content (master prompt §51)
-- Replaces one-paragraph policy stubs with real, structured product policies.
-- Sections are written as markdown; the content controller splits on '## '
-- headings into renderable sections.

update policies set title = 'Terms of Service', version = 2, updated_at = now(),
body = $policy$## 1. About PataFundi and the marketplace role

PataFundi is a technology marketplace that connects customers with independent professionals (Fundis) and verified service companies. PataFundi is not the employer, partner, or agent of any Fundi or company. Providers decide how to perform work; PataFundi provides discovery, booking, communication, payments, escrow, and dispute-resolution tools. Depending on the country of operation, PataFundi may be classified as an intermediary or e-commerce platform under local law.

## 2. Customer responsibilities

Customers agree to: provide accurate job information, photos, and access details; be reachable at the agreed time or reschedule in advance; pay through PataFundi escrow and never arrange off-platform payments; treat providers with respect; inspect completed work before confirming completion; and release escrow promptly by confirming completion or responding to completion requests. Repeatedly confirming completion dishonestly, or refusing to confirm satisfactorily completed work without good reason, is a violation of these terms.

## 3. Provider (Fundi and company) responsibilities

Providers agree to: hold any licenses or certifications their trade legally requires; perform work with reasonable skill and care; quote honestly and obtain customer approval before price changes; arrive on time or communicate delays; keep communication and payments on the platform; honor cancellations they accept; and never subcontract a job to a person not registered on PataFundi without the platform's knowledge.

## 4. Payments, escrow, and payouts

Customer payments are held in escrow and released to the provider only after the customer confirms completion (or automatically after the dispute window closes without a dispute). PataFundi charges a service commission on completed jobs, shown transparently before you accept a booking. M-Pesa and card payments are processed by licensed payment processors; PataFundi never stores full card numbers. Payouts are processed to the payout destination configured by the provider, subject to fraud and eligibility checks.

## 5. Cancellations

Customers may cancel free of charge before a provider accepts. After acceptance, later cancellations may be charged a fair cancellation fee to compensate the provider for lost work. Providers who cancel accepted jobs without good reason receive strikes under the Enforcement Policy. In emergencies (e.g. gas leaks, flooding), contact local emergency services first, then PataFundi support.

## 6. Disputes

If work is not satisfactory, raise a dispute from the job page within the stated window. PataFundi's support team reviews evidence (photos, chat, check-in records, completion codes) and may approve a full refund, a partial refund, or a rework. Escrow remains frozen while a dispute is open. Parties agree to cooperate honestly with the investigation and to accept the outcome, which is final within the platform.

## 7. Prohibited behavior

Prohibited on PataFundi: off-platform payment deals, harassment or discrimination, fraud or fake bookings, fake reviews or review manipulation, impersonation, account sharing or resale, unlawful or unsafe work, and use of the platform to advertise or route customers to competing services. Violations are handled under the Enforcement Policy.

## 8. Account suspension and termination

PataFundi may suspend or terminate accounts that violate these terms, that create legal or safety risk, or that have been inactive in breach of local law. You may close your account at any time from Settings; data retention and deletion follow the Privacy Policy. Terminated providers remain liable for outstanding commissions and unresolved jobs.

## 9. Liability limitations

PataFundi provides the platform "as is" and does not guarantee the quality, safety, or legality of services performed by providers. To the maximum extent permitted by law, PataFundi's liability for any claim relating to a booking is limited to the commission PataFundi earned on that booking. Nothing in these terms limits liability for gross negligence, willful misconduct, or anything else that cannot be limited under applicable law.

## 10. Changes, governing law, and jurisdiction notice

These terms may be updated as the platform evolves; material changes will be announced in-app. This document is a product-level policy prepared for global launch and MUST be reviewed and adapted by qualified local counsel in each launch jurisdiction before commercial operation, to reflect mandatory local consumer-protection, labor, tax, and data-protection law.
$policy$
where slug = 'terms';

update policies set title = 'Privacy Policy', version = 2, updated_at = now(),
body = $policy$## 1. Data PataFundi collects

Account data: name, email, phone number, and, for providers, skills, documents, and payout details. Job data: service type, description, photos, and job location. Device data: device model, operating system, and app version, used to fix crashes and improve performance. We collect only what the platform needs to operate a service marketplace.

## 2. Location data

With your permission, PataFundi collects precise location to match you with nearby providers, calculate arrival estimates, and enable live job tracking. Customers can deny location and still use the app with manual addresses; Fundis must share location while on an active job because that is part of the service. Background location, where used, is limited to finding work when you are online and can be stopped by going offline.

## 3. Identity verification

To keep the marketplace safe, Fundi identity verification compares your government ID with a selfie liveness check. Verification documents are stored privately, reachable only to authorized platform staff through logged, signed access, and never shown to other users. Companies verify registration documents and beneficial-owner information.

## 4. Payment data

Payments are processed by licensed payment partners (e.g. M-Pesa/Daraja, card acquirers). PataFundi stores transaction records, amounts, and statuses - not full card numbers. Payout destinations (e.g. Paybill/till, bank) are stored to send you your earnings.

## 5. Communications

In-app chat, notifications, and support tickets are stored to protect both sides (e.g. to resolve disputes) and to improve service. We screen chat for off-platform payment attempts and abuse. We do not sell your data and we do not share your phone number with other users before a job is matched.

## 6. AI processing

PataFundi uses AI to classify job descriptions, suggest questions, and power staff insight tools. AI systems process job text, category data, and platform metrics on the server; they never fabricate results presented as fact. AI outputs are estimates or routing aids, reviewed by humans where decisions affect money or accounts.

## 7. Retention

Account and job records are kept while your account is active and as required by tax and consumer-protection law. Verification documents are retained per legal requirements and deleted on a defined schedule after. Backups roll off on their normal cycle.

## 8. Your rights

Depending on your jurisdiction you may have rights to access, correct, export, or delete your data, and to object to certain processing. Use Settings or the privacy request tools in-app (data export and deletion requests are built into the platform). We respond within statutory timelines. You can also contact the privacy channel at support@patafundi.com.

## 9. Jurisdiction notice

This policy describes PataFundi's global baseline. Before commercial launch in a country, it must be reviewed by local counsel to align with that country's data-protection law (e.g. Kenya Data Protection Act, GDPR where applicable).
$policy$
where slug = 'privacy';

update policies set title = 'Cookie Policy', version = 2, updated_at = now(),
body = $policy$## 1. What cookies PataFundi uses

Essential cookies keep you signed in (authentication session and refresh tokens), protect forms (CSRF tokens), and remember security choices. These are required for the platform to work and cannot be switched off.

## 2. What we do not use

PataFundi does not use third-party advertising or cross-site tracking cookies. We do not sell cookie-derived data to data brokers.

## 3. Managing cookies

You can clear or block cookies in your browser settings; blocking essential cookies will sign you out and may prevent login. For questions about cookie use, contact support@patafundi.com.
$policy$
where slug = 'cookies';

update policies set title = 'Refund Policy', version = 2, updated_at = now(),
body = $policy$## 1. When refunds are available

Because payments sit in escrow until completion, refund eligibility is straightforward: if a provider never arrived, did not do the agreed work, or the work failed inspection, you are eligible for a refund. If work was partly done, a partial refund reflecting the value delivered may be approved. Satisfactorily completed and confirmed jobs are paid to the provider and are not refundable except where the provider agrees or a warranty applies.

## 2. How to request a refund

Open the job, choose "Request refund" or file a dispute, select the transaction, describe the reason, and attach photos as evidence. Requests must be raised within the dispute window shown on the job. The provider is notified and may respond with their own evidence.

## 3. Investigation and outcomes

PataFundi support reviews chat, photos, check-in records, and completion codes, then decides: full refund, partial refund, rework by the provider, or payment release to the provider. Escrow stays frozen while the case is open. Decisions are recorded with reasons in an audit log and communicated to both parties.

## 4. Processing time and channels

Approved refunds are returned through the original payment channel. M-Pesa refunds are typically processed within a few business days; card refunds depend on the card issuer. Refunds are never paid in cash and never outside the platform.

## 5. Jurisdiction notice

This policy is PataFundi's product baseline. Local consumer-protection law (statutory cooling-off rights, mandatory warranty regimes, etc.) prevails where it grants the customer stronger rights, and must be confirmed by counsel per launch jurisdiction.
$policy$
where slug = 'refund-policy';

update policies set title = 'Safety Guidelines', version = 2, updated_at = now(),
body = $policy$## 1. Provider verification

Every Fundi on PataFundi passes email/phone verification, a government-ID check with selfie liveness matching, and manual approval before receiving jobs. Companies verify business registration and team structure. Trust levels and reviews are built from real completed jobs only - never buy or sell reviews.

## 2. Customer safety

Let someone know when a provider is coming; the live-tracking map shows exactly that. Keep communication in the app - chat and calls through PataFundi are logged and protect you. Never pay outside the platform: escrow exists so that money only moves when work is confirmed. If something feels unsafe, use the SOS button (Fundi app) or leave, then report the incident.

## 3. Provider safety

Confirm job details before traveling. Check in and out on the job to timestamp your work. If a customer requests off-platform payment, refuse - it voids your protections and voids the customer's escrow protection. Report abusive customers through the job page; repeated abuse removes them from the platform.

## 4. Reporting and suspicious behavior

Report: requests to pay outside PataFundi, pressure to cancel and rebook privately, identity mismatch at the door, unsafe working conditions, and discrimination. Reports go to the Trust & Safety team and are investigated with the full in-app evidence trail. Serious incidents (theft, threats, injury) should also be reported to local police first.

## 5. Emergencies

For fires, gas leaks, electrical hazards, flooding, or medical emergencies, contact local emergency services FIRST. PataFundi support can help with follow-up (cancellations, refunds, rebooking) but cannot dispatch emergency services.
$policy$
where slug = 'safety';

update policies set title = 'Platform Rules', version = 2, updated_at = now(),
body = $policy$## 1. Prohibited conduct

On PataFundi you must not: defraud other users or the platform; book jobs you never intend to complete; discriminate against people by ethnicity, religion, gender, disability, or any protected characteristic; harass, threaten, or abuse anyone in chat, calls, or on site; perform work you are not qualified or licensed for; or use another person's identity or documents.

## 2. Off-platform circumvention

Moving communication or payment off-platform voids every protection PataFundi provides: no escrow, no dispute support, no insurance, no verification history. Sharing contact details to arrange private deals, invoicing outside the platform, or cancel-and-rebook privately are violations. Detection tools flag suspicious patterns automatically and Trust & Safety reviews flagged accounts.

## 3. Reviews and ratings

Only users with a real completed booking can review it. Fake reviews, review swapping, incentivized reviews, and pressuring someone for a 5-star rating are prohibited. Reviews may be moderated for abuse or private data, but ratings are never edited to inflate or punish anyone.

## 4. Accounts

One person, one account. Account sharing, selling accounts, and operating accounts for someone who was banned are prohibited. Staff accounts have scoped permissions and are audited; misusing staff access is grounds for immediate termination and legal action.

## 5. Fair marketplace conduct

Companies and Fundis must not spam-broadcast to poach each other's customers, scrape the platform, or manipulate search (keyword stuffing, fake profiles, false pricing). Pricing shown must be honest; bait pricing is a violation.
$policy$
where slug = 'platform-rules';

update policies set title = 'Enforcement Policy', version = 2, updated_at = now(),
body = $policy$## 1. How enforcement works

Violations are handled proportionately using a strike system: 1) Warning with an explanation of the rule; 2) Temporary suspension of the relevant capability (e.g. receiving jobs, booking); 3) Extended suspension pending review; 4) Permanent ban. Serious violations - fraud, threats, identity theft, safety endangerment - skip straight to a permanent ban.

## 2. What triggers enforcement

Confirmed reports from users, automated fraud and safety detection, and Trust & Safety investigations. Evidence considered includes in-app chat, job timelines, check-in records, photos, payment data, and prior history. Money is protected during investigations: escrow is frozen, payouts pause.

## 3. Appeals

If you believe action against your account is wrong, appeal through support within the window stated in the notice. Appeals are reviewed by a staff member who was not part of the original decision. Outcomes are final and recorded.

## 4. Staff accountability

Platform staff actions (approvals, refunds, suspensions) are permission-scoped and audit-logged. Staff abuse of tooling is treated with the same severity as user fraud.
$policy$
where slug = 'enforcement';
