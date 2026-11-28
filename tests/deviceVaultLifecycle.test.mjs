import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

const {
  createDeviceVault,
  createLocalVault,
  destroyLocalVault,
  flushLocalVault,
  getLocalVaultStatus,
  lockLocalVault,
  migrateLocalVaultToDevice,
  unlockDeviceVault,
  vaultStorage,
} = await import("../src/lib/localVault.js");

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.get(String(key)) ?? null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    snapshot() { return Object.fromEntries(map); },
  };
}

function memoryBackend() {
  let envelope = null;
  return {
    async get() { return envelope ? structuredClone(envelope) : null; },
    async set(value) { envelope = structuredClone(value); },
    async delete() { envelope = null; },
    snapshot() { return envelope ? structuredClone(envelope) : null; },
  };
}

function memoryLockManager() {
  return {
    async request(_name, _options, callback) {
      return callback({ name: "test-vault-lock" });
    },
  };
}

function keyProvider() {
  return webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PASS = "a memorable legacy phrase long enough";

test("new email-authenticated account gets an encrypted trusted-device vault without a vault passphrase", async () => {
  const storage = memoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  const provider = async () => key;

  assert.deepEqual(await getLocalVaultStatus(USER_A, { backend, keyProvider: provider }), { mode: "missing" });
  await createDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: provider });
  await flushLocalVault();

  assert.deepEqual(await getLocalVaultStatus(USER_A, { backend, keyProvider: provider }), { mode: "trusted-device" });
  assert.equal(storage.getItem("scout-profile"), null);
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { state: "Texas" });
  const saved = JSON.stringify(backend.snapshot());
  assert.equal(saved.includes("Texas"), false);
  await lockLocalVault();
});

test("trusted-device vault unlocks for its account after reload and rejects a different account", async () => {
  const storage = memoryStorage({ "scout-profile": JSON.stringify({ graduationYear: "2027" }) });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  const provider = async () => key;

  await createDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: provider });
  await flushLocalVault();
  await lockLocalVault();

  assert.deepEqual(await getLocalVaultStatus(USER_B, { backend, keyProvider: provider }), { mode: "different-account" });
  await assert.rejects(
    unlockDeviceVault(USER_B, { storage, backend, lockManager, keyProvider: provider }),
    /different sign-in/i,
  );
  assert.equal(vaultStorage.getItem("scout-profile"), null);

  await unlockDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: provider });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { graduationYear: "2027" });
  await lockLocalVault();
});

test("legacy passphrase vault migrates once to a device key without migrating the old Supabase session", async () => {
  const authKey = "sb-wjrwvempgjvoxlioodse-auth-token";
  const verifierKey = authKey + "-code-verifier";
  const storage = memoryStorage({
    "scout-profile": JSON.stringify({ gpa: "3.8" }),
    [authKey]: JSON.stringify({ access_token: "legacy-token" }),
    [verifierKey]: "legacy-verifier",
  });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  const provider = async () => key;

  await createLocalVault(PASS, { storage, backend, lockManager });
  await flushLocalVault();
  await lockLocalVault();
  assert.deepEqual(await getLocalVaultStatus(USER_A, { backend, keyProvider: provider }), { mode: "legacy-passphrase" });

  await migrateLocalVaultToDevice(PASS, USER_A, { storage, backend, lockManager, keyProvider: provider });
  await flushLocalVault();
  assert.deepEqual(await getLocalVaultStatus(USER_A, { backend, keyProvider: provider }), { mode: "trusted-device" });
  assert.equal(vaultStorage.getItem(authKey), null);
  assert.equal(vaultStorage.getItem(verifierKey), null);
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { gpa: "3.8" });
  assert.equal(storage.getItem("scout-profile"), null);

  const saved = JSON.stringify(backend.snapshot());
  assert.equal(saved.includes("legacy-token"), false);
  assert.equal(saved.includes("legacy-verifier"), false);
  await lockLocalVault();

  await unlockDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: provider });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { gpa: "3.8" });
  await lockLocalVault();
});

test("incorrect legacy passphrase leaves the original encrypted vault untouched", async () => {
  const storage = memoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  const beforeMigration = async () => key;

  await createLocalVault(PASS, { storage, backend, lockManager });
  await flushLocalVault();
  await lockLocalVault();
  const original = backend.snapshot();

  await assert.rejects(
    migrateLocalVaultToDevice("not the legacy passphrase phrase", USER_A, {
      storage, backend, lockManager, keyProvider: beforeMigration,
    }),
  );
  assert.deepEqual(backend.snapshot(), original);
  assert.deepEqual(await getLocalVaultStatus(USER_A, { backend, keyProvider: beforeMigration }), { mode: "legacy-passphrase" });
  assert.equal(storage.getItem("scout-profile"), null);
});

test("missing trusted-device key does not regenerate a key or replace encrypted local data", async () => {
  const storage = memoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  const provider = async () => key;
  await createDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: provider });
  await flushLocalVault();
  await lockLocalVault();
  const original = backend.snapshot();
  const missingKeyProvider = async () => {
    const error = new Error("device key missing");
    error.name = "DeviceVaultKeyMissingError";
    throw error;
  };

  assert.deepEqual(
    await getLocalVaultStatus(USER_A, { backend, keyProvider: missingKeyProvider }),
    { mode: "device-key-missing" },
  );
  await assert.rejects(
    unlockDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: missingKeyProvider }),
    /device key missing/i,
  );
  assert.deepEqual(backend.snapshot(), original);
  assert.equal(vaultStorage.getItem("scout-profile"), null);
});

test("local data deletion clears the matching vault, device key, and encrypted auth session", async () => {
  const storage = memoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  const provider = async () => key;
  await createDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: provider });
  await flushLocalVault();
  await lockLocalVault();
  let authCleared = false;
  let keyDeleted = "";

  await destroyLocalVault({
    storage,
    backend,
    userId: USER_A,
    authStorageCleaner: async () => { authCleared = true; return true; },
    keyDeleter: async (userId) => { keyDeleted = userId; },
  });

  assert.equal(authCleared, true);
  assert.equal(keyDeleted, USER_A);
  assert.equal(backend.snapshot(), null);
  assert.equal(storage.getItem("scout-profile"), null);
});

test("local data deletion refuses to erase a device vault owned by another account", async () => {
  const storage = memoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const key = await keyProvider();
  await createDeviceVault(USER_A, { storage, backend, lockManager, keyProvider: async () => key });
  await flushLocalVault();
  await lockLocalVault();
  let authCleared = false;
  const original = backend.snapshot();

  await assert.rejects(
    destroyLocalVault({
      storage, backend, userId: USER_B,
      authStorageCleaner: async () => { authCleared = true; return true; },
    }),
    /different account/i,
  );
  assert.equal(authCleared, false);
  assert.deepEqual(backend.snapshot(), original);
});
