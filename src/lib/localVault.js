export const LOCAL_VAULT_FORMAT = "scholarship-scout-local-vault";
export const LOCAL_VAULT_VERSION = 1;
export const LOCAL_VAULT_DATABASE = "scholarship-scout-local-vault";
export const LOCAL_VAULT_STORE = "vault";
export const LOCAL_VAULT_RECORD_KEY = "primary";
export const LOCAL_VAULT_KDF_ITERATIONS = 600_000;

const LEGAL_ACCEPTANCE_KEY = "scholarship-scout.legal-acceptance";
const RELIABILITY_KEY = "scout-local-reliability";
const SUPABASE_AUTH_STORAGE_KEY = "sb-wjrwvempgjvoxlioodse-auth-token";
const SUPABASE_AUTH_CODE_VERIFIER_KEY = `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`;
const MIN_PASSPHRASE_LENGTH = 12;
const MAX_PASSPHRASE_LENGTH = 1024;
const MAX_RECORDS = 2_000;
const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let activeVault = null;
let databasePromise = null;
// The adapter starts inert before the first unlock and remains inert after an
// intentional lock or data wipe. Early SDK callbacks must not read or persist
// records while the vault gate is still active or a reload is pending.
let inactiveUntilReload = true;

function getCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("Secure browser encryption is unavailable. Use a current browser over HTTPS.");
  }
  return globalThis.crypto;
}

function validatePassphrase(passphrase) {
  if (typeof passphrase !== "string" ||
      passphrase.length < MIN_PASSPHRASE_LENGTH ||
      passphrase.length > MAX_PASSPHRASE_LENGTH) {
    throw new Error("Use a local vault passphrase between 12 and 1024 characters.");
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== "string" ||
      value.length > 16_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("The local vault record is malformed.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function additionalData() {
  return encoder.encode([
    LOCAL_VAULT_FORMAT,
    "v" + LOCAL_VAULT_VERSION,
    "PBKDF2-SHA-256",
    String(LOCAL_VAULT_KDF_ITERATIONS),
    "AES-256-GCM",
  ].join(":"));
}

async function deriveKey(passphrase, salt, usages) {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: LOCAL_VAULT_KDF_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function normalizeRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    throw new Error("The local vault contains an unsupported number of records.");
  }
  const keys = new Set();
  const normalized = [];
  for (const entry of records) {
    if (!entry || typeof entry !== "object" ||
        typeof entry.key !== "string" || !entry.key ||
        typeof entry.value !== "string" ||
        keys.has(entry.key) ||
        entry.key === LOCAL_VAULT_RECORD_KEY) {
      throw new Error("The local vault contains an invalid storage record.");
    }
    keys.add(entry.key);
    normalized.push({ key: entry.key, value: entry.value });
  }
  const payload = {
    format: LOCAL_VAULT_FORMAT + "-data",
    version: LOCAL_VAULT_VERSION,
    records: normalized,
  };
  if (encoder.encode(JSON.stringify(payload)).byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("Your local data is too large for the current vault limit. Export a backup before changing storage.");
  }
  return payload;
}

async function encryptPayload(payload, key, salt) {
  const crypto = getCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(), tagLength: 128 },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  return {
    format: LOCAL_VAULT_FORMAT,
    version: LOCAL_VAULT_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: LOCAL_VAULT_KDF_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptEnvelope(envelope, passphrase) {
  validatePassphrase(passphrase);
  if (!envelope || typeof envelope !== "object" ||
      envelope.format !== LOCAL_VAULT_FORMAT ||
      envelope.version !== LOCAL_VAULT_VERSION ||
      envelope.kdf !== "PBKDF2-SHA-256" ||
      envelope.iterations !== LOCAL_VAULT_KDF_ITERATIONS ||
      envelope.cipher !== "AES-256-GCM") {
    throw new Error("This local vault format is not supported.");
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) {
    throw new Error("The local vault record is malformed.");
  }
  const key = await deriveKey(passphrase, salt, ["encrypt", "decrypt"]);
  const plaintext = await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(), tagLength: 128 },
    key,
    ciphertext,
  );
  let payload;
  try { payload = JSON.parse(decoder.decode(plaintext)); }
  catch { throw new Error("The local vault could not be decoded."); }
  if (!payload || payload.format !== LOCAL_VAULT_FORMAT + "-data" ||
      payload.version !== LOCAL_VAULT_VERSION) {
    throw new Error("The local vault payload is not supported.");
  }
  return { key, salt, payload: normalizeRecords(payload.records) };
}

