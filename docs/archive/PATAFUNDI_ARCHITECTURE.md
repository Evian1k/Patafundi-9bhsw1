# PataFundi Architecture

## System map

Customer App
↓
Public Web / Auth Pages / Job Requests
↓
Frontend App (React + Vite + TypeScript)
↓
API Client / Service layer
↓
Express backend
↓
Database (Postgres preferred; PGlite fallback in dev)
↓
External services: storage, payments, email, maps, notifications

## Product surfaces

### 1. Public marketing website
- Route-driven pages for customer, fundi, and company conversion
- Public marketing content only
- Must not expose internal dashboards or platform-level revenue

### 2. Customer-facing experience
- Auth flows
- Service requests
- Quote/estimate submission
- Job tracking
- Realtime updates
- Payment and review flows

### 3. Fundi experience
- Registration and approval
- Ongoing job acceptance and status tracking
- Earnings and payout requests
- Profile and onboarding state

### 4. Company portal
- Company management
- Branch/service management
- Job assignment
- Settlement visibility
- Multi-tenant isolation required

### 5. Staff and super-admin portal
- Role-scoped internal dashboards
- Permission-based access
- Risk and operational tooling

## Stack

### Frontend
- Vite
- React
- TypeScript
- Tailwind / shadcn pattern
- Framer Motion
- Router and shared UI primitives

### Backend
- Express
- Node.js
- Socket.IO for realtime
- JWT and cookie-based auth patterns
- Validation and middleware layer
- Database access and migration scripts

### Data layer
- Postgres supported
- PGlite fallback for local development
- SQL migrations for schema evolution

### Mobile
- Expo apps for customer and fundi surfaces
- Separate from the main web product surface

## Main repo areas

- `src/` — top-level web app shell
- `frontend/` — dedicated frontend project
- `backend/src/` — business API
- `backend/migrations/` — database migration history
- `apps/customer-mobile/` — customer app
- `apps/fundi-mobile/` — fundi app
- `packages/shared/` — reusable logic

## Architectural assumptions

- The public marketing website should not expose privileged internal routes.
- The backend is the system of record for money, roles, and job status.
- Frontend and mobile clients are consumers of backend state, not a source of truth.
- Role and tenancy boundaries must be enforced by the backend.

## Architectural risk summary

The codebase has the right conceptual architecture but still carries some implementation inconsistency between web app and mobile app run modes. The website is being restored to its role as the primary product shell, while the mobile apps remain separate product surfaces. The key remaining risk is that several real business flows still depend on external services and credentials.
