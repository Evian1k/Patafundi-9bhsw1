# Fundi Verification Checklist

Daily review of pending fundi applications. Target: every application reviewed
within 24 hours of submission.

## Access

- **Dashboard:** `https://patafundi.vercel.app/admin/fundis`
- **API:** `GET /api/admin/fundis?status=pending`
- **Login:** admin credentials (contact ops if you don't have them)

## Daily Review Process (10–15 min)

### 1. Fetch pending applications
- Open the dashboard, filter by `approval_status = pending`
- Or: `curl -H "Authorization: Bearer <token>" https://patafundi-9bhsw1.onrender.com/api/admin/fundis?status=pending`

### 2. For each application, review:

#### Identity documents
- Click the fundi row → "View Documents"
- Verify ID front is legible (not blurry, not cut off)
- Verify ID back is legible (if uploaded)
- Verify selfie matches the ID photo (face match score ≥ 75 = strong match)
- Check blur score (≥ 15 = acceptable)
- Check for duplicate perceptual hash (flagged if ≥ 92% match with another user)

#### Personal info
- Full name matches ID
- Phone number is a valid Kenyan number (2547XXXXXXXX or 2541XXXXXXXX)
- ID number is not already registered to another fundi
- Skills list is reasonable (not empty, not spam)

#### Fraud signals
- Fraud risk score (≤ 25 = acceptable)
- Trust score (≥ 30 = acceptable)
- No prior fraud alerts on the account

### 3. Decision

#### Approve (target: most applications)
- Click "Approve" → fundi's role flips to `fundi`, can accept jobs
- Only approve if: face match ≥ 75, fraud risk ≤ 25, ID is legible
- After approval, fundi receives an email + in-app notification

#### Reject
- Click "Reject" with reason
- Use when: fake ID, face match < 60, duplicate identity, obvious fraud
- After rejection, user's role stays `fundi_pending` and they can re-apply
- Revokes all active sessions (forces re-login)

#### Request re-upload
- Click "Request Re-upload" with reason
- Use when: blurry photo, missing back of ID, wrong file type
- Sets `verification_review_status = 'reupload_requested'`
- Fundi receives an email explaining what to fix

#### Suspend (rare)
- Click "Suspend" with reason
- Use when: post-approval misconduct reported, pending investigation
- Revokes active sessions; fundi cannot log in or accept jobs

## Escalation

| Scenario | Action |
|---|---|
| Suspected fake ID | Reject + ban (do not approve pending investigation) |
| Duplicate selfie across accounts | Reject both + ban + fraud alert |
| Face match score 60–74 | Request re-upload (ask for clearer selfie) |
| Face match score < 60 | Reject |
| Blur score < 15 | Request re-upload |
| Fraud risk score > 25 | Reject + manual investigation |
| ID number matches existing fundi | Reject + fraud alert |
| Phone number looks automated (+254700000000) | Reject |

## Auto-Approval (Future)

The system supports auto-approval via `tryAutoApprove()` in
`identityVerificationService.js`. Currently disabled — every application
requires manual review. To enable:

1. Set thresholds in `identityVerificationService.js`:
   - `AUTO_APPROVE_FACE = 95`
   - `AUTO_APPROVE_LIVENESS = 95` (not used — liveness not implemented)
   - `AUTO_APPROVE_FRAUD_MAX = 10`
2. Call `tryAutoApprove(fundiId, userId, adminUserId)` after document upload
3. Monitor: auto-approved fundis may have higher fraud rates — review weekly

## Statistics to Track

| Metric | Target |
|---|---|
| Pending applications at end of day | < 10 |
| Median time to review | < 12 hours |
| Approval rate | 70–85% |
| Rejection rate (fake ID) | < 5% |
| Re-upload rate | < 15% |
| Post-approval fraud reports | < 2% |

If approval rate > 90% → reviewers may be too lenient.
If rejection rate > 20% → onboarding UX may be broken.
