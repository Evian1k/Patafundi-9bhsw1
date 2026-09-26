# PATAFUNDI COMPANY ECOSYSTEM SPEC

Status: PARTIAL, with core company application and company portal implementation in place, but not yet complete as a full end-to-end company marketplace.

## 1. Executive assessment

This project contains a real company concept, but it is not yet a complete company marketplace. The current repo shows company application and portal scaffolding plus backend ownership checks, but the full lifecycle is not yet completed across public website, customer booking, company operations, technician dispatch, company settlement, audits, and secure cross-company isolation.

Evidence in the current codebase:
- Company application logic exists in [backend/src/controllers/companyController.js](backend/src/controllers/companyController.js)
- Company routes exist in [backend/src/routes.js](backend/src/routes.js)
- Company public page exists in [src/pages/CompanyPage.tsx](src/pages/CompanyPage.tsx)
- Company demo and company routes exist in [src/routes/AppRoutes.tsx](src/routes/AppRoutes.tsx)
- Demo account flow exists in [src/pages/DemoPage.tsx](src/pages/DemoPage.tsx)

## 2. Product definition

PataFundi must support three provider concepts:

1. Individual Fundi
2. Company Partner
3. Company Technician

The system must clearly distinguish these in customer-facing UI and in backend ownership relations.

### Required business semantics
- A company is not merely a user account.
- A company is a verified business entity with a tenant boundary.
- A technician belongs to a company and is scoped to that company.
- Customer-facing provider cards must label provider type explicitly.
- Company-scoped records must be protected by tenant checks.

## 3. Company lifecycle model

The required lifecycle is:

PUBLIC DISCOVERY
→ PARTNER APPLICATION
→ VERIFICATION
→ APPROVAL
→ COMPANY ONBOARDING
→ COMPANY PROFILE
→ SERVICES
→ BRANCHES
→ TEAM / TECHNICIANS
→ JOBS
→ DISPATCH
→ SERVICE DELIVERY
→ CUSTOMER CONFIRMATION
→ PAYMENT
→ COMPANY SETTLEMENT
→ PERFORMANCE
→ REVIEWS
→ SUPPORT / DISPUTES
→ SUSPENSION / REACTIVATION

### Current status
- Partner application creation: PARTIAL / IMPLEMENTED
- Partner approval workflow: PARTIAL / IMPLEMENTED
- Company profile creation: PARTIAL / IMPLEMENTED
- Company portal overview: PARTIAL / IMPLEMENTED
- Technician assignment: PARTIAL / IMPLEMENTED
- Full company operations portal: PARTIAL / NOT COMPLETE
- Cross-company isolation: PARTIAL / IMPLEMENTED in core checks but not fully enforced across all routes
- Company settlement flow: PARTIAL / NOT COMPLETE
- Company review and performance flow: PARTIAL / NOT COMPLETE
- Company suspension/reactivation flow: NOT IMPLEMENTED end-to-end

## 4. Customer-company experience requirements

### Required customer behavior
- Customers can search for Individual Fundis and Companies.
- Provider cards must clearly show verified provider type.
- Customer must never confuse a company with a fundi or technician.
- Company-specific profile must show only customer-safe data.

### Required customer-safe sections
- Company intro
- Services catalog
- Areas served
- Branches (customer-safe only)
- Reviews and ratings
- Warranty / guarantee information
- Availability information
- Public stats only

### Must never be exposed to customers
- company revenue
- platform commission data
- settlement calculations
- payroll data
- private employee data
- internal finance data
- internal admin notes
- internal fraud data
- private customer records
- private company documents

### Status
- Customer-safe company profile concept: PARTIAL / DESIGN-READY
- Actual customer booking flow with company service catalog: PARTIAL / NOT FULLY ENFORCED
- Company information boundary controls: PARTIAL / REQUIRES AUTHORIZATION HARDENING

## 5. Company booking and job flow

Required flow:

Customer
→ Search service
→ Select Company or Fundi
→ View profile
→ Select service
→ Select property/location
→ Describe issue
→ Add photos
→ Choose urgency
→ Request service
→ Backend creates job

Required backend job linkage:
- customer
- company
- service
- property/location
- status
- assignment
- payment state

### Current repo status
- Job creation API exists in [backend/src/routes.js](backend/src/routes.js)
- Company-related job assignment exists in [backend/src/controllers/companyController.js](backend/src/controllers/companyController.js)
- Full end-to-end company job flow is PARTIAL

## 6. Company receives jobs and accepts them

Required logic:
- Company must be active
- Company must be approved
- Company must be eligible
- Company must support the selected service
- Company must support the service area
- Company must not be suspended
- Job must not already be assigned

### Current status
- Validation logic exists partially in company assignment checks
- Full lifecycle enforcement across all job creation paths remains PARTIAL

