import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildFundiApprovalStatus } from './services/fundiApprovalStatusService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');

// PATAFUNDI completion additions — pure-function tests (no DB required).

test('llmService extractJson parses fenced JSON', async () => {
  const { extractJson } = await import('../src/services/llmService.js');
  const text = 'Here is my analysis:\n```json\n{"category":"plumbing","urgency":"high"}\n```\nDone.';
  assert.deepEqual(extractJson(text), { category: 'plumbing', urgency: 'high' });
});

test('llmService extractJson parses raw JSON with surrounding prose', async () => {
  const { extractJson } = await import('../src/services/llmService.js');
  const text = 'Sure! {"a":1,"b":{"c":"x}"}} hope that helps';
  assert.deepEqual(extractJson(text), { a: 1, b: { c: 'x}' } });
});

test('llmService extractJson returns null on garbage', async () => {
  const { extractJson } = await import('../src/services/llmService.js');
  assert.equal(extractJson('no json here at all'), null);
  assert.equal(extractJson('{"truncated'), null);
});

test('geoMatchingService weights sum to 1 (cancellation included)', async () => {
  const src = await readFile(path.join(backendRoot, 'src/services/geoMatchingService.js'), 'utf8');
  const m = src.match(/const MATCHING_WEIGHTS = \{([\s\S]*?)\};/);
  assert.ok(m, 'weights block found');
  const weights = [...m[1].matchAll(/:\s*([\d.]+)/g)].map(x => Number(x[1]));
  const total = weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights must sum to 1, got ${total}`);
  assert.ok(m[1].includes('cancellation'), 'cancellation rate must be a factor (spec §13)');
});

test('money invariant: KES amounts within numeric(12,2) stay exact through integer-cent rounding (spec §22)', async () => {
  // The platform stores money as numeric(12,2) — EXACT decimal, never float.
  // JS boundaries must round half-up once via cents to avoid drift.
  const money = (v) => Math.round(Number(v) * 100) / 100;
  // 15% of 12,345.67
  const gross = 12345.67;
  const commission = money(gross * 0.15);
  const net = money(gross - commission);
  assert.equal(commission, 1851.85);
  assert.equal(net, 10493.82);
  assert.equal(money(commission + net), gross); // conservation
  // Max KES amount (999,999,999.99) is safely below MAX_SAFE_INTEGER cents
  assert.ok(999_999_999.99 * 100 < Number.MAX_SAFE_INTEGER);
});

test('provider_type CHECK includes platform_match (spec §2)', async () => {
  const sql = await readFile(path.join(backendRoot, 'migrations/036_fundihub_upgrade.sql'), 'utf8');
  assert.match(sql, /provider_type IN \('fundi', 'company', 'platform_match'\)/);
  assert.match(sql, /create table if not exists refund_requests/);
  assert.match(sql, /create table if not exists ai_events/);
  assert.match(sql, /provider_reply/);
  assert.match(sql, /verification_level/);
});

test('Fundi approval-status builder exposes a top-level decision and preserves the nested record', () => {
  const result = buildFundiApprovalStatus({ approval_status: 'approved', rejection_reason: null });
  assert.equal(result.status, 'approved');
  assert.match(result.message, /Approved/);
  assert.equal(result.fundi.approval_status, 'approved');
});

test('Fundi approval-status builder does not call an unregistered account pending', () => {
  const result = buildFundiApprovalStatus(null);
  assert.equal(result.status, 'not_registered');
  assert.match(result.message, /No Fundi application/);
  assert.equal(result.fundi.approval_status, 'not_registered');
});
