import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { detectBypass, riskLevelFromScore, webhookCallbackHash } from './fraudService.js';

test('riskLevelFromScore maps scores onto risk bands', () => {
  assert.equal(riskLevelFromScore(0), 'low');
  assert.equal(riskLevelFromScore(25), 'low');
  assert.equal(riskLevelFromScore(26), 'medium');
  assert.equal(riskLevelFromScore(50), 'medium');
  assert.equal(riskLevelFromScore(51), 'high');
  assert.equal(riskLevelFromScore(75), 'high');
  assert.equal(riskLevelFromScore(76), 'critical');
  assert.equal(riskLevelFromScore(100), 'critical');
});

test('detectBypass returns a clean result for harmless content', () => {
  const result = detectBypass('Hello, I will arrive at the site around 3pm.');
  assert.deepEqual(result, { isBypass: false, severity: 'low', scoreDelta: 0, matches: [] });
});

test('detectBypass treats empty or missing content as clean', () => {
  assert.equal(detectBypass().isBypass, false);
  assert.equal(detectBypass('').isBypass, false);
  assert.equal(detectBypass(null).isBypass, false);
});

test('detectBypass flags a shared phone number', () => {
  const result = detectBypass('Reach me on 0712345678');
  assert.equal(result.isBypass, true);
  assert.ok(result.matches.some((m) => m.type === 'phone_number'));
});

test('detectBypass reports the highest weighted pattern as the top match', () => {
  const result = detectBypass('Let us settle this outside the app, call me later');
  assert.equal(result.isBypass, true);
  assert.equal(result.type, 'outside_app');
  assert.equal(result.severity, 'critical');
  assert.ok(result.matches.length >= 2);
});

test('detectBypass accumulates deltas across matches and caps them at 100', () => {
  const single = detectBypass('whatsapp me');
  assert.equal(single.scoreDelta, single.matches.reduce((sum, m) => sum + m.delta, 0));

  const many = detectBypass(
    'whatsapp or telegram me at 0712345678, email me@example.com, send money via mpesa paybill, '
    + 'pay cash outside the app, bank account details at https://example.com',
  );
  assert.equal(many.scoreDelta, 100);
});

test('detectBypass flags off-platform payment requests as critical', () => {
  for (const content of ['Just pay cash please', 'Send directly to my account', 'Use my paybill number']) {
    const result = detectBypass(content);
    assert.equal(result.isBypass, true, content);
    assert.equal(result.severity, 'critical', content);
  }
});

test('detectBypass is case insensitive', () => {
  assert.equal(detectBypass('WHATSAPP ME').isBypass, true);
});

test('webhookCallbackHash is deterministic and sensitive to every field', () => {
  const hash = webhookCallbackHash('ws_CO_1', 'RCPT1', '{"Body":1}');
  assert.equal(hash, webhookCallbackHash('ws_CO_1', 'RCPT1', '{"Body":1}'));
  assert.equal(
    hash,
    crypto.createHash('sha256').update('ws_CO_1:RCPT1:{"Body":1}').digest('hex'),
  );
  assert.notEqual(hash, webhookCallbackHash('ws_CO_2', 'RCPT1', '{"Body":1}'));
  assert.notEqual(hash, webhookCallbackHash('ws_CO_1', 'RCPT2', '{"Body":1}'));
  assert.notEqual(hash, webhookCallbackHash('ws_CO_1', 'RCPT1', '{"Body":2}'));
});

test('webhookCallbackHash treats missing receipt and body as empty strings', () => {
  assert.equal(webhookCallbackHash('ws_CO_1'), webhookCallbackHash('ws_CO_1', '', ''));
  assert.equal(webhookCallbackHash('ws_CO_1', null, null), webhookCallbackHash('ws_CO_1', '', ''));
});
