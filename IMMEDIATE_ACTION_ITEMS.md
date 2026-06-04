# IMMEDIATE ACTION ITEMS

**Priority Level**: BLOCKING  
**Timeline**: Complete before production launch

---

## 🔴 CRITICAL (Must Fix - Week 1)

### 1. M-Pesa Integration
**File**: `supabase/functions/payments/index.ts` (line 118)

**Current State**: Mock/demo mode only
```typescript
// TODO: Real M-Pesa Daraja API integration
console.log(`[payments] Would send STK push to ${mpesaNumber} for KES ${amount}`);
```

**Action Items**:
- [ ] Get M-Pesa Daraja API credentials from Safaricom
- [ ] Implement STK push endpoint
- [ ] Add callback URL handler for payment confirmations
- [ ] Implement payout to fundi M-Pesa account
- [ ] Add payment reconciliation logic
- [ ] Test with M-Pesa sandbox
- [ ] Create payment state machine (pending → confirmed → failed)

**Estimated Time**: 2-3 days

---

### 2. NPM Security Vulnerabilities
**Command**: `npm audit`

**Action Items**:
- [ ] Run `npm audit` to see detailed list
- [ ] Run `npm audit fix` to auto-fix
- [ ] Review remaining high/critical issues
- [ ] Update dependencies manually if needed
- [ ] Test application after fixes

**Estimated Time**: 4-6 hours

---

### 3. JWT Token Security
**File**: `src/App.tsx` (line 60) and Auth pages

**Current State**: JWT stored in localStorage (XSS vulnerable)

**Action Items**:
- [ ] Move JWT to httpOnly cookies
- [ ] Update API client to use cookies automatically
- [ ] Add CSRF protection
- [ ] Remove localStorage.getItem('auth_token') calls
- [ ] Test authentication flow

**Estimated Time**: 1 day

---

## 🟠 HIGH (Should Fix - Week 2)

### 4. API Rate Limiting
**Missing**: No rate limiting on endpoints

**Action Items**:
- [ ] Implement rate limiting middleware
- [ ] Configure per IP limits
- [ ] Configure per user limits
- [ ] Add rate limit headers to responses
- [ ] Test under load

**Estimated Time**: 1 day

---

### 5. Admin Role Verification
**Issue**: Admin check only on client side

**Files Affected**:
- `App.tsx` - Client-side check
- Admin endpoints - Need server-side verification

**Action Items**:
- [ ] Add role verification middleware on backend
- [ ] Check admin role for every admin endpoint
- [ ] Add audit logging for admin actions
- [ ] Test unauthorized access rejection

**Estimated Time**: 1 day

---

### 6. Bundle Size Optimization
**Current**: 1.2MB (336KB gzipped)

**Action Items**:
- [ ] Implement code splitting for routes
- [ ] Lazy load admin pages
- [ ] Lazy load 3D components (if used)
- [ ] Remove unused Three.js if not needed
- [ ] Review and remove unused dependencies
- [ ] Analyze with `vite-plugin-visualizer`

**Estimated Time**: 2 days

---

## 🟡 MEDIUM (Nice to Have - Week 3)

### 7. End-to-End Testing
**Missing**: No E2E tests

**Action Items**:
- [ ] Set up Cypress or Playwright
- [ ] Create tests for critical flows:
  - User registration
  - Job creation
  - Job acceptance
  - Payment processing
  - Review submission
  - Dispute creation
- [ ] Run tests in CI/CD

**Estimated Time**: 2-3 days

---

### 8. Monitoring & Error Tracking
**Current**: Minimal logging

**Action Items**:
- [ ] Set up Sentry for error tracking
- [ ] Add structured logging
- [ ] Create monitoring dashboard
- [ ] Set up alerts for critical errors
- [ ] Configure uptime monitoring

**Estimated Time**: 1 day

---

### 9. React Hook Dependencies
**Warnings**: 7 missing dependency array items

**Action Items**:
- [ ] Add missing dependencies to useEffect
- [ ] Use useCallback for functions
- [ ] Use useMemo for expensive computations
- [ ] Re-run lint to verify

**Files**:
- `src/components/fundi/FundiTracker.tsx` (line 181)
- `src/pages/FundiPendingApproval.tsx` (line 53)
- `src/pages/HelpCenter.tsx` (line 39)
- `src/pages/admin/AuditLogs.tsx` (line 52)
- `src/pages/admin/CustomerManagement.tsx` (line 72)
- `src/pages/admin/FundiVerificationManagement.tsx` (line 70, 88)
- `src/pages/admin/JobManagement.tsx` (line 75)
- `src/pages/admin/ReportsAnalytics.tsx` (line 62)

**Estimated Time**: 2-3 hours

---

## SEQUENTIAL EXECUTION PLAN

### Week 1 (Critical)
```
Day 1: M-Pesa + Sandbox Testing
- Get credentials
- Implement STK push
- Test with sandbox

Day 2: M-Pesa Callbacks + Payouts
- Implement callback handler
- Implement payout logic
- End-to-end test

Day 3: Security Fixes
- npm audit fix
- Move JWT to cookies
- Add CSRF protection

Day 4: Testing & QA
- Full payment flow test
- Auth flow test
- Edge case testing

Day 5: Buffer & Review
```

### Week 2 (High Priority)
```
Day 1-2: Rate Limiting
- Implement rate limiting
- Configure limits
- Load testing

Day 3-4: Admin Verification
- Backend role checks
- Audit logging
- Authorization tests

Day 5: Bundle Optimization (start)
```

### Week 3 (Medium Priority)
```
Day 1-2: Bundle Optimization (complete)
Day 3-4: End-to-End Tests
Day 5: Review & Polish
```

---

## TESTING CHECKLIST

### Before Each Commit
- [ ] `npm run lint` - No new errors
- [ ] `npm run typecheck` - No TypeScript errors
- [ ] `npm run build` - Successful build
- [ ] Manual testing of changed features

### Before Staging Deployment
- [ ] All critical fixes complete
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit passed

### Before Production Deployment
- [ ] 1 week in staging with load testing
- [ ] All metrics green
- [ ] Incident response plan ready
- [ ] Rollback procedure tested

---

## MONITORING AFTER LAUNCH

### First 24 Hours
- [ ] Check error rates
- [ ] Monitor payment processing
- [ ] Monitor API response times
- [ ] Check database performance

### First Week
- [ ] Monitor user registration flow
- [ ] Track payment success rate
- [ ] Monitor job matching
- [ ] Check for security issues

### Ongoing
- [ ] Daily error rate review
- [ ] Weekly performance review
- [ ] Monthly security audit
- [ ] Quarterly dependency updates

---

## ESTIMATED TOTAL TIME

- **Critical Fixes**: 5 days
- **High Priority Fixes**: 3 days
- **Medium Priority**: 5 days
- **Testing & QA**: 3 days
- **Deployment Prep**: 2 days

**Total**: 18 days (3-4 weeks)

**Recommended Launch Date**: ~4 weeks from now

---

## SUCCESS CRITERIA

Launch is approved when:
- ✅ All critical blockers resolved
- ✅ 19 npm vulnerabilities fixed
- ✅ Production build under 500KB gzipped
- ✅ All tests passing
- ✅ Staging environment runs stable 1 week
- ✅ Security audit passed
- ✅ Load testing passed (1000 concurrent users)
- ✅ All team members signed off

---

**Generated**: June 4, 2026