function openVaultDatabase() {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB?.open) {
    return Promise.reject(new Error("Encrypted local storage requires IndexedDB in a modern browser."));
  }
  databasePromise = new Promise((resolve, reject) => {
    let request;
    try { request = globalThis.indexedDB.open(LOCAL_VAULT_DATABASE, 1); }
    catch (error) {
      databasePromise = null;
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_VAULT_STORE)) db.createObjectStore(LOCAL_VAULT_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Could not open encrypted local storage."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Encrypted local storage is blocked by another open tab. Close other Scholarship Scout tabs and retry."));
    };
  });
  return databasePromise;
}

function indexedDbBackend() {
  return {
    async get() {
      const db = await openVaultDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_VAULT_STORE, "readonly");
        const request = transaction.objectStore(LOCAL_VAULT_STORE).get(LOCAL_VAULT_RECORD_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error || new Error("Could not read the encrypted local vault."));
        transaction.onabort = () => reject(transaction.error || new Error("The local vault read was aborted."));
      });
    },
    async set(value) {
      const db = await openVaultDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_VAULT_STORE, "readwrite");
        transaction.objectStore(LOCAL_VAULT_STORE).put(value, LOCAL_VAULT_RECORD_KEY);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Could not save the encrypted local vault."));
        transaction.onabort = () => reject(transaction.error || new Error("The local vault write was aborted."));
      });
    },
    async delete() {
      const db = await openVaultDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_VAULT_STORE, "readwrite");
        transaction.objectStore(LOCAL_VAULT_STORE).clear();
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Could not remove encrypted local data."));
        transaction.onabort = () => reject(transaction.error || new Error("Local data removal was aborted."));
      });
    },
  };
}

function getBackend(backend) {
  return backend ?? indexedDbBackend();
}

function isExcludedPlaintextKey(key) {
  const isScoutRecord = key.startsWith("scout-") && key !== RELIABILITY_KEY;
  const isCurrentSupabaseSession = key === SUPABASE_AUTH_STORAGE_KEY || key === SUPABASE_AUTH_CODE_VERIFIER_KEY;
  return key === LEGAL_ACCEPTANCE_KEY || key === RELIABILITY_KEY || (!isScoutRecord && !isCurrentSupabaseSession);
}

function readLegacyRecords(storage) {
  if (!storage || typeof storage.length !== "number" ||
      typeof storage.key !== "function" || typeof storage.getItem !== "function") {
    throw new Error("Browser storage is unavailable. Your existing data has not been changed.");
  }
  const records = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key !== "string" || isExcludedPlaintextKey(key)) continue;
    const value = storage.getItem(key);
    if (typeof value === "string") records.push({ key, value });
  }
  return normalizeRecords(records);
}

function removeLegacyRecords(storage) {
  if (!storage || typeof storage.length !== "number" ||
      typeof storage.key !== "function" || typeof storage.removeItem !== "function") {
    throw new Error("Browser storage cleanup is unavailable. Keep the vault page open and retry.");
  }
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" && !isExcludedPlaintextKey(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  for (const key of keys) {
    if (storage.getItem(key) !== null) {
      throw new Error("Encrypted data was saved, but a plaintext browser-storage record could not be removed. Retry unlock before using the workspace.");
    }
  }
}

function activateVault({ key, salt, payload, backend }) {
  inactiveUntilReload = false;
  const records = new Map(payload.records.map(({ key: recordKey, value }) => [recordKey, value]));
  activeVault = {
    key,
    salt,
    records,
    backend,
    queue: Promise.resolve(),
    pendingWrites: 0,
    lastError: null,
  };
  return { recordCount: records.size };
}

function queuePersist(state) {
  const persist = async () => {
    if (activeVault !== state) return;
    const payload = normalizeRecords([...state.records].map(([key, value]) => ({ key, value })));
    const envelope = await encryptPayload(payload, state.key, state.salt);
    await state.backend.set(envelope);
    state.lastError = null;
  };
  state.pendingWrites += 1;
  state.queue = state.queue.then(persist, persist).catch((error) => {
    state.lastError = error instanceof Error ? error : new Error("Encrypted local save failed.");
    try {
      globalThis.window?.dispatchEvent?.(new CustomEvent("scout:vault-persistence-error"));
    } catch { /* storage errors must not disrupt state updates */ }
  }).finally(() => {
    state.pendingWrites = Math.max(0, state.pendingWrites - 1);
    try {
      globalThis.window?.dispatchEvent?.(new Event("scout:vault-write-state"));
    } catch { /* pending-write notifications are best-effort */ }
  });
}

