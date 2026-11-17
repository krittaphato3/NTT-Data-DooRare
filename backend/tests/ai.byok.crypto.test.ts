/**
 * BYOK Credential Encryption-at-Rest Unit Tests (AES-256-GCM)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encrypt,
  decrypt,
  isEncrypted,
  getEncryptionKey,
  encryptCredentials,
  decryptCredentials,
} from '../src/modules/ai/byok/byok.crypto.js';
import type { AICredentials } from '../src/modules/ai/byok/byok.types.js';

test('byok.crypto: derives deterministic 32-byte key', () => {
  const key = getEncryptionKey();
  assert.ok(Buffer.isBuffer(key));
  assert.equal(key.length, 32, 'Key must be exactly 32 bytes for AES-256-GCM');
});

test('byok.crypto: encrypts and decrypts secret string cleanly (AES-256-GCM)', () => {
  const plainSecret = 'sk-proj-testSecretKey1234567890abcdef-DooRare';
  const ciphertext = encrypt(plainSecret);

  assert.notEqual(ciphertext, plainSecret);
  assert.ok(isEncrypted(ciphertext), 'Ciphertext must start with enc:v1: prefix');
  assert.ok(!ciphertext.includes('testSecretKey'), 'Ciphertext must never leak plain secret');

  const decrypted = decrypt(ciphertext);
  assert.equal(decrypted, plainSecret, 'Decrypted value must match original plain secret');
});

test('byok.crypto: generates distinct nonces (IVs) for repeated encryptions', () => {
  const secret = 'sk-ant-api03-repeating-nonce-check';
  const enc1 = encrypt(secret);
  const enc2 = encrypt(secret);

  assert.notEqual(enc1, enc2, 'Two encryptions of same secret must use fresh random IVs');
  assert.equal(decrypt(enc1), secret);
  assert.equal(decrypt(enc2), secret);
});

test('byok.crypto: is idempotent and does not double-encrypt', () => {
  const secret = 'sk-proj-test-idempotent';
  const encOnce = encrypt(secret);
  const encTwice = encrypt(encOnce);

  assert.equal(encOnce, encTwice, 'encrypt() must be idempotent on already encrypted strings');
  assert.equal(decrypt(encTwice), secret);
});

test('byok.crypto: supports backward compatibility for legacy unencrypted strings', () => {
  const legacySecret = 'sk-legacy-unencrypted-plain-string-12345';
  const result = decrypt(legacySecret);
  assert.equal(result, legacySecret, 'Must return unencrypted plain strings as-is without crashing');
});

test('byok.crypto: handles empty, undefined, and non-string inputs safely', () => {
  assert.equal(encrypt(''), '');
  assert.equal(decrypt(''), '');
  assert.equal(encrypt(undefined), undefined);
  assert.equal(decrypt(undefined), undefined);
});

test('byok.crypto: rejects tampered ciphertext or altered auth tags', () => {
  const secret = 'super-secret-aws-key-999';
  const enc = encrypt(secret);
  const parts = enc.split(':');

  // Alter the ciphertext part
  const tamperedCipher = parts[4].slice(0, -2) + (parts[4].endsWith('0') ? '1' : '0');
  const tamperedEnvelope = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedCipher}`;

  const decrypted = decrypt(tamperedEnvelope);
  assert.equal(decrypted, '', 'Tampered ciphertext must fail auth tag check and return empty string');
});

test('byok.crypto: encryptCredentials and decryptCredentials handles full credentials object', () => {
  const rawCredentials: AICredentials = {
    apiKey: 'sk-proj-openAiSecretKey12345',
    awsRegion: 'ap-southeast-1',
    awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    azureEndpoint: 'https://doorare-ai.openai.azure.com',
    customHeaders: {
      Authorization: 'Bearer test-bearer-token-123',
      'X-Custom-Env': 'production',
    },
  };

  const encrypted = encryptCredentials(rawCredentials);

  // Sensitive keys must be encrypted
  assert.ok(isEncrypted(encrypted.apiKey));
  assert.ok(isEncrypted(encrypted.awsSecretAccessKey));
  assert.ok(isEncrypted(encrypted.customHeaders?.Authorization));
  // Region & endpoint remain readable
  assert.equal(encrypted.awsRegion, 'ap-southeast-1');
  assert.equal(encrypted.azureEndpoint, 'https://doorare-ai.openai.azure.com');

  // No secrets leaked in encrypted structure
  const serialized = JSON.stringify(encrypted);
  assert.ok(!serialized.includes('openAiSecretKey12345'));
  assert.ok(!serialized.includes('wJalrXUtnFEMI'));
  assert.ok(!serialized.includes('test-bearer-token-123'));

  // Decrypts cleanly
  const decrypted = decryptCredentials(encrypted);
  assert.deepEqual(decrypted, rawCredentials);
});

test('byok.crypto: decryptCredentials gracefully preserves unencrypted legacy credentials', () => {
  const legacyInDb: AICredentials = {
    apiKey: 'sk-plain-legacy-key',
    awsSecretAccessKey: 'plain-aws-secret',
    awsRegion: 'us-east-1',
  };

  const decrypted = decryptCredentials(legacyInDb);
  assert.equal(decrypted.apiKey, 'sk-plain-legacy-key');
  assert.equal(decrypted.awsSecretAccessKey, 'plain-aws-secret');
  assert.equal(decrypted.awsRegion, 'us-east-1');
});
