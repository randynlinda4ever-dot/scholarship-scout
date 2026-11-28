import { destroySecureAuthStorage } from "./secureAuthStorage.js";
export const LOCAL_VAULT_FORMAT = "scholarship-scout-local-vault";
export const LOCAL_VAULT_VERSION = 2;
export const LOCAL_VAULT_DATABASE = "scholarship-scout-local-vault";
export const LOCAL_VAULT_STORE = "vault";
export const LOCAL_VAULT_RECORD_KEY = "primary";
export const LOCAL_VAULT_DEVICE_KEY = "device-unlock-key";
export const LOCAL_VAULT_KDF_ITERATIONS = 600_000;
const LEGACY_LOCAL_VAULT_VERSION = 1;

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

function additionalData(version = LOCAL_VAULT_VERSION, purpose = "payload") {
  const parts = [
    LOCAL_VAULT_FORMAT,
    "v" + version,
    "PBKDF2-SHA-256",
    String(LOCAL_VAULT_KDF_ITERATIONS),
    "AES-256-GCM",
  ];
  // Version 1 used this exact AAD. Keep it so existing local vaults remain
  // decryptable and can be upgraded after a successful passphrase unlock.
  if (version >= 2) parts.push(purpose);
  return encoder.encode(parts.join(":"));
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

async function encryptBytes(value, key, purpose) {
  const crypto = getCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(LOCAL_VAULT_VERSION, purpose), tagLength: 128 },
    key,
    value,
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBytes(envelope, key, purpose) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("The local vault key wrapper is malformed.");
  }
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) {
    throw new Error("The local vault key wrapper is malformed.");
  }
  return new Uint8Array(await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(LOCAL_VAULT_VERSION, purpose), tagLength: 128 },
    key,
    ciphertext,
  ));
}

async function importContentKey(rawKey) {
  if (!(rawKey instanceof Uint8Array) || rawKey.length !== 32) {
    throw new Error("The local vault encryption key is malformed.");
  }
  return getCrypto().subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptV2Payload(payload, contentKey, salt, keyWrap, deviceKeyWrap = null, ownerId = null, accountKeyWrap = null, cloudRevision = 0, localDirty = false) {
  const encryptedPayload = await encryptBytes(
    encoder.encode(JSON.stringify(payload)),
    contentKey,
    "payload",
  );
  return {
    format: LOCAL_VAULT_FORMAT,
    version: LOCAL_VAULT_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: LOCAL_VAULT_KDF_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: bytesToBase64(salt),
    keyWrap,
    ...(deviceKeyWrap ? { deviceKeyWrap } : {}),
    ...(typeof ownerId === "string" && ownerId ? { ownerId } : {}),
    ...(accountKeyWrap ? { accountKeyWrap } : {}),
    ...(Number.isSafeInteger(cloudRevision) && cloudRevision > 0 ? { cloudRevision } : {}),
    ...(accountKeyWrap ? { localDirty: localDirty === true } : {}),
    ...encryptedPayload,
  };
}

async function createV2Envelope(payload, passphrase, ownerId = null) {
  const salt = getCrypto().getRandomValues(new Uint8Array(16));
  const rawContentKey = getCrypto().getRandomValues(new Uint8Array(32));
  const contentKey = await importContentKey(rawContentKey);
  const passphraseKey = await deriveKey(passphrase, salt, ["encrypt", "decrypt"]);
  const keyWrap = await encryptBytes(rawContentKey, passphraseKey, "key-wrap");
  const normalized = normalizeRecords(payload.records);
  const envelope = await encryptV2Payload(normalized, contentKey, salt, keyWrap, null, ownerId);
  return { envelope, key: contentKey, rawContentKey, keyWrap, salt, payload: normalized, deviceKeyWrap: null, deviceKey: null, ownerId };
}

function isSupportedEnvelope(envelope) {
  return Boolean(envelope && typeof envelope === "object" &&
    envelope.format === LOCAL_VAULT_FORMAT &&
    (envelope.version === LEGACY_LOCAL_VAULT_VERSION || envelope.version === LOCAL_VAULT_VERSION) &&
    envelope.kdf === "PBKDF2-SHA-256" &&
    envelope.iterations === LOCAL_VAULT_KDF_ITERATIONS &&
    envelope.cipher === "AES-256-GCM");
}

async function decryptEnvelope(envelope, passphrase) {
  validatePassphrase(passphrase);
  if (!isSupportedEnvelope(envelope)) {
    throw new Error("This local vault format is not supported.");
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) {
    throw new Error("The local vault record is malformed.");
  }

  if (envelope.version === LEGACY_LOCAL_VAULT_VERSION) {
    const key = await deriveKey(passphrase, salt, ["encrypt", "decrypt"]);
    const plaintext = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(LEGACY_LOCAL_VAULT_VERSION), tagLength: 128 },
      key,
      ciphertext,
    );
    let payload;
    try { payload = JSON.parse(decoder.decode(plaintext)); }
    catch { throw new Error("The local vault could not be decoded."); }
    if (!payload || payload.format !== LOCAL_VAULT_FORMAT + "-data" ||
        payload.version !== LEGACY_LOCAL_VAULT_VERSION) {
      throw new Error("The local vault payload is not supported.");
    }
    return { legacy: true, salt, payload: normalizeRecords(payload.records) };
  }

  const passphraseKey = await deriveKey(passphrase, salt, ["encrypt", "decrypt"]);
  const rawContentKey = await decryptBytes(envelope.keyWrap, passphraseKey, "key-wrap");
  const key = await importContentKey(rawContentKey);
  const plaintext = await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(LOCAL_VAULT_VERSION, "payload"), tagLength: 128 },
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
  return {
    legacy: false,
    key,
    rawContentKey,
    keyWrap: envelope.keyWrap,
    deviceKeyWrap: envelope.deviceKeyWrap ?? null,
    ownerId: typeof envelope.ownerId === "string" ? envelope.ownerId : null,
    accountKeyWrap: envelope.accountKeyWrap ?? null,
    cloudRevision: Number.isSafeInteger(envelope.cloudRevision) && envelope.cloudRevision > 0 ? envelope.cloudRevision : 0,
    localDirty: envelope.localDirty === true,
    salt,
    payload: normalizeRecords(payload.records),
  };
}