export async function hasEncryptedVault({ backend } = {}) {
  const envelope = await getBackend(backend).get();
  return Boolean(envelope && typeof envelope === "object" &&
    envelope.format === LOCAL_VAULT_FORMAT && envelope.version === LOCAL_VAULT_VERSION);
}

const VAULT_WEB_LOCK_NAME = "scholarship-scout-local-vault-session";
let releaseVaultTabLock = null;
let vaultLockReleasePromise = null;

async function acquireVaultTabLock(lockManager = globalThis.navigator?.locks) {
  if (vaultLockReleasePromise) await vaultLockReleasePromise;
  if (releaseVaultTabLock) return;
  if (!lockManager || typeof lockManager.request !== "function") {
    throw new Error("This browser does not support the secure single-tab vault lock. Update your browser before opening student records.");
  }

  let resolveStarted;
  let rejectStarted;
  const started = new Promise((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  let releaseHold;
  const hold = new Promise((resolve) => { releaseHold = resolve; });

  let request;
  try {
    request = lockManager.request(
      VAULT_WEB_LOCK_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock) {
          rejectStarted(new Error("Your local vault is already open in another tab. Close that tab, then refresh this page."));
          return;
        }
        resolveStarted();
        await hold;
      },
    );
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "The browser could not acquire the local vault lock.");
  }
  request.catch((error) => {
    rejectStarted(error instanceof Error ? error : new Error("The browser local vault lock was lost."));
  });
  await started;

  let releasePromise = null;
  const release = async () => {
    if (!releasePromise) {
      releaseHold();
      releasePromise = request.then(() => undefined, () => undefined);
      vaultLockReleasePromise = releasePromise;
    }
    await releasePromise;
    if (releaseVaultTabLock === release) releaseVaultTabLock = null;
    if (vaultLockReleasePromise === releasePromise) vaultLockReleasePromise = null;
  };
  releaseVaultTabLock = release;
}

async function releaseActiveVaultTabLock() {
  const release = releaseVaultTabLock;
  if (release) {
    await release();
  } else if (vaultLockReleasePromise) {
    await vaultLockReleasePromise;
  }
}

export async function createLocalVault(passphrase, { storage = globalThis.localStorage, backend, lockManager } = {}) {
  validatePassphrase(passphrase);
  if (activeVault) throw new Error("The local vault is already unlocked.");
  await acquireVaultTabLock(lockManager);
  try {
    const selectedBackend = getBackend(backend);
    if (await selectedBackend.get()) throw new Error("A local vault already exists. Unlock it instead of replacing it.");
    const payload = readLegacyRecords(storage);
    const salt = getCrypto().getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt, ["encrypt", "decrypt"]);
    const envelope = await encryptPayload(payload, key, salt);
    await selectedBackend.set(envelope);

    const storedEnvelope = await selectedBackend.get();
    const verified = await decryptEnvelope(storedEnvelope, passphrase);
    if (JSON.stringify(verified.payload) !== JSON.stringify(payload)) {
      throw new Error("The encrypted local vault did not pass its read-back verification. Existing browser data was not removed.");
    }
    removeLegacyRecords(storage);
    return activateVault({ ...verified, backend: selectedBackend });
  } catch (error) {
    await releaseActiveVaultTabLock();
    throw error;
  }
}

export async function unlockLocalVault(passphrase, { storage = globalThis.localStorage, backend, lockManager } = {}) {
  if (activeVault) return { recordCount: activeVault.records.size };
  await acquireVaultTabLock(lockManager);
  try {
    const selectedBackend = getBackend(backend);
    const envelope = await selectedBackend.get();
    if (!envelope) throw new Error("No encrypted local vault exists in this browser.");
    const unlocked = await decryptEnvelope(envelope, passphrase);
    // The encrypted copy is authoritative; this finishes interrupted cleanup.
    removeLegacyRecords(storage);
    return activateVault({ ...unlocked, backend: selectedBackend });
  } catch (error) {
    await releaseActiveVaultTabLock();
    throw error;
  }
}

export async function flushLocalVault() {
  if (!activeVault && inactiveUntilReload) return true;
  if (!activeVault) throw new Error("The local vault is locked.");
  const state = activeVault;
  while (true) {
    const pending = state.queue;
    await pending;
    if (state.queue === pending) break;
  }
  if (state.lastError) {
    throw new Error("The latest local changes could not be encrypted and saved. Keep this tab open and retry before locking or reloading.");
  }
  return true;
}

