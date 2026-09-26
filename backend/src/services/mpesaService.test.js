import assert from 'node:assert/strict';
import test from 'node:test';
import { assertValidMpesaPhone, normalizePhone } from './mpesaService.js';

test('normalizePhone keeps numbers already in 254 format', () => {
  assert.equal(normalizePhone('254712345678'), '254712345678');
  assert.equal(normalizePhone('+254 712 345 678'), '254712345678');
});

test('normalizePhone converts leading zero and bare local numbers', () => {
  assert.equal(normalizePhone('0712345678'), '254712345678');
  assert.equal(normalizePhone('0110345678'), '254110345678');
  assert.equal(normalizePhone('712345678'), '254712345678');
  assert.equal(normalizePhone('110345678'), '254110345678');
});

test('normalizePhone strips non-digit characters', () => {
  assert.equal(normalizePhone('(0712) 345-678'), '254712345678');
});

test('normalizePhone returns digits unchanged for unknown prefixes', () => {
  assert.equal(normalizePhone('4412345678'), '4412345678');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(null), '');
});

test('assertValidMpesaPhone returns the normalized Safaricom number', () => {
  assert.equal(assertValidMpesaPhone('0712345678'), '254712345678');
  assert.equal(assertValidMpesaPhone('+254110345678'), '254110345678');
});

test('assertValidMpesaPhone rejects invalid numbers with a 400 error', () => {
  for (const value of ['', null, '07123', '254812345678', '07123456789', '4412345678']) {
    assert.throws(() => assertValidMpesaPhone(value), (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /Kenyan M-Pesa number/);
      return true;
    });
  }
});