function isValidDeviceKey(key) {
  return Boolean(key &&
    key.type === "secret" &&
    key.extractable === false &&
    key.algorithm?.name === "AES-GCM" &&
    key.algorithm?.length === 256 &&
    key.usages?.includes("encrypt") &&
    key.usages?.includes("decrypt"));
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
    async getDeviceKey() {
      const db = await openVaultDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_VAULT_STORE, "readonly");
        const request = transaction.objectStore(LOCAL_VAULT_STORE).get(LOCAL_VAULT_DEVICE_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error || new Error("Could not read the remembered-device key."));
        transaction.onabort = () => reject(transaction.error || new Error("The remembered-device key read was aborted."));
      });
    },
    async setDeviceKey(value) {
      const db = await openVaultDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_VAULT_STORE, "readwrite");
        transaction.objectStore(LOCAL_VAULT_STORE).put(value, LOCAL_VAULT_DEVICE_KEY);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Could not save the remembered-device key."));
        transaction.onabort = () => reject(transaction.error || new Error("The remembered-device key write was aborted."));
      });
    },
    async deleteDeviceKey() {
      const db = await openVaultDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(LOCAL_VAULT_STORE, "readwrite");
        transaction.objectStore(LOCAL_VAULT_STORE).delete(LOCAL_VAULT_DEVICE_KEY);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("Could not remove the remembered-device key."));
        transaction.onabort = () => reject(transaction.error || new Error("The remembered-device key removal was aborted."));
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

function clearTransientKeyMaterial(state) {
  if (state?.rawContentKey instanceof Uint8Array) state.rawContentKey.fill(0);
  if (state) state.rawContentKey = null;
}

