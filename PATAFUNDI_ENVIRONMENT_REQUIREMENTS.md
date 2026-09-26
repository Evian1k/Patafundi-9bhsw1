# PataFundi Environment Requirements

## Required runtime variables

### Database
- `DATABASE_URL` — REQUIRED for production-grade DB operation
- Status: MISSING in current root `.env`
- Use: Postgres connection string for real DB or local Postgres container
- Safe fallback: embedded PGlite in development only

### Authentication
- `JWT_SECRET` — present in current `.env`
- `REFRESH_TOKEN_SECRET` — present in current `.env`
- `COOKIE_SECURE` — present as false in local dev

### Frontend origin / CORS
- `FRONTEND_ORIGIN`
- `CORS_ORIGINS`
- Status: present in current `.env`

## External service requirements

### M-Pesa / payments
- Status: CREDENTIAL REQUIRED
- Needed for live payment verification and transaction callbacks
- Production: required
- Development: optional only when sandbox creds are provided

### Maps / GPS
- Status: CREDENTIAL REQUIRED for live navigation and map services
- Needed for provider location tracking and ETA flows

### Email / OTP / notices
- Status: CREDENTIAL REQUIRED for real email or OTP delivery
- Needed for account verification and alerts

### Storage / file uploads
- Status: CREDENTIAL REQUIRED for production object storage
- Local fallback can work if storage is deliberately configured

### Push notifications
- Status: CREDENTIAL REQUIRED
- Not validated live in this session

### AI / analytics / monitoring
- Status: OPTIONAL or CREDENTIAL REQUIRED depending on product features enabled

## Infrastructure requirements

- A real Postgres instance is the recommended production requirement.
- Docker is available for optional local stack initialization.
- The project is not production-ready unless a real database and external credentials are set.

## Current environment status

### AVAILABLE
- Node.js project dependencies installed
- Vite frontend builds
- backend migrations bootstrap in PGlite fallback

### MISSING
- real `DATABASE_URL`
- payment credentials
- map credentials
- email credentials
- push credentials
- storage credentials

### PRODUCTION REQUIRED
- database
- payment service
- storage service
- secret management
- monitoring and logs

## Security note

This report intentionally does not print secrets, API keys, tokens, or private keys. The repo may contain generated local secrets but they are not reproduced here.
