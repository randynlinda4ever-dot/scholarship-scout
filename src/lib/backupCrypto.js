export const BACKUP_ENVELOPE_FORMAT = "scholarship-scout-encrypted-backup";
export const BACKUP_ENVELOPE_VERSION = 2;
// A 2 MiB plaintext backup expands to roughly 2.67 MiB when base64-encoded.
export const MAX_ENCRYPTED_BACKUP_FILE_BYTES = 3 * 1024 * 1024;
const LEGACY_BACKUP_ENVELOPE_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const MIN_PBKDF2_ITERATIONS = 600_000;
const MAX_PBKDF2_ITERATIONS = 5_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoProvider() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("Secure browser encryption is unavailable. Open Scholarship Scout in a modern browser over HTTPS.");
  }
  return globalThis.crypto;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== "string" || value.length > 4_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("The encrypted backup file is malformed.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validatePassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error("Use a backup password between 12 and 1024 characters.");
  }
}

async function deriveBackupKey(passphrase, salt, usages, iterations = PBKDF2_ITERATIONS) {
  const crypto = cryptoProvider();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function additionalData(envelope) {
  if (envelope.version === LEGACY_BACKUP_ENVELOPE_VERSION) {
    return encoder.encode(`${BACKUP_ENVELOPE_FORMAT}:v${LEGACY_BACKUP_ENVELOPE_VERSION}`);
  }
  return encoder.encode([
    BACKUP_ENVELOPE_FORMAT,
    `v${envelope.version}`,
    envelope.kdf,
    String(envelope.iterations),
    envelope.cipher,
  ].join(":"));
}

export function isEncryptedBackupEnvelope(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.format === BACKUP_ENVELOPE_FORMAT &&
    (value.version === BACKUP_ENVELOPE_VERSION || value.version === LEGACY_BACKUP_ENVELOPE_VERSION),
  );
}

/**
 * Encrypt a local backup using PBKDF2-SHA-256 and AES-256-GCM.
 * Every export gets a fresh random salt and 96-bit IV; the format/version
 * are authenticated as additional data so envelope metadata cannot be swapped.
 */
export async function encryptBackup(payload, passphrase) {
  validatePassphrase(passphrase);
  const crypto = cryptoProvider();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveBackupKey(passphrase, salt, ["encrypt"]);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData({ version: BACKUP_ENVELOPE_VERSION, kdf: "PBKDF2-SHA-256", iterations: PBKDF2_ITERATIONS, cipher: "AES-256-GCM" }),
      tagLength: 128,
    },
    key,
    plaintext,
  );

  return {
    format: BACKUP_ENVELOPE_FORMAT,    version: BACKUP_ENVELOPE_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt and authenticate an encrypted local backup. Wrong passwords,
 * corrupted data, or altered envelope fields are rejected before import.
 */
export async function decryptBackup(envelope, passphrase) {
  validatePassphrase(passphrase);
  if (!isEncryptedBackupEnvelope(envelope) ||
      envelope.kdf !== "PBKDF2-SHA-256" ||
      !Number.isSafeInteger(envelope.iterations) ||
      envelope.iterations < MIN_PBKDF2_ITERATIONS ||
      envelope.iterations > MAX_PBKDF2_ITERATIONS ||
      (envelope.version === LEGACY_BACKUP_ENVELOPE_VERSION && envelope.iterations !== PBKDF2_ITERATIONS) ||
      envelope.cipher !== "AES-256-GCM") {
    throw new Error("This encrypted backup format is not supported.");
  }

  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length < 16) {
    throw new Error("The encrypted backup file is malformed.");
  }

  const crypto = cryptoProvider();
  const key = await deriveBackupKey(passphrase, salt, ["decrypt"], envelope.iterations);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData(envelope),
      tagLength: 128,
    },
    key,
    ciphertext,
  );
  return JSON.parse(decoder.decode(plaintext));
}