function activateVault({
  key,
  rawContentKey,
  keyWrap,
  deviceKeyWrap = null,
  deviceKey = null,
  ownerId = null,
  accountKeyWrap = null,
  cloudRevision = 0,
  localDirty = false,
  writeGeneration = 0,
  salt,
  payload,
  backend,
}) {
  inactiveUntilReload = false;
  const records = new Map(payload.records.map(({ key: recordKey, value }) => [recordKey, value]));
  activeVault = {
    key,
    rawContentKey,
    keyWrap,
    deviceKeyWrap,
    deviceKey,
    ownerId,
    accountKeyWrap,
    cloudRevision,
    localDirty,
    writeGeneration,
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
    const envelope = await encryptV2Payload(
      payload,
      state.key,
      state.salt,
      state.keyWrap,
      state.deviceKeyWrap,
      state.ownerId,
      state.accountKeyWrap,
      state.cloudRevision,
      state.localDirty,
    );
    await state.backend.set(envelope);
    state.lastError = null;
    if (state.accountKeyWrap) {
      try { globalThis.window?.dispatchEvent?.(new Event("scout:vault-local-persisted")); }
      catch { /* cloud sync notification is best-effort */ }
    }
  };
  state.pendingWrites += 1;
  state.writeGeneration += 1;
  if (state.accountKeyWrap) state.localDirty = true;
  // Return the actual write promise to callers such as Supabase Auth. PKCE
  // must not redirect until its verifier has reached encrypted IndexedDB.
  const writePromise = state.queue.then(persist, persist);
  state.queue = writePromise.catch((error) => {
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
  return writePromise;
}

export async function hasEncryptedVault({ backend } = {}) {
  const envelope = await getBackend(backend).get();
  return isSupportedEnvelope(envelope);
}

export async function hasDeviceUnlock({ backend, ownerId } = {}) {
  const selectedBackend = getBackend(backend);
  if (typeof selectedBackend.getDeviceKey !== "function") return false;
  const envelope = await selectedBackend.get();
  if (!isSupportedEnvelope(envelope) || envelope.version !== LOCAL_VAULT_VERSION || !envelope.deviceKeyWrap) return false;
  if (ownerId && envelope.ownerId !== ownerId) return false;
  const deviceKey = await selectedBackend.getDeviceKey();
  return isValidDeviceKey(deviceKey);
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

export async function createLocalVault(passphrase, { storage = globalThis.localStorage, backend, lockManager, ownerId = null } = {}) {
  validatePassphrase(passphrase);
  if (activeVault) throw new Error("The local vault is already unlocked.");
  await acquireVaultTabLock(lockManager);
  try {
    const selectedBackend = getBackend(backend);
    if (await selectedBackend.get()) throw new Error("A local vault already exists. Unlock it instead of replacing it.");
    const payload = readLegacyRecords(storage);
    const created = await createV2Envelope(payload, passphrase, ownerId);
    await selectedBackend.set(created.envelope);

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

export async function unlockLocalVault(passphrase, {
  storage = globalThis.localStorage,
  backend,
  lockManager,
  rememberDevice = false,
  ownerId = null,
} = {}) {
  if (activeVault) return { recordCount: activeVault.records.size };
  await acquireVaultTabLock(lockManager);
  try {
    const selectedBackend = getBackend(backend);
    const envelope = await selectedBackend.get();
    if (!envelope) throw new Error("No encrypted local vault exists in this browser.");
    let unlocked = await decryptEnvelope(envelope, passphrase);
    if (ownerId && unlocked.ownerId && unlocked.ownerId !== ownerId) {
      throw new Error("This local vault belongs to a different Scholarship Scout account. Sign in to its original account before opening these records.");
    }
    if (!ownerId && unlocked.ownerId) {
      throw new Error("This local vault belongs to a signed-in account. Sign in to that account to open its records.");
    }
    if (unlocked.legacy) {
      const upgraded = await createV2Envelope(unlocked.payload, passphrase, ownerId);
      await selectedBackend.set(upgraded.envelope);
      const verified = await decryptEnvelope(await selectedBackend.get(), passphrase);
      if (JSON.stringify(verified.payload) !== JSON.stringify(unlocked.payload)) {
        throw new Error("The upgraded encrypted vault did not pass read-back verification. Existing data was not removed.");
      }
      unlocked = verified;
    } else if (ownerId && !unlocked.ownerId) {
      // Bind an existing guest vault only after the real account owner has
      // proved knowledge of its recovery passphrase.
      const boundEnvelope = await encryptV2Payload(
        unlocked.payload,
        unlocked.key,
        unlocked.salt,
        unlocked.keyWrap,
        unlocked.deviceKeyWrap,
        ownerId,
        unlocked.accountKeyWrap,
        unlocked.cloudRevision,
      );
      await selectedBackend.set(boundEnvelope);
      unlocked = await decryptEnvelope(await selectedBackend.get(), passphrase);
    }
    let deviceKey = null;
    if (unlocked.deviceKeyWrap && typeof selectedBackend.getDeviceKey === "function") {
      const candidate = await selectedBackend.getDeviceKey();
      if (isValidDeviceKey(candidate)) deviceKey = candidate;
    }
    removeLegacyRecords(storage);
    const result = activateVault({ ...unlocked, deviceKey, backend: selectedBackend });
    if (rememberDevice) await enableLocalVaultDeviceUnlock();
    return result;
  } catch (error) {
    await releaseActiveVaultTabLock();
    throw error;
  }
}

async function enqueueVaultOperation(state, operation) {
  state.pendingWrites += 1;
  const operationPromise = state.queue.then(operation, operation);
  state.queue = operationPromise.catch((error) => {
    state.lastError = error instanceof Error ? error : new Error("Encrypted local save failed.");
    try { globalThis.window?.dispatchEvent?.(new CustomEvent("scout:vault-persistence-error")); } catch { /* best-effort notification */ }
  }).finally(() => {
    state.pendingWrites = Math.max(0, state.pendingWrites - 1);
    try { globalThis.window?.dispatchEvent?.(new Event("scout:vault-write-state")); } catch { /* best-effort notification */ }
  });
  return operationPromise;
}

export async function unlockLocalVaultWithDeviceKey({
  storage = globalThis.localStorage,
  backend,
  lockManager,
  ownerId = null,
} = {}) {
  if (activeVault) return { recordCount: activeVault.records.size };
  await acquireVaultTabLock(lockManager);
  try {
    const selectedBackend = getBackend(backend);
    const envelope = await selectedBackend.get();
    if (!isSupportedEnvelope(envelope) || envelope.version !== LOCAL_VAULT_VERSION || !envelope.deviceKeyWrap) {
      throw new Error("Remembered device unlock is not available. Use your local vault passphrase.");
    }
    if (ownerId && envelope.ownerId !== ownerId) {
      throw new Error("This local vault belongs to a different Scholarship Scout account.");
    }
    if (typeof selectedBackend.getDeviceKey !== "function") {
      throw new Error("This browser cannot access its remembered-device key. Use your local vault passphrase.");
    }
    const deviceKey = await selectedBackend.getDeviceKey();
    if (!isValidDeviceKey(deviceKey)) {
      throw new Error("This browser's remembered-device key is unavailable. Use your local vault passphrase.");
    }
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) {
      throw new Error("The local vault record is malformed.");
    }
    const rawContentKey = await decryptBytes(envelope.deviceKeyWrap, deviceKey, "device-key-wrap");
    const key = await importContentKey(rawContentKey);
    const plaintext = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(LOCAL_VAULT_VERSION, "payload"), tagLength: 128 },
      key,
      ciphertext,
    );
    let payload;
    try { payload = JSON.parse(decoder.decode(plaintext)); }
    catch { throw new Error("The local vault could not be decoded."); }
    if (!payload || payload.format !== LOCAL_VAULT_FORMAT + "-data" || payload.version !== LOCAL_VAULT_VERSION) {
      throw new Error("The local vault payload is not supported.");
    }
    removeLegacyRecords(storage);
    return activateVault({
      key, rawContentKey, keyWrap: envelope.keyWrap, deviceKeyWrap: envelope.deviceKeyWrap,
      deviceKey, ownerId: typeof envelope.ownerId === "string" ? envelope.ownerId : null,
      accountKeyWrap: envelope.accountKeyWrap ?? null,
      cloudRevision: Number.isSafeInteger(envelope.cloudRevision) && envelope.cloudRevision > 0 ? envelope.cloudRevision : 0,
      salt, payload: normalizeRecords(payload.records), backend: selectedBackend,
    });
  } catch (error) {
    await releaseActiveVaultTabLock();
    throw error;
  }
}

export async function enableLocalVaultDeviceUnlock() {
  const state = activeVault;
  if (!state) throw new Error("Unlock the local vault before enabling remembered-device access.");
  await flushLocalVault();
  if (state.deviceKeyWrap && isValidDeviceKey(state.deviceKey)) return true;
  const backend = state.backend;
  if (typeof backend.setDeviceKey !== "function" || typeof backend.deleteDeviceKey !== "function") {
    throw new Error("This browser cannot securely store a remembered-device key. Your passphrase still works.");
  }
  return enqueueVaultOperation(state, async () => {
    if (activeVault !== state) throw new Error("The local vault was locked before device access could be enabled.");
    const deviceKey = await getCrypto().subtle.generateKey(
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
    if (!isValidDeviceKey(deviceKey)) throw new Error("This browser could not create a non-exportable remembered-device key.");
    const deviceKeyWrap = await encryptBytes(state.rawContentKey, deviceKey, "device-key-wrap");
    const payload = normalizeRecords([...state.records].map(([key, value]) => ({ key, value })));
    const envelope = await encryptV2Payload(
      payload, state.key, state.salt, state.keyWrap, deviceKeyWrap, state.ownerId,
      state.accountKeyWrap, state.cloudRevision,
    );
    await backend.setDeviceKey(deviceKey);
    try {
      await backend.set(envelope);
    } catch (error) {
      await backend.deleteDeviceKey().catch(() => undefined);
      throw error;
    }
    state.deviceKey = deviceKey;
    state.deviceKeyWrap = deviceKeyWrap;
    return true;
  });
}

export async function forgetLocalVaultDeviceUnlock({ backend } = {}) {
  const state = activeVault;
  const selectedBackend = state?.backend ?? getBackend(backend);
  if (state) {
    await flushLocalVault();
    await enqueueVaultOperation(state, async () => {
      const payload = normalizeRecords([...state.records].map(([key, value]) => ({ key, value })));
      const envelope = await encryptV2Payload(
        payload, state.key, state.salt, state.keyWrap, null, state.ownerId,
        state.accountKeyWrap, state.cloudRevision,
      );
      await selectedBackend.set(envelope);
      if (typeof selectedBackend.deleteDeviceKey === "function") await selectedBackend.deleteDeviceKey();
      state.deviceKey = null;
      state.deviceKeyWrap = null;
      return true;
    });
    return true;
  }
  const envelope = await selectedBackend.get();
  if (isSupportedEnvelope(envelope) && envelope.version === LOCAL_VAULT_VERSION) {
    const { deviceKeyWrap: _discarded, ...passphraseOnlyEnvelope } = envelope;
    await selectedBackend.set(passphraseOnlyEnvelope);
  }
  if (typeof selectedBackend.deleteDeviceKey === "function") await selectedBackend.deleteDeviceKey();
  return true;
}


function isValidAccountWrappingKey(key) {
  return Boolean(key &&
    key.type === "secret" &&
    key.extractable === false &&
    key.algorithm?.name === "AES-GCM" &&
    key.algorithm?.length === 256 &&
    key.usages?.includes("encrypt") &&
    key.usages?.includes("decrypt"));
}

export async function setLocalAccountVaultWrap(accountKeyWrap, { ownerId, wrappingKey } = {}) {
  const state = activeVault;
  if (!state) throw new Error("Unlock the local vault before enabling cross-device access.");
  if (!ownerId || state.ownerId !== ownerId) {
    throw new Error("This local vault is not bound to the signed-in account.");
  }
  if (!isValidAccountWrappingKey(wrappingKey)) {
    throw new Error("The synced passkey did not produce a valid encryption key.");
  }
  if (!accountKeyWrap || typeof accountKeyWrap.iv !== "string" || typeof accountKeyWrap.ciphertext !== "string") {
    throw new Error("The encrypted account key wrapper is malformed.");
  }
  // Verify the wrap before persisting it so an invalid PRF result cannot strand
  // the local vault behind an unusable cross-device recovery path.
  const unwrapped = await decryptBytes(accountKeyWrap, wrappingKey, "account-key-wrap");
  if (unwrapped.length !== 32 || !state.rawContentKey ||
      unwrapped.some((value, index) => value !== state.rawContentKey[index])) {
    throw new Error("The passkey-derived key did not verify against this local vault.");
  }
  await enqueueVaultOperation(state, async () => {
    if (activeVault !== state) throw new Error("The local vault was locked before cross-device access could be enabled.");
    const payload = normalizeRecords([...state.records].map(([key, value]) => ({ key, value })));
    state.writeGeneration += 1;
    state.localDirty = true;
    const envelope = await encryptV2Payload(
      payload, state.key, state.salt, state.keyWrap, state.deviceKeyWrap,
      state.ownerId, accountKeyWrap, 0, true,
    );
    await state.backend.set(envelope);
    state.accountKeyWrap = accountKeyWrap;
    state.cloudRevision = 0;
    try { globalThis.window?.dispatchEvent?.(new Event("scout:vault-local-persisted")); }
    catch { /* cloud sync notification is best-effort */ }
    return true;
  });
  return true;
}

export async function createLocalAccountVaultKeyWrap(wrappingKey, { ownerId } = {}) {
  const state = activeVault;
  if (!state || !state.rawContentKey) throw new Error("Unlock the local vault before setting up a synced passkey.");
  if (!ownerId || state.ownerId !== ownerId) throw new Error("The local vault does not belong to this signed-in account.");
  if (!isValidAccountWrappingKey(wrappingKey)) throw new Error("The passkey-derived encryption key is invalid.");
  const accountKeyWrap = await encryptBytes(state.rawContentKey, wrappingKey, "account-key-wrap");
  await setLocalAccountVaultWrap(accountKeyWrap, { ownerId, wrappingKey });
  return accountKeyWrap;
}

export function getLocalAccountVaultSyncStatus({ ownerId } = {}) {
  const state = activeVault;
  if (!state || !ownerId || state.ownerId !== ownerId) {
    return { enabled: false, revision: 0, dirty: false, generation: 0 };
  }
  return {
    enabled: Boolean(state.accountKeyWrap),
    revision: state.cloudRevision,
    dirty: state.localDirty === true,
    generation: state.writeGeneration,
  };
}

export async function forgetLocalAccountVaultSync({ ownerId } = {}) {
  const state = activeVault;
  if (!state) throw new Error("Unlock the local vault before disabling cross-device backup.");
  if (!ownerId || state.ownerId !== ownerId) {
    throw new Error("This local vault does not belong to the signed-in account.");
  }
  await flushLocalVault();
  await enqueueVaultOperation(state, async () => {
    const payload = normalizeRecords([...state.records].map(([key, value]) => ({ key, value })));
    const envelope = await encryptV2Payload(
      payload,
      state.key,
      state.salt,
      state.keyWrap,
      state.deviceKeyWrap,
      state.ownerId,
    );
    await state.backend.set(envelope);
    state.accountKeyWrap = null;
    state.cloudRevision = 0;
  });
  return true;
}

export async function getAccountVaultSyncEnvelope({ ownerId } = {}) {
  const state = activeVault;
  if (!state) throw new Error("Unlock the local vault before syncing encrypted account data.");
  if (!ownerId || state.ownerId !== ownerId) {
    throw new Error("The local vault belongs to a different account or is in guest mode.");
  }
  if (!state.accountKeyWrap) {
    throw new Error("Enable a synced passkey before creating an account vault backup.");
  }
  await flushLocalVault();
  const excluded = new Set([SUPABASE_AUTH_STORAGE_KEY, SUPABASE_AUTH_CODE_VERIFIER_KEY]);
  const payload = normalizeRecords(
    [...state.records]
      .filter(([key]) => !excluded.has(key))
      .map(([key, value]) => ({ key, value })),
  );
  const generation = state.writeGeneration;
  const envelope = await encryptV2Payload(
    payload, state.key, state.salt, state.keyWrap, null,
    state.ownerId, state.accountKeyWrap, state.cloudRevision, false,
  );
  const envelopeBytes = encoder.encode(JSON.stringify(envelope)).byteLength;
  if (envelopeBytes > 7_000_000) {
    throw new Error("This vault is too large for the current cross-device backup limit (7 MB encrypted). Your local vault remains saved on this device; use an encrypted export backup to transfer it.");
  }
  return { envelope, generation };
}

export async function setLocalAccountVaultRevision(revision, { ownerId, expectedGeneration } = {}) {
  const state = activeVault;
  if (!state) throw new Error("The local vault is locked.");
  if (!ownerId || state.ownerId !== ownerId || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("The account vault revision is invalid for this user.");
  }
  await enqueueVaultOperation(state, async () => {
    const generationChanged = Number.isSafeInteger(expectedGeneration) &&
      state.writeGeneration !== expectedGeneration;
    state.cloudRevision = revision;
    state.localDirty = generationChanged;
    const payload = normalizeRecords([...state.records].map(([key, value]) => ({ key, value })));
    const envelope = await encryptV2Payload(
      payload, state.key, state.salt, state.keyWrap, state.deviceKeyWrap,
      state.ownerId, state.accountKeyWrap, revision, state.localDirty,
    );
    await state.backend.set(envelope);
    if (generationChanged && state.accountKeyWrap) {
      try { globalThis.window?.dispatchEvent?.(new Event("scout:vault-local-persisted")); }
      catch { /* follow-up sync notification is best-effort */ }
    }
  });
  return revision;
}

function validateRemoteAccountVaultEnvelope(envelope, ownerId) {
  if (!isSupportedEnvelope(envelope) ||
      envelope.version !== LOCAL_VAULT_VERSION ||
      envelope.ownerId !== ownerId ||
      !envelope.accountKeyWrap ||
      !envelope.keyWrap ||
      typeof envelope.ciphertext !== "string" ||
      typeof envelope.iv !== "string") {
    throw new Error("The encrypted account backup is invalid or belongs to a different account.");
  }
  if (envelope.deviceKeyWrap) {
    const { deviceKeyWrap: _discarded, ...safeEnvelope } = envelope;
    return safeEnvelope;
  }
  return envelope;
}

export async function cacheAccountVaultBackupLocally(envelope, {
  ownerId,
  cloudRevision,
  storage = globalThis.localStorage,
  backend,
} = {}) {
  if (!ownerId || !Number.isSafeInteger(cloudRevision) || cloudRevision < 1) {
    throw new Error("The account backup metadata is invalid.");
  }
  if (activeVault) throw new Error("The local vault is already unlocked.");
  const selectedBackend = getBackend(backend);
  const safeEnvelope = validateRemoteAccountVaultEnvelope(envelope, ownerId);
  const existing = await selectedBackend.get();
  if (existing) {
    if (existing.ownerId === ownerId &&
        existing.ciphertext === safeEnvelope.ciphertext &&
        existing.accountKeyWrap?.ciphertext === safeEnvelope.accountKeyWrap.ciphertext &&
        existing.iv === safeEnvelope.iv) {
      return true;
    }
    throw new Error("A different local vault already exists. The account backup was not allowed to replace it.");
  }
  const legacy = readLegacyRecords(storage);
  if (legacy.records.length > 0) {
    throw new Error("This browser already contains local student records. Export or unlock that vault before restoring an account backup.");
  }
  await selectedBackend.set({ ...safeEnvelope, cloudRevision });
  const stored = await selectedBackend.get();
  if (!stored || stored.ownerId !== ownerId || stored.accountKeyWrap?.ciphertext !== safeEnvelope.accountKeyWrap.ciphertext) {
    await selectedBackend.delete();
    throw new Error("The encrypted account backup could not be cached in this browser.");
  }
  return true;
}

export async function restoreLocalVaultWithAccountKey(envelope, wrappingKey, {
  ownerId,
  cloudRevision,
  storage = globalThis.localStorage,
  backend,
  lockManager,
} = {}) {
  if (!ownerId || !Number.isSafeInteger(cloudRevision) || cloudRevision < 1 ||
      !isValidAccountWrappingKey(wrappingKey)) {
    throw new Error("A valid account and synced passkey are required to restore this vault.");
  }
  if (activeVault) throw new Error("The local vault is already unlocked.");
  await acquireVaultTabLock(lockManager);
  try {
    const selectedBackend = getBackend(backend);
    const safeEnvelope = validateRemoteAccountVaultEnvelope(envelope, ownerId);
    const existing = await selectedBackend.get();
    if (existing) {
      // The only permitted replacement is the exact remote ciphertext just
      // cached by the authenticated bootstrap on an otherwise empty device.
      if (existing.ownerId !== ownerId ||
          existing.ciphertext !== safeEnvelope.ciphertext ||
          existing.accountKeyWrap?.ciphertext !== safeEnvelope.accountKeyWrap.ciphertext) {
        throw new Error("This browser already has different local records. The account backup was not allowed to replace them.");
      }
    } else {
      const legacy = readLegacyRecords(storage);
      if (legacy.records.length > 0) {
        throw new Error("This browser already contains local student records. Export or unlock those records before restoring the account backup.");
      }
    }
    const rawContentKey = await decryptBytes(safeEnvelope.accountKeyWrap, wrappingKey, "account-key-wrap");
    const key = await importContentKey(rawContentKey);
    const iv = base64ToBytes(safeEnvelope.iv);
    const salt = base64ToBytes(safeEnvelope.salt);
    const ciphertext = base64ToBytes(safeEnvelope.ciphertext);
    if (iv.length !== 12 || salt.length !== 16 || ciphertext.length < 16) {
      rawContentKey.fill(0);
      throw new Error("The encrypted account backup is malformed.");
    }
    const plaintext = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(LOCAL_VAULT_VERSION, "payload"), tagLength: 128 },
      key,
      ciphertext,
    );
    let payload;
    try { payload = JSON.parse(decoder.decode(plaintext)); }
    catch {
      rawContentKey.fill(0);
      throw new Error("The account vault could not be decoded.");
    }
    if (!payload || payload.format !== LOCAL_VAULT_FORMAT + "-data" || payload.version !== LOCAL_VAULT_VERSION) {
      rawContentKey.fill(0);
      throw new Error("The account vault payload is not supported.");
    }

    const deviceKey = await getCrypto().subtle.generateKey(
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
    if (!isValidDeviceKey(deviceKey)) {
      rawContentKey.fill(0);
      throw new Error("This browser could not create its local remembered-device key.");
    }
    const deviceKeyWrap = await encryptBytes(rawContentKey, deviceKey, "device-key-wrap");
    const content = normalizeRecords(payload.records);
    const localEnvelope = await encryptV2Payload(
      content, key, salt, safeEnvelope.keyWrap, deviceKeyWrap,
      ownerId, safeEnvelope.accountKeyWrap, cloudRevision,
    );
    await selectedBackend.setDeviceKey(deviceKey);
    try {
      await selectedBackend.set(localEnvelope);
      const stored = await selectedBackend.get();
      const checkKey = await decryptBytes(stored.deviceKeyWrap, deviceKey, "device-key-wrap");
      if (checkKey.length !== rawContentKey.length ||
          checkKey.some((value, index) => value !== rawContentKey[index])) {
        throw new Error("The restored local vault did not pass device-key verification.");
      }
    } catch (error) {
      await selectedBackend.delete().catch(() => undefined);
      await selectedBackend.deleteDeviceKey().catch(() => undefined);
      rawContentKey.fill(0);
      throw error;
    }
    removeLegacyRecords(storage);
    return activateVault({
      key,
      rawContentKey,
      keyWrap: safeEnvelope.keyWrap,
      deviceKeyWrap,
      deviceKey,
      ownerId,
      accountKeyWrap: safeEnvelope.accountKeyWrap,
      cloudRevision,
      salt,
      payload: content,
      backend: selectedBackend,
    });
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
    clearTransientKeyMaterial(activeVault);
    activeVault = null;
    await releaseActiveVaultTabLock();
    return true;
  }
  await flushLocalVault();
  activeVault.records.clear();
  clearTransientKeyMaterial(activeVault);
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
    clearTransientKeyMaterial(state);
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

  try {
    await destroySecureAuthStorage();
  } catch {
    throw new Error("The local vault was removed, but the encrypted account session could not be cleared. Close other Scholarship Scout tabs and retry the local-data removal.");
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
      if (inactiveUntilReload) return Promise.resolve();
      throw new Error("The local vault is locked.");
    }
    activeVault.records.set(String(key), String(value));
    return queuePersist(activeVault);
  },
  removeItem(key) {
    if (!activeVault) {
      if (inactiveUntilReload) return Promise.resolve();
      throw new Error("The local vault is locked.");
    }
    activeVault.records.delete(String(key));
    return queuePersist(activeVault);
  },
  clear() {
    if (!activeVault) {
      if (inactiveUntilReload) return Promise.resolve();
      throw new Error("The local vault is locked.");
    }
    activeVault.records.clear();
    return queuePersist(activeVault);
  },
};
