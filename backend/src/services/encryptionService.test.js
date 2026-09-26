import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

// The key is read lazily on first use, so it must be set before any export runs.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { decrypt, encrypt, isEncryptionEnabled, rotateKey } = await import('./encryptionService.js');

test('isEncryptionEnabled reports true when a key is configured', () => {
  assert.equal(isEncryptionEnabled(), true);
});

test('encrypt produces a prefixed value that decrypts back to the plaintext', () => {
  const encrypted = encrypt('0712345678');
  assert.ok(encrypted.startsWith('enc:'));
  assert.notEqual(encrypted, '0712345678');
  assert.equal(decrypt(encrypted), '0712345678');
});

test('encrypt uses a fresh iv so equal inputs differ in ciphertext', () => {
  const first = encrypt('user@example.com');
  const second = encrypt('user@example.com');
  assert.notEqual(first, second);
  assert.equal(decrypt(first), decrypt(second));
});

test('encrypt is idempotent for already encrypted values', () => {
  const encrypted = encrypt('12345678');
  assert.equal(encrypt(encrypted), encrypted);
});

test('encrypt passes through empty and non-string values', () => {
  assert.equal(encrypt(''), '');
  assert.equal(encrypt(null), null);
  assert.equal(encrypt(undefined), undefined);
  assert.equal(encrypt(42), 42);
});

test('decrypt passes through values without the enc prefix', () => {
  assert.equal(decrypt('0712345678'), '0712345678');
  assert.equal(decrypt(null), null);
  assert.equal(decrypt(7), 7);
});

test('decrypt returns the input when the ciphertext is tampered with', () => {
  const encrypted = encrypt('national-id-1234');
  const tampered = `${encrypted.slice(0, -6)}AAAAA=`;
  assert.equal(decrypt(tampered), tampered);
});

test('rotateKey re-encrypts a value from an old key to the current key', () => {
  const oldKey = 'b'.repeat(64);
  const oldKeyBuffer = Buffer.from(oldKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', oldKeyBuffer, iv);
  const body = Buffer.concat([cipher.update('legacy-secret', 'utf8'), cipher.final()]);
  const legacy = `enc:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64')}`;

  assert.notEqual(decrypt(legacy), 'legacy-secret');
  const rotated = rotateKey(legacy, oldKey);
  assert.equal(decrypt(rotated), 'legacy-secret');
});

test('rotateKey derives a key by hashing when the old key is not 64 hex chars', () => {
  const oldKey = 'short-passphrase';
  const derived = crypto.createHash('sha256').update(oldKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const body = Buffer.concat([cipher.update('derived-secret', 'utf8'), cipher.final()]);
  const legacy = `enc:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64')}`;

  assert.equal(decrypt(rotateKey(legacy, oldKey)), 'derived-secret');
});
