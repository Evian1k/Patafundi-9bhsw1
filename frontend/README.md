# PataFundi Frontend

This folder contains the **frontend only** for PataFundi — a React + Vite + TypeScript SPA.

## Deploy to Vercel

### Step 1: Push this folder to GitHub

This `frontend/` folder must be at the root of your GitHub repo, like this:

```
Patafundi-9bhsw1/
├── frontend/          ← This folder
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   ├── public/
│   └── ...
├── backend/           ← Backend (deploy separately to Render)
└── README.md
```

### Step 2: Create a new Vercel project

1. Go to https://vercel.com/new
2. Import `Evian1k/Patafundi-9bhsw1`
3. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend` ← IMPORTANT!
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Add Environment Variables:
   ```
   VITE_API_URL = https://patafundi-9bhsw1.onrender.com
   VITE_SOCKET_URL = https://patafundi-9bhsw1.onrender.com
   ```
5. Click **Deploy**

### Step 3: Verify

- Wait ~30 seconds for the build to complete
- Open the Vercel URL (something like `patafundi-xxx.vercel.app`)
- Go to `/staff/login` → should show the dark-themed staff portal
- Go to `/` → should show the landing page

## Local Development

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at http://localhost:8080 and proxies `/api` and `/socket.io` to http://127.0.0.1:4000 (your local backend).

## Build

```bash
npm run build
```

Produces `dist/` with static files ready to deploy to any static host (Vercel, Netlify, Cloudflare Pages, etc.).

## Notes

- The `prebuild` script (`scripts/process-brand-logo.mjs`) regenerates favicon/logo PNGs from `public/logo-source.png` using `sharp`. This runs automatically before `npm run build`.
- Backend dependencies (express, pg, socket.io, etc.) have been removed from `package.json` since this is frontend-only.
- Real-time features (chat, live tracking) connect to the backend via `VITE_SOCKET_URL` using `socket.io-client`.
