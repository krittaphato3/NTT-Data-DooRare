import crypto from 'node:crypto';
import type { AICredentials } from './byok.types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit IV standard for AES-GCM (NIST SP 800-38D)
const TAG_LENGTH_BYTES = 16; // 128-bit auth tag
const ENCRYPTION_PREFIX = 'enc:v1:';
const PERSISTENT_FALLBACK_KEY = 'doorare-byok-default-fallback-encryption-key-32b-seed';

/**
 * Derives a 32-byte (256-bit) encryption key for AES-256-GCM.
 * Priority:
 * 1. process.env.BYOK_ENCRYPTION_KEY
 * 2. process.env.JWT_SECRET
 * 3. Persistent fallback key
 */
export function getEncryptionKey(): Buffer {
  const envKey = process.env.BYOK_ENCRYPTION_KEY?.trim();
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  const secret = envKey || process.env.JWT_SECRET?.trim() || PERSISTENT_FALLBACK_KEY;
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Checks whether a value is an encrypted envelope string.
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * Output format: `enc:v1:<ivHex>:<tagHex>:<cipherHex>`.
 * Idempotent: if the string is already encrypted, returns it unchanged.
 */
export function encrypt(text?: string): string {
  if (!text || typeof text !== 'string') {
    return text as any;
  }
  if (isEncrypted(text)) {
    return text;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts an encrypted envelope string using AES-256-GCM.
 * Backward compatible: if the string is not encrypted, returns it unchanged.
 * If decryption fails or data is tampered, logs an error and returns an empty string.
 */
export function decrypt(text?: string): string {
  if (!text || typeof text !== 'string') {
    return text as any;
  }
  if (!isEncrypted(text)) {
    // Backward compatibility: unencrypted plain string returned as-is
    return text;
  }

  const parts = text.split(':');
  // Format: ['enc', 'v1', ivHex, tagHex, cipherHex]
  if (parts.length !== 5) {
    return text;
  }

  const [, , ivHex, tagHex, cipherHex] = parts;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');

    if ((iv.length !== 12 && iv.length !== 16) || tag.length !== TAG_LENGTH_BYTES) {
      return text;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[BYOK Crypto] Decryption failed (tampered ciphertext or invalid key):', err);
    return '';
  }
}

/**
 * Encrypts all sensitive fields inside an AICredentials object for storage in DB.
 */
export function encryptCredentials(credentials: AICredentials = {}): AICredentials {
  if (!credentials || typeof credentials !== 'object') {
    return credentials;
  }

  const encrypted: AICredentials = { ...credentials };

  if (encrypted.apiKey) {
    encrypted.apiKey = encrypt(encrypted.apiKey);
  }
  if (encrypted.awsSecretAccessKey) {
    encrypted.awsSecretAccessKey = encrypt(encrypted.awsSecretAccessKey);
  }
  if (encrypted.customHeaders && typeof encrypted.customHeaders === 'object') {
    const encHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(encrypted.customHeaders)) {
      if (typeof val === 'string' && val.length > 0) {
        encHeaders[key] = encrypt(val);
      } else {
        encHeaders[key] = val;
      }
    }
    encrypted.customHeaders = encHeaders;
  }

  return encrypted;
}

/**
 * Decrypts all encrypted fields inside an AICredentials object loaded from DB.
 * Transparently supports unencrypted plain strings for backward compatibility.
 */
export function decryptCredentials(credentials: any): AICredentials {
  if (!credentials) {
    return {};
  }

  // Handle serialized string envelope if present
  if (typeof credentials === 'string') {
    if (isEncrypted(credentials)) {
      try {
        const decryptedJson = decrypt(credentials);
        return JSON.parse(decryptedJson);
      } catch {
        return {};
      }
    }
    return {};
  }

  if (typeof credentials !== 'object') {
    return {};
  }

  const decrypted: AICredentials = { ...credentials };

  if (decrypted.apiKey) {
    decrypted.apiKey = decrypt(decrypted.apiKey);
  }
  if (decrypted.awsSecretAccessKey) {
    decrypted.awsSecretAccessKey = decrypt(decrypted.awsSecretAccessKey);
  }
  if (decrypted.customHeaders && typeof decrypted.customHeaders === 'object') {
    const decHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(decrypted.customHeaders)) {
      if (typeof val === 'string') {
        decHeaders[key] = decrypt(val);
      } else {
        decHeaders[key] = val;
      }
    }
    decrypted.customHeaders = decHeaders;
  }

  return decrypted;
}