## 7. Company dispatch and technician assignment

Required process:
- Company receives a job request
- Company views available technicians
- Company assigns a technician to the job
- Backend verifies technician belongs to the company
- Technician must be active and eligible
- Assignment must be authorized and audited

Current code evidence:
- `assignTechnicianToJob` is implemented in [backend/src/controllers/companyController.js](backend/src/controllers/companyController.js)
- route is registered in [backend/src/routes.js](backend/src/routes.js)

Status: PARTIAL / implemented in core API but not validated against full live workflow and tenant rules.

## 8. Technician scope

Technician must see only their own job/workflow, not the full company dashboard or settlement data.

Required technician surfaces:
- My Dashboard
- My Jobs
- Job Details
- Arrival / Work / Evidence / Completion
- Notifications
- Profile

Must not access:
- company revenue
- company payouts
- payroll
- other technicians' private data
- company admin config
- internal settlement logic
- super-admin tools

Status: PARTIAL / concept exists, not fully separated and validated in UI and API.

## 9. Customer tracking and status lifecycle

The platform must manage lifecycle states like:
- assigned
- on_the_way
- arrived
- working
- completion_requested
- completed

The status model must be backend-owned, not frontend-only strings.

Status: PARTIAL / backend supports job status and some company assignment handling, but the full lifecycle is not fully validated end-to-end.

## 10. Evidence and customer confirmation

Required:
- technician/company upload photos and evidence
- customer sees customer-safe evidence
- completion requires customer confirmation / explicit approval
- funds are only released after server confirmation

Status: PARTIAL / evidence model exists in jobs but not fully mapped to a full company evidence workflow.

## 11. Payment and settlement flow

Required flow:
- customer pays via payment provider
- server verifies transaction
- escrow / hold if applicable
- completion triggers customer confirmation
- server calculates settlement
- company payout is created
- platform revenue is separated
- audit trail remains

Current repo status:
- payment and payout APIs exist in [backend/src/routes.js](backend/src/routes.js)
- company settlement logic is not a full, complete company finance domain

Status: PARTIAL / not complete end-to-end.

## 12. Company portal structure

The company portal should include:
- Dashboard
- My Business
- Team
- Operations
- Customers
- Schedule
- Finance
- Quality
- Support
- Notifications
- Settings

Current repo status: PARTIAL / company page exists, but the company portal architecture is not yet fully implemented as a complete role-scoped dashboard system.

## 13. Company application workflow

Required public flow:
- Partner With PataFundi CTA
- Company application form
- Application status tracking
- Admin review
- Approval / rejection / request for more info

Current repo status:
- Application creation and approval exist in [backend/src/controllers/companyController.js](backend/src/controllers/companyController.js)
- UI is not yet a complete application workflow with full public status tracking and admin actions

Status: PARTIAL / implemented in backend, incomplete in product UI.

## 14. Super Admin company management

Required admin flows:
- company applications
- approved companies
- suspended companies
- rejected applications
- company detail review
- verification docs
- branches, technicians, jobs, performance, settlements, disputes, audit log

Current repo status:
- admin may review applications by role check
- no full super-admin company management UI is clearly implemented across the app

Status: PARTIAL / backend support exists but admin UI is incomplete.

## 15. Branches and team model

Required:
- company branches
- team roles and permission boundaries
- company-scoped records with company_id
- data isolation by tenant

Current repo status:
- Company model exists in DB and controller, but the broader company tenant system is not consistently implemented through all screens and APIs.

Status: PARTIAL.

## 16. Tenant and security requirements

This is mandatory. Every company-scoped record must be associated with company_id and checked by authorization.

Company A must not access Company B data.

This requirement is partly represented in the controller checks, but not fully validated across all endpoints or screens.

Status: PARTIAL / backend logic exists but full cross-tenant enforcement is not proven across the full application.

## 17. Database model

The current architecture includes several company-related entities in the repo and should support:
- users
- profiles
- companies
- company_members
- company_roles
- company_branches
- company_services
- company_service_areas
- technicians
- company_technician_assignments
- company_applications
- company_verification_documents
- jobs
- job_assignments
- quotes
- reviews
- payments
- financial_transactions
- company_settlements
- payouts
- disputes
- guarantees
- notifications
- messages
- audit_logs

The existing repo has company application and company profile structures already, but not all of the full company domain is implemented at the same maturity.

Status: PARTIAL.

## 18. API and server-side requirements

Required server-side actions:
- createCompanyApplication
- submitCompanyApplication
- reviewCompanyApplication
- approveCompany
- rejectCompany
- suspendCompany
- reactivateCompany
- updateCompanyProfile
- createCompanyBranch
- updateCompanyBranch
- createCompanyService
- updateCompanyService
- addCompanyMember
- removeCompanyMember
- createTechnician
- assignTechnician
- unassignTechnician
- acceptCompanyJob
- declineCompanyJob
- createQuote
- submitQuote
- approveQuote
- calculateCompanySettlement
- requestCompanyPayout
- createCompanyDispute
- sendCompanyNotification