export async function lockLocalVault() {
  if (!activeVault) return true;
  if (activeVault.destroyed || inactiveUntilReload) {
    activeVault.records.clear();
    activeVault = null;
    await releaseActiveVaultTabLock();
    return true;
  }
  await flushLocalVault();
  activeVault.records.clear();
  // Fence late callbacks during the lock-to-reload window. Reads return no data
  // and writes are ignored until a successful unlock reactivates the adapter.
  inactiveUntilReload = true;
  activeVault = null;
  await releaseActiveVaultTabLock();
  return true;
}

/**
 * Permanently removes the encrypted vault record and Scholarship Scout-owned
 * browser metadata from this browser profile. Unrelated site storage is kept.
 * The user must repeat this action on every other browser profile or device.
 */
export async function destroyLocalVault({
  storage = globalThis.localStorage,
  sessionStorage = globalThis.sessionStorage,
  backend,
} = {}) {
  const state = activeVault;
  const selectedBackend = state?.backend ?? getBackend(backend);

  if (state) {
    while (true) {
      const pending = state.queue;
      await pending;
      if (state.queue === pending) break;
    }
  }

  if (typeof selectedBackend.delete !== "function") {
    throw new Error("This browser storage provider does not support permanent local-data removal.");
  }

  // Clear the encrypted record before changing browser metadata or reporting success.
  await selectedBackend.delete();

  if (state) {
    state.records.clear();
    state.destroyed = true;
  }
  // Keep reads and writes safe during the React-unmount/navigation window.
  // The in-memory records have already been cleared and the persisted vault
  // envelope has been deleted; no further writes are allowed in this document.
  activeVault = null;
  inactiveUntilReload = true;
  await releaseActiveVaultTabLock();

  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function" ||
      typeof storage.removeItem !== "function" || typeof storage.getItem !== "function") {
    throw new Error("The local vault was removed, but browser metadata could not be accessed. Review the privacy notice and contact support.");
  }

  const localKeysToRemove = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" &&
        (key.startsWith("scout-") || key.startsWith("scholarship-scout.") ||
         key === SUPABASE_AUTH_STORAGE_KEY || key === SUPABASE_AUTH_CODE_VERIFIER_KEY)) {
      localKeysToRemove.push(key);
    }
  }
  for (const key of localKeysToRemove) storage.removeItem(key);
  if (localKeysToRemove.some((key) => storage.getItem(key) !== null)) {
    throw new Error("The encrypted vault was removed, but some app-owned browser metadata could not be cleared. Retry after checking browser storage permissions.");
  }

  if (sessionStorage && typeof sessionStorage.length === "number" &&
      typeof sessionStorage.key === "function" && typeof sessionStorage.removeItem === "function") {
    const sessionKeysToRemove = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (typeof key === "string" && (
        key.startsWith("scout-") ||
        key.startsWith("scholarship-scout.") ||
        key === SUPABASE_AUTH_STORAGE_KEY ||
        key === SUPABASE_AUTH_CODE_VERIFIER_KEY
      )) sessionKeysToRemove.push(key);
    }
    for (const key of sessionKeysToRemove) sessionStorage.removeItem(key);
  }

  return true;
}

export function isLocalVaultUnlocked() {
  return activeVault !== null;
}

export function hasPendingLocalVaultWrites() {
  return Boolean(activeVault && (activeVault.pendingWrites > 0 || activeVault.lastError));
}

export const vaultStorage = {
  get length() {
    if (!activeVault) {
      if (inactiveUntilReload) return 0;
      throw new Error("The local vault is locked.");
    }
    return activeVault.records.size;
  },
  key(index) {
    if (!activeVault) {
      if (inactiveUntilReload) return null;
      throw new Error("The local vault is locked.");
    }
    return [...activeVault.records.keys()][index] ?? null;
  },
  getItem(key) {
    if (!activeVault) {
      if (inactiveUntilReload) return null;
      throw new Error("The local vault is locked.");
    }
    return activeVault.records.has(String(key)) ? activeVault.records.get(String(key)) : null;
  },
  setItem(key, value) {
    if (!activeVault) {
      if (inactiveUntilReload) return;
      throw new Error("The local vault is locked.");
    }
    activeVault.records.set(String(key), String(value));
    queuePersist(activeVault);
  },
  removeItem(key) {
    if (!activeVault) {
      if (inactiveUntilReload) return;
      throw new Error("The local vault is locked.");
    }
    activeVault.records.delete(String(key));
    queuePersist(activeVault);
  },
  clear() {
    if (!activeVault) {
      if (inactiveUntilReload) return;
      throw new Error("The local vault is locked.");
    }
    activeVault.records.clear();
    queuePersist(activeVault);
  },
};
