import assert from 'node:assert/strict';
import test from 'node:test';
import { asyncHandler, badRequest, forbidden, notFound, parseUuid } from './http.js';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

test('asyncHandler resolves without calling next', async () => {
  let nextCalled = false;
  const handler = asyncHandler(async (req, res) => {
    res.sent = req.value;
  });
  const res = {};
  await handler({ value: 42 }, res, () => { nextCalled = true; });
  assert.equal(res.sent, 42);
  assert.equal(nextCalled, false);
});

test('asyncHandler forwards rejected promises to next', async () => {
  const boom = new Error('boom');
  let received = null;
  const handler = asyncHandler(async () => { throw boom; });
  await handler({}, {}, (err) => { received = err; });
  assert.equal(received, boom);
});

test('asyncHandler lets synchronous throws propagate to the caller', () => {
  // Only rejected promises are routed to next(); Express itself catches sync throws.
  let received = null;
  const handler = asyncHandler(() => { throw new Error('sync boom'); });
  assert.throws(() => handler({}, {}, (err) => { received = err; }), /sync boom/);
  assert.equal(received, null);
});

test('asyncHandler supports non-promise return values', async () => {
  let nextCalled = false;
  const handler = asyncHandler(() => 'done');
  await handler({}, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
});

test('badRequest builds a 400 error with the given message', () => {
  const error = badRequest('Missing field');
  assert.ok(error instanceof Error);
  assert.equal(error.status, 400);
  assert.equal(error.message, 'Missing field');
});

test('forbidden builds a 403 error with a default message', () => {
  assert.equal(forbidden().status, 403);
  assert.equal(forbidden().message, 'Forbidden');
  assert.equal(forbidden('Staff only').message, 'Staff only');
});

test('notFound builds a 404 error with a default message', () => {
  assert.equal(notFound().status, 404);
  assert.equal(notFound().message, 'Not found');
  assert.equal(notFound('No job').message, 'No job');
});

test('parseUuid accepts a valid uuid and trims whitespace', () => {
  assert.equal(parseUuid(`  ${UUID}  `), UUID);
});

test('parseUuid is case insensitive', () => {
  const upper = UUID.toUpperCase();
  assert.equal(parseUuid(upper), upper);
});

test('parseUuid rejects malformed values with a 400 error', () => {
  for (const value of ['', null, undefined, 'not-a-uuid', `${UUID}extra`, '3f2504e0-4f89-01d3-9a0c-0305e82c3301']) {
    assert.throws(() => parseUuid(value, 'job id'), (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, 'Invalid job id');
      return true;
    });
  }
});

test('parseUuid uses the default label when none is given', () => {
  assert.throws(() => parseUuid('nope'), /Invalid id/);
});