Current repo has part of this:
- createPartnerApplication
- approvePartnerApplication
- getCompanyPortalOverview
- assignTechnicianToJob

Status: PARTIAL / not complete for all required APIs.

## 19. Screen inventory status

### Public screens
- Partner With PataFundi: PARTIAL / design present, not complete app flow
- Company Application: PARTIAL / backend exists, UI incomplete
- Application Status: PARTIAL / not fully connected

### Customer screens
- Company Search Card: PARTIAL / design concept exists, not complete search results logic
- Company Profile: PARTIAL / exists as page shell
- Company Services: PARTIAL
- Company Reviews: PARTIAL
- Company Booking: PARTIAL
- Company Job Tracking: PARTIAL
- Assigned Technician: PARTIAL
- Company Service History: NOT IMPLEMENTED
- Company Review: NOT IMPLEMENTED

### Company screens
- Login: PARTIAL / general auth exists
- Onboarding: PARTIAL
- Approval Status: PARTIAL
- Dashboard: PARTIAL
- Company Profile: PARTIAL
- Verification: PARTIAL
- Services: PARTIAL
- Service Areas: PARTIAL
- Branches: PARTIAL
- Technicians: PARTIAL
- Team: PARTIAL
- Incoming Jobs: PARTIAL
- Job Details: PARTIAL
- Dispatch: PARTIAL
- Active Jobs: PARTIAL
- Completed Jobs: PARTIAL
- Job History: PARTIAL
- Calendar: NOT IMPLEMENTED
- Customers where permitted: NOT IMPLEMENTED
- Ratings: PARTIAL
- Performance: PARTIAL
- Earnings: PARTIAL
- Settlements: PARTIAL
- Disputes: PARTIAL
- Guarantees: NOT IMPLEMENTED
- Notifications: PARTIAL
- Messages: NOT IMPLEMENTED
- Settings: PARTIAL
- Security: PARTIAL

### Technician screens
- Dashboard: PARTIAL
- My Assignments: PARTIAL
- Job Details: PARTIAL
- Navigation: PARTIAL
- Arrival: PARTIAL
- Work: PARTIAL
- Evidence: PARTIAL
- Completion: PARTIAL
- History: PARTIAL
- Notifications: PARTIAL
- Profile: PARTIAL

### Super Admin screens
- Company Applications: PARTIAL
- Company Verification: PARTIAL
- Companies: PARTIAL
- Company Detail: PARTIAL
- Documents: PARTIAL
- Branches: PARTIAL
- Technicians: PARTIAL
- Jobs: PARTIAL
- Performance: PARTIAL
- Settlements: PARTIAL
- Disputes: PARTIAL
- Audit Log: PARTIAL

## 20. Actual runtime evidence

The following checks were performed in the current environment:

- Backend /health returned HTTP 200
- Frontend homepage returned HTTP 200
- Demo login request returned HTTP 200 and a valid JWT
- Proxy to /api/fundi/ratings returned HTTP 200

Observed outputs:
- `HOME_STATUS: 200`
- `LOGIN_STATUS: 200`
- `RATINGS_STATUS: 200`
- response contained a valid demo customer token and user payload

This confirms the site is live and connected to the backend, but it does not yet prove the full company marketplace lifecycle is complete.

## 21. Final status summary

### Complete
- Basic app startup and backend/frontend connectivity: PASS WITH LIMITATIONS
- Basic public web app route availability: PASS WITH LIMITATIONS
- Basic demo customer login: PASS WITH LIMITATIONS
- Company application backend foundation: PARTIAL
- Company portal overview backend: PARTIAL
- Company technician assignment backend: PARTIAL

### Blocked / missing
- Full company partner application public UI with status tracking: BLOCKED / INCOMPLETE
- Full company onboarding journey: BLOCKED
- Complete company dispatch interface: BLOCKED
- Full company finance/settlement flow: BLOCKED
- Full technician dashboard isolation: BLOCKED
- Full cross-company tenant enforcement across all screens/APIs: BLOCKED
- Full business/company portal as a distinct marketplace surface: PARTIAL
- Full end-to-end company lifecycle test with real accounts: NOT IMPLEMENTED

## 22. Required next milestone

The next step is not “more marketing screens.” The next step is to finish the actual company tenant ecosystem, with a clear distinction between:
- customer marketplace
- company marketplace
- company operations
- company dispatch
- company finance
- company tech workflow
- company tenant security
- admin review

The implementation should be built as a connected business layer, not a collection of isolated pages.
