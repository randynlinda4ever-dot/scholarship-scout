const DEVICE_KEY_DATABASE = "scholarship-scout-device-keys";
const DEVICE_KEY_STORE = "records";
const DEVICE_KEY_DATABASE_VERSION = 1;
const AUTH_KEY_ID = "key:auth-session";
const AUTH_RECORD_PREFIX = "auth:";
const AUTH_ENVELOPE_FORMAT = "scholarship-scout-auth-storage";
const AUTH_ENVELOPE_VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let databasePromise = null;

function cryptoProvider() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("Secure browser encryption is unavailable. Use a current browser over HTTPS.");
  }
  return globalThis.crypto;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB?.open) {
    return Promise.reject(new Error("Trusted-device key storage requires IndexedDB in a modern browser."));
  }

  databasePromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = globalThis.indexedDB.open(DEVICE_KEY_DATABASE, DEVICE_KEY_DATABASE_VERSION);
    } catch (error) {
      databasePromise = null;
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) {
        db.createObjectStore(DEVICE_KEY_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Could not open trusted-device key storage."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Trusted-device key storage is blocked by another tab. Close other Scholarship Scout tabs and retry."));
    };
  });
  return databasePromise;
}

async function readRecord(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, "readonly");
    const request = transaction.objectStore(DEVICE_KEY_STORE).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error("Could not read trusted-device key storage."));
    transaction.onabort = () => reject(transaction.error || new Error("Trusted-device storage read was aborted."));
  });
}

async function writeRecord(id, value, { onlyIfAbsent = false } = {}) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, "readwrite");
    const store = transaction.objectStore(DEVICE_KEY_STORE);
    const request = onlyIfAbsent ? store.add(value, id) : store.put(value, id);
    request.onerror = () => {
      reject(request.error || new Error("Could not save trusted-device key storage."));
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Could not save trusted-device key storage."));
    transaction.onabort = () => reject(transaction.error || new Error("Trusted-device storage write was aborted."));
  });
}

async function removeRecord(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, "readwrite");
    transaction.objectStore(DEVICE_KEY_STORE).delete(id);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Could not remove trusted-device key storage."));
    transaction.onabort = () => reject(transaction.error || new Error("Trusted-device storage removal was aborted."));
  });
}

async function listRecordKeys() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, "readonly");
    const request = transaction.objectStore(DEVICE_KEY_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error || new Error("Could not inspect trusted-device key storage."));
    transaction.onabort = () => reject(transaction.error || new Error("Trusted-device key inspection was aborted."));
  });
}

/**
 * Remove persisted Supabase session and PKCE records without deleting any
 * account-specific local-vault keys. The caller also clears its in-memory
 * Supabase client by navigating away immediately after this completes.
 */
export async function clearEncryptedAuthStorage(dependencies = {}) {
  const listKeys = dependencies.listRecordKeys ?? listRecordKeys;
  const deleteStoredRecord = dependencies.deleteRecord ?? removeRecord;
  const keys = await listKeys();
  for (const key of keys) {
    if (key === AUTH_KEY_ID || (typeof key === "string" && key.startsWith(AUTH_RECORD_PREFIX))) {
      await deleteStoredRecord(key);
    }
  }
  return true;
}

function isUsableAesKey(key) {
  return Boolean(
    key &&
    key.type === "secret" &&
    key.algorithm?.name === "AES-GCM" &&
    key.usages?.includes("encrypt") &&
    key.usages?.includes("decrypt"),
  );
}

async function getOrCreatePersistentKey(id, { getRecord = readRecord, addRecord = (key, value) => writeRecord(key, value, { onlyIfAbsent: true }) } = {}) {
  const existing = await getRecord(id);
  if (isUsableAesKey(existing)) return existing;

  const generated = await cryptoProvider().subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  try {
    await addRecord(id, generated);
    return generated;
  } catch (error) {
    // Concurrent tabs may both generate a key. The first atomic add wins.
    if (error?.name !== "ConstraintError") throw error;
    const winner = await getRecord(id);
    if (isUsableAesKey(winner)) return winner;
    throw new Error("The trusted-device encryption key could not be recovered.");
  }
}

