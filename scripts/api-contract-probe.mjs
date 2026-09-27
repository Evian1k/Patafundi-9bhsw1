#!/usr/bin/env node
/**
 * API contract probe — statically verifies that every endpoint the frontend
 * calls exists in the backend route table (spec §58: no unresolved 404s).
 *
 * Usage: node scripts/api-contract-probe.mjs
 * Exit code 1 when mismatches are found.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 1. Collect backend routes from src/routes.js ────────────────────────────
const routesSrc = readFileSync(join(ROOT, 'backend/src/routes.js'), 'utf8');
const backendRoutes = [];
for (const m of routesSrc.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
  backendRoutes.push({ method: m[1].toUpperCase(), path: m[2] });
}
if (backendRoutes.length < 50) {
  console.error(`Probe error: only parsed ${backendRoutes.length} backend routes — routes.js format changed?`);
  process.exit(2);
}

/** Express pattern → RegExp. ':param'/'*splat' match one segment. */
function routeToRegex(path) {
  const segs = path.split('/').map((s) => {
    if (s.startsWith(':') || s.includes('*')) return '[^/]+';
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^/${segs.filter(Boolean).join('/')}$`);
}
const compiled = backendRoutes.map((r) => ({ ...r, re: routeToRegex(r.path) }));

// ── 2. Collect frontend calls ────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const frontendFiles = walk(join(ROOT, 'frontend/src'));

const frontendCalls = new Map(); // key: normalized path → [files]
function addCall(file, rawPath) {
  // Distinguish mid-path templates (`/x/${id}/y`) from query-builder suffixes
  // (`/x${qs}`): a suffix template is NOT preceded by '/' — truncate there.
  let p = rawPath;
  const idx = p.indexOf('${');
  if (idx > 0 && p[idx - 1] !== '/') p = p.slice(0, idx);
  p = p.replace(/\$\{[^}]*\}/g, ':any');
  p = (p.match(/^[a-z0-9\-/:_.]+/i) || ['/'])[0].split('?')[0];
  const key = p.length > 1 ? p.replace(/\/+$/, '') : '/';
  frontendCalls.set(key, [...(frontendCalls.get(key) || []), file.replace(ROOT + '/', '')]);
}

for (const file of frontendFiles) {
  const src = readFileSync(file, 'utf8');
  // .request('/x'), .request("/x")
  for (const m of src.matchAll(/\.request\(\s*['"](\/[^'"]+)['"]/g)) addCall(file, m[1]);
  // .request(`/x/${id}`) — template literal, capture to closing backtick
  for (const m of src.matchAll(/\.request\(\s*`([^`]+)`/g)) addCall(file, m[1]);
  // fetch(buildApiUrl(`/x`)) — realtime poller
  for (const m of src.matchAll(/buildApiUrl\(\s*['"`]?(\/[^'"`)]+)/g)) addCall(file, m[1]);
}

// ── 3. Cross-check ───────────────────────────────────────────────────────────
/** Build a regex from the normalized frontend path: ':any' → '[^/]*'.
 *  A call matches when its pattern accepts a backend route path. */
function callToRegex(fPath) {
  const segs = fPath.split('/').filter(Boolean).map((s) => (s === ':any' ? '[^/]*' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^/${segs.join('/')}$`);
}

const missing = [];
for (const [path, files] of frontendCalls) {
  const re = callToRegex(path);
  const ok = compiled.some((r) => re.test(r.path));
  if (!ok) missing.push({ path, files: [...new Set(files)] });
}

console.log(`Backend routes parsed: ${backendRoutes.length}`);
console.log(`Unique frontend call paths: ${frontendCalls.size}`);

if (missing.length === 0) {
  console.log('CONTRACT OK — every frontend call path matches a backend route.');
  process.exit(0);
}

console.log(`\nMISSING BACKEND ROUTES (${missing.length}):`);
for (const m of missing) {
  console.log(`  ${m.path}`);
  for (const f of m.files) console.log(`     ← ${f}`);
}
process.exit(1);
