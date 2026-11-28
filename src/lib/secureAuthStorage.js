const DATABASE_NAME = "scholarship-scout-auth-session";
const DATABASE_VERSION = 1;
const STORE_NAME = "entries";
const KEY_RECORD = "__device-encryption-key__";
const AAD_PREFIX = "scholarship-scout-auth-session:v1:";
let databasePromise = null;
let deviceKeyPromise = null;

function getCrypto() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("Secure browser storage is unavailable.");
  }
  return globalThis.crypto;
}

function toBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) return Promise.reject(new Error("Secure browser storage is unavailable."));
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("Could not open secure account-session storage."));
    request.onblocked = () => reject(new Error("Account-session storage is busy in another tab."));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function readRecord(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error("Could not read secure account-session storage."));
    transaction.onabort = () => reject(transaction.error || new Error("Account-session storage read was aborted."));
  });
}

async function writeRecord(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Could not save secure account-session storage."));
    transaction.onabort = () => reject(transaction.error || new Error("Account-session storage write was aborted."));
  });
}

async function ensureDeviceKey() {
  if (deviceKeyPromise) return deviceKeyPromise;
  deviceKeyPromise = (async () => {
    const existing = await readRecord(KEY_RECORD);
    if (existing?.type === "secret" && existing.extractable === false && existing.algorithm?.name === "AES-GCM") {
      return existing;
    }
    const generated = await getCrypto().subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const read = store.get(KEY_RECORD);
      let selected = generated;
      read.onsuccess = () => {
        const current = read.result;
        if (current?.type === "secret" && current.extractable === false && current.algorithm?.name === "AES-GCM") {
          selected = current;
        } else {
          store.put(generated, KEY_RECORD);
        }
      };
      read.onerror = () => {
        try { transaction.abort(); } catch { /* transaction may already be complete */ }
      };
      transaction.oncomplete = () => resolve(selected);
      transaction.onerror = () => reject(transaction.error || new Error("Could not initialize secure account-session storage."));
      transaction.onabort = () => reject(transaction.error || new Error("Secure account-session storage initialization was aborted."));
    });
  })().catch((error) => {
    deviceKeyPromise = null;
    throw error;
  });
  return deviceKeyPromise;
}

export const secureAuthStorage = {
  async getItem(name) {
    if (typeof name !== "string" || !name) return null;
    const record = await readRecord(name);
    if (!record || record.version !== 1 || typeof record.iv !== "string" || typeof record.ciphertext !== "string") return null;
    const key = await ensureDeviceKey();
    const plaintext = await getCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(record.iv),
        additionalData: new TextEncoder().encode(AAD_PREFIX + name),
        tagLength: 128,
      },
      key,
      fromBase64(record.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  },

  async setItem(name, value) {
    if (typeof name !== "string" || !name || typeof value !== "string") {
      throw new TypeError("Invalid account-session storage record.");
    }
    const key = await ensureDeviceKey();
    const iv = getCrypto().getRandomValues(new Uint8Array(12));
    const ciphertext = await getCrypto().subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(AAD_PREFIX + name),
        tagLength: 128,
      },
      key,
      new TextEncoder().encode(value),
    );
    await writeRecord(name, {
      version: 1,
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    });
  },

  async removeItem(name) {
    if (typeof name !== "string" || !name || name === KEY_RECORD) return;
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(name);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not remove account-session storage."));
      transaction.onabort = () => reject(transaction.error || new Error("Account-session storage removal was aborted."));
    });
  },

  async clear() {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.key !== KEY_RECORD) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear account-session storage."));
      transaction.onabort = () => reject(transaction.error || new Error("Account-session storage clear was aborted."));
    });
  },
};

export async function destroySecureAuthStorage() {
  if (!globalThis.indexedDB) return true;
  deviceKeyPromise = null;
  const db = await openDatabase();
  db.close();
  databasePromise = null;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("Could not delete account-session storage."));
    request.onblocked = () => reject(new Error("Account-session storage is open in another tab."));
  });
}
