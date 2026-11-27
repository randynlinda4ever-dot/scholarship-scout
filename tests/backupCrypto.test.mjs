import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  decryptBackup,
  encryptBackup,
  isEncryptedBackupEnvelope,
  MAX_ENCRYPTED_BACKUP_FILE_BYTES,
} from '../src/lib/backupCrypto.js';

globalThis.crypto ??= webcrypto;

const payload = {
  profile: { school: 'Private School', academicNotes: 'Sensitive student notes' },
  scholarships: [{ id: 'one', title: 'Test scholarship' }],
  applicationProgress: { one: [true, false] },
};

test('encrypted backups round-trip with AES-GCM authenticated encryption', async () => {
  const envelope = await encryptBackup(payload, 'a long memorable backup password');
  assert.equal(isEncryptedBackupEnvelope(envelope), true);
  assert.equal(envelope.cipher, 'AES-256-GCM');
  assert.equal(envelope.kdf, 'PBKDF2-SHA-256');
  assert.deepEqual(await decryptBackup(envelope, 'a long memorable backup password'), payload);
  assert.equal(JSON.stringify(envelope).includes('Sensitive student notes'), false);
});

test('each backup uses a fresh salt and 96-bit initialization vector', async () => {
  const first = await encryptBackup(payload, 'a long memorable backup password');
  const second = await encryptBackup(payload, 'a long memorable backup password');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
});

test('wrong passwords and ciphertext tampering are rejected', async () => {
  const envelope = await encryptBackup(payload, 'a long memorable backup password');
  await assert.rejects(
    decryptBackup(envelope, 'a different incorrect password'),
  );
  const modified = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA' };
  await assert.rejects(decryptBackup(modified, 'a long memorable backup password'));
});

test('unsupported formats and weak passwords are rejected', async () => {
  await assert.rejects(encryptBackup(payload, 'too short'));
  await assert.rejects(decryptBackup({ format: 'other', version: 1 }, 'a long memorable backup password'));
});

test('encrypted backup file limit includes base64 overhead beyond the plaintext cap', () => {
  assert.equal(MAX_ENCRYPTED_BACKUP_FILE_BYTES, 3 * 1024 * 1024);
  assert.ok(MAX_ENCRYPTED_BACKUP_FILE_BYTES > 2 * 1024 * 1024);
});

async function createVersionOneEnvelope(value, passphrase) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await webcrypto.subtle.encrypt({
    name: "AES-GCM", iv,
    additionalData: new TextEncoder().encode("scholarship-scout-encrypted-backup:v1"),
    tagLength: 128,
  }, key, plaintext);
  const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");
  return {
    format: "scholarship-scout-encrypted-backup",
    version: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: 600_000,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

test("new encrypted backups use v2 and authenticate KDF metadata", async () => {
  const envelope = await encryptBackup(payload, "a long memorable backup password");
  assert.equal(envelope.version, 2);
  assert.deepEqual(await decryptBackup(envelope, "a long memorable backup password"), payload);
  await assert.rejects(decryptBackup({ ...envelope, iterations: envelope.iterations + 1 }, "a long memorable backup password"));
  await assert.rejects(decryptBackup({ ...envelope, iterations: 5_000_001 }, "a long memorable backup password"));
});

test("existing version-one encrypted backups remain decryptable", async () => {
  const envelope = await createVersionOneEnvelope(payload, "a long memorable backup password");
  assert.equal(isEncryptedBackupEnvelope(envelope), true);
  assert.deepEqual(await decryptBackup(envelope, "a long memorable backup password"), payload);
});
