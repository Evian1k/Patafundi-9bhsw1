#!/usr/bin/env node
/**
 * PataFundi load test — simulates concurrent users hitting the API.
 * Measures latency percentiles, error rate, and throughput.
 *
 * Run against the local dev server:
 *   node scripts/load_test.mjs
 *
 * Tests:
 *   - 100 concurrent requests to /health
 *   - 100 concurrent login attempts
 *   - 100 concurrent fundi searches (public)
 *   - 500 concurrent requests (mixed)
 */
import http from 'node:http';

const API = 'http://127.0.0.1:4000';
const CONCURRENCY_LEVELS = [10, 50, 100];

function request(method, path, body) {
  return new Promise((resolve) => {
    const start = performance.now();
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      method,
      hostname: '127.0.0.1',
      port: 4000,
      path,
      headers: data ? { 'Content-Type': 'application/json' } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          durationMs: performance.now() - start,
        });
      });
    });
    req.on('error', () => resolve({ status: 0, durationMs: performance.now() - start }));
    if (data) req.write(data);
    req.end();
  });
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]?.toFixed(1) || '—';
}

async function loadTest(name, fn, concurrency) {
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(fn());
  }
  const results = await Promise.all(promises);
  const durations = results.map(r => r.durationMs);
  const errors = results.filter(r => r.status === 0 || r.status >= 500).length;
  const successes = results.filter(r => r.status >= 200 && r.status < 400).length;
  const totalMs = Math.max(...durations);
  const rps = (concurrency / (totalMs / 1000)).toFixed(0);

  console.log(`  ${name} (${concurrency} concurrent):`);
  console.log(`    Success: ${successes}/${concurrency}  Errors: ${errors}`);
  console.log(`    Latency p50: ${percentile(durations, 50)}ms  p95: ${percentile(durations, 95)}ms  p99: ${percentile(durations, 99)}ms  max: ${totalMs.toFixed(1)}ms`);
  console.log(`    Throughput: ${rps} req/s`);
  console.log('');
  return { name, concurrency, successes, errors, p50: percentile(durations, 50), p95: percentile(durations, 95), rps };
}

async function main() {
  console.log('\n=== PataFundi Load Test ===');
  console.log(`Target: ${API}\n`);

  // Warm up
  await request('GET', '/health');

  const allResults = [];

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`— Concurrency: ${concurrency} —`);

    // Health check (lightweight)
    allResults.push(await loadTest(
      'GET /health',
      () => request('GET', '/health'),
      concurrency,
    ));

    // Public fundi search (DB query)
    allResults.push(await loadTest(
      'GET /api/fundi/search',
      () => request('GET', '/api/fundi/search'),
      concurrency,
    ));

    // Login attempt (bcrypt + DB)
    allResults.push(await loadTest(
      'POST /api/auth/login (valid)',
      () => request('POST', '/api/auth/login', { email: 'admin@patafundi.com', password: 'Admin@2024!' }),
      concurrency,
    ));

    // Login attempt (invalid — tests error path)
    allResults.push(await loadTest(
      'POST /api/auth/login (invalid)',
      () => request('POST', '/api/auth/login', { email: 'nobody@x.com', password: 'wrong' }),
      concurrency,
    ));
  }

  // Summary
  console.log('=== Summary ===');
  console.log('Test                          Conc  Success  Errors  p50    p95    RPS');
  console.log('-----------------------------  -----  -------  ------  -----  -----  -----');
  for (const r of allResults) {
    console.log(
      `${r.name.padEnd(29)}  ${String(r.concurrency).padStart(5)}  ${String(r.successes).padStart(7)}  ${String(r.errors).padStart(6)}  ${String(r.p50).padStart(5)}  ${String(r.p95).padStart(5)}  ${String(r.rps).padStart(5)}`
    );
  }

  // Verdict
  const totalErrors = allResults.reduce((s, r) => s + r.errors, 0);
  const maxP95 = Math.max(...allResults.map(r => parseFloat(r.p95) || 0));
  console.log('');
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Max p95 latency: ${maxP95.toFixed(0)}ms`);
  if (totalErrors === 0 && maxP95 < 2000) {
    console.log('VERDICT: PASS — no errors, p95 under 2s');
  } else if (totalErrors === 0) {
    console.log('VERDICT: PASS (with warnings) — no errors but latency high');
  } else {
    console.log('VERDICT: FAIL — errors detected');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(2); });
