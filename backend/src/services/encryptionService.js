/**
 * PII Encryption Service — AES-256-GCM for sensitive fields.
 *
 * Encrypts: National ID, phone numbers, email addresses at rest.
 * Uses ENCRYPTION_KEY from environment (32-byte hex string).
 * If no key is set, encryption is disabled (transparent passthrough).
 *
 * Usage:
 *   import { encrypt, decrypt, isEncryptionEnabled } from '../services/encryptionService.js';
 *   const encrypted = encrypt('0712345678');  // → 'enc:abc123...'
 *   const plain = decrypt(encrypted);           // → '0712345678'
 */
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const PREFIX = 'enc:';

let encryptionKey = null;

function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  const envKey = process.env.ENCRYPTION_KEY || process.env.PII_ENCRYPTION_KEY;
  if (!envKey) return null;
  // Key must be 32 bytes (64 hex chars). If shorter, hash to derive.
  encryptionKey = envKey.length === 64
    ? Buffer.from(envKey, 'hex')
    : crypto.createHash('sha256').update(envKey).digest();
  return encryptionKey;
}

export function isEncryptionEnabled() {
  return Boolean(getEncryptionKey());
}

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns 'enc:<base64(iv + ciphertext + authTag)>' or the original value if encryption is disabled.
 */
export function encrypt(plainText) {
  if (!plainText || typeof plainText !== 'string') return plainText;
  if (plainText.startsWith(PREFIX)) return plainText; // already encrypted
  const key = getEncryptionKey();
  if (!key) return plainText; // encryption disabled — passthrough

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return PREFIX + combined.toString('base64');
}

/**
 * Decrypt a value encrypted by encrypt().
 * Returns the original plaintext, or the input if it's not encrypted / encryption is disabled.
 */
export function decrypt(encryptedValue) {
  if (!encryptedValue || typeof encryptedValue !== 'string') return encryptedValue;
  if (!encryptedValue.startsWith(PREFIX)) return encryptedValue; // not encrypted
  const key = getEncryptionKey();
  if (!key) return encryptedValue; // can't decrypt without key

  try {
    const combined = Buffer.from(encryptedValue.slice(PREFIX.length), 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return encryptedValue; // decryption failed — return as-is
  }
}

/**
 * Rotate the encryption key.
 * Re-encrypts a value that was encrypted with an old key.
 * Usage: const reEncrypted = rotateKey(oldEncrypted, oldKey);
 */
export function rotateKey(encryptedValue, oldKey) {
  // Decrypt with old key
  const oldKeyBuffer = oldKey.length === 64
    ? Buffer.from(oldKey, 'hex')
    : crypto.createHash('sha256').update(oldKey).digest();
  const iv = Buffer.from(encryptedValue.slice(PREFIX.length), 'base64').subarray(0, IV_LENGTH);
  const combined = Buffer.from(encryptedValue.slice(PREFIX.length), 'base64');
  const authTag = combined.subarray(combined.length - TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, oldKeyBuffer, iv);
  decipher.setAuthTag(authTag);
  const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  // Re-encrypt with current key
  return encrypt(plainText);
}