export function getOrCreateAuthStorageKey(dependencies = {}) {
  return getOrCreatePersistentKey(AUTH_KEY_ID, dependencies);
}

export function getOrCreateDeviceVaultKey(userId, dependencies = {}) {
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new Error("A valid signed-in account is required to open its local workspace.");
  }
  return getOrCreatePersistentKey(`key:vault:${userId}`, dependencies);
}

export async function getDeviceVaultKey(userId, dependencies = {}) {
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new Error("A valid signed-in account is required to open its local workspace.");
  }
  const getRecord = dependencies.getRecord ?? readRecord;
  const key = await getRecord(`key:vault:${userId}`);
  if (!isUsableAesKey(key)) {
    const error = new Error("This browser's local encryption key is missing. The encrypted workspace has been preserved; use an encrypted backup or the original device to recover it.");
    error.name = "DeviceVaultKeyMissingError";
    throw error;
  }
  return key;
}

export async function deleteDeviceVaultKey(userId) {
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new Error("A valid signed-in account is required to remove its local encryption key.");
  }
  await removeRecord(`key:vault:${userId}`);
}

export function createEncryptedAuthStorage(dependencies = {}) {
  const getRecord = dependencies.getRecord ?? readRecord;
  const putRecord = dependencies.putRecord ?? writeRecord;
  const deleteRecord = dependencies.deleteRecord ?? removeRecord;
  const getKey = dependencies.getOrCreateKey ?? (() => getOrCreateAuthStorageKey(dependencies));

  return {
    async getItem(key) {
      const storageKey = String(key);
      const envelope = await getRecord(AUTH_RECORD_PREFIX + storageKey);
      if (envelope == null) return null;
      if (
        !envelope ||
        envelope.format !== AUTH_ENVELOPE_FORMAT ||
        envelope.version !== AUTH_ENVELOPE_VERSION ||
        !Array.isArray(envelope.iv) ||
        envelope.iv.length !== 12 ||
        !Array.isArray(envelope.ciphertext) ||
        envelope.ciphertext.length < 16 ||
        envelope.iv.some((value) => !Number.isInteger(value) || value < 0 || value > 255) ||
        envelope.ciphertext.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
      ) {
        throw new Error("The saved sign-in session is malformed. Request a new email sign-in link.");
      }
      const crypto = cryptoProvider();
      const cryptoKey = await getKey();
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(envelope.iv),
          additionalData: encoder.encode(`${AUTH_ENVELOPE_FORMAT}:v${AUTH_ENVELOPE_VERSION}:${storageKey}`),
          tagLength: 128,
        },
        cryptoKey,
        new Uint8Array(envelope.ciphertext),
      );
      return decoder.decode(plaintext);
    },

    async setItem(key, value) {
      const storageKey = String(key);
      if (typeof value !== "string") {
        throw new TypeError("The authentication storage value must be a string.");
      }
      const crypto = cryptoProvider();
      const cryptoKey = await getKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: encoder.encode(`${AUTH_ENVELOPE_FORMAT}:v${AUTH_ENVELOPE_VERSION}:${storageKey}`),
          tagLength: 128,
        },
        cryptoKey,
        encoder.encode(value),
      );
      await putRecord(AUTH_RECORD_PREFIX + storageKey, {
        format: AUTH_ENVELOPE_FORMAT,
        version: AUTH_ENVELOPE_VERSION,
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(ciphertext)),
      });
    },

    async removeItem(key) {
      await deleteRecord(AUTH_RECORD_PREFIX + String(key));
    },
  };
}

export const encryptedAuthStorage = createEncryptedAuthStorage();
