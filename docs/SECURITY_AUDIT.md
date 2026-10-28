# Security audit status

**Status: NOT READY for production release.** This is an evidence record, not
a security certification or penetration test.

## Scope reviewed

The current application uses Express security middleware, rate limits on
authentication/payment/webhook/maps paths, role-based authorization,
company-specific access middleware, PostgreSQL-backed state, environment
secrets, private object-storage integration, and Docker/Kustomize deployment
templates. The repository includes admin allowlisting, OTP flows, payment
callbacks, upload endpoints, and external integrations; each still needs
provider/staging validation.

A read-only independent review of current changes returned no additional
high-confidence exploitable findings. It did not prove the entire platform
free of vulnerabilities. This review was not a penetration test and did not
exercise production systems.

## Dependency audit

At the latest root audit before safe updates, npm reported 30 issues
(10 moderate, 18 high, 2 critical). A non-forced `npm audit fix` updated
29 compatible packages and removed five, leaving **11** issues
(5 moderate, 6 high; 0 critical). `npm audit fix --force` was not used because
remaining recommendations require breaking dependency changes. Mobile audit
fresh audits currently report 43 for customer mobile (20 moderate, 23 high)
and 38 for Fundi mobile (15 moderate, 23 high). Each has 23 high findings and
exits nonzero. Direct affected dependencies include Expo, React Native, Expo
Notifications, and React Navigation packages; the rest are largely transitive
Expo/Metro/Jest/build dependencies. These counts are advisory totals, not
unique severity ratings for each installed artifact.

The findings include vulnerable transitive utilities/build dependencies and
SSR URL parsing/redirect-related packages. Triage each package's production
reachability and upgrade compatibility; do not treat a development-only
classification as automatic acceptance.

## Controls and remaining verification

- **Authentication/admin:** Admin role must be allowlisted and authenticated;
  do not rely on matching an email address alone. Test owner bootstrap,
  privilege changes, token expiry/revocation, OTP abuse controls, and
  production behavior in staging.
- **Tenant isolation:** Company membership and record ownership are checked
  server-side. Existing database regressions cover selected company isolation;
  continue endpoint-by-endpoint tests for company, Fundi, customer, staff, and
  finance resources.
- **Payments:** Verify callback authenticity, amount/currency, replay
  idempotency, association with the booking/customer, and transactional
  ledger updates using provider sandboxes. Client success is not proof of
  settlement.
- **Synthetic data:** Covered records have `is_demo` provenance and query
  filters. Regression coverage is not exhaustive across notifications,
  histories, staff reports, or AI analytics; production backfill needs
  reviewed staging data and a backup.
- **Uploads/SSRF:** Validate content type/size, private storage access, signed
  URLs, external URL fetch restrictions, and redirect handling with
  adversarial security tests. Do not claim these were penetration-tested.
- **Secrets/logging:** Store deployment/provider credentials in a secret
  manager or environment injection. Do not commit `.env` files, print
  environment files, or put secrets in mobile `EXPO_PUBLIC_*` variables.
- **Containers:** API and nginx runtime images use non-root identities;
  K8s manifests set non-root/read-only filesystems and drop capabilities.
  Actual cluster policy behavior remains unverified.

## Required gates

1. Re-run root and per-mobile `npm audit` using committed lockfiles; resolve
   high findings or explicitly assess and approve each residual risk.
2. Review the full auth, authorization, upload, webhook, CORS/CSRF, and
   external-fetch paths in an isolated staging environment.
3. Exercise role and tenant boundaries using genuine and synthetic test
   fixtures.
4. Validate secrets, HTTPS/cookies, TLS verification, backup/restore,
   monitoring, incident response, and access review before launch.
