import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

const {
  createLocalVault,
  createLocalAccountVaultKeyWrap,
  getAccountVaultSyncEnvelope,
  getLocalAccountVaultSyncStatus,
  restoreLocalVaultWithAccountKey,
  setLocalAccountVaultRevision,
  destroyLocalVault,
  flushLocalVault,
  forgetLocalVaultDeviceUnlock,
  hasDeviceUnlock,
  hasEncryptedVault,
  hasPendingLocalVaultWrites,
  isLocalVaultUnlocked,
  enableLocalVaultDeviceUnlock,
  lockLocalVault,
  unlockLocalVault,
  unlockLocalVaultWithDeviceKey,
  vaultStorage,
} = await import("../src/lib/localVault.js");

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  };
}

function createMemoryBackend() {
  let value = null;
  let deviceKey = null;
  return {
    async get() { return value ? structuredClone(value) : null; },
    async set(next) { value = structuredClone(next); },
    async delete() { value = null; deviceKey = null; },
    async getDeviceKey() { return deviceKey; },
    async setDeviceKey(next) { deviceKey = next; },
    async deleteDeviceKey() { deviceKey = null; },
    inspect() { return value ? structuredClone(value) : null; },
    inspectDeviceKey() { return deviceKey; },
  };
}

function createMemoryLockManager() {
  let held = false;
  return {
    async request(name, options, callback) {
      if (held && options.ifAvailable) return callback(null);
      held = true;
      try {
        return await callback({ name });
      } finally {
        held = false;
      }
    },
  };
}

const PASS = "a memorable phrase with enough length";
const LEGAL_KEY = "scholarship-scout.legal-acceptance";
const RELIABILITY_KEY = "scout-local-reliability";
const SESSION_KEY = "sb-wjrwvempgjvoxlioodse-auth-token";
const PKCE_KEY = SESSION_KEY + "-code-verifier";

test.afterEach(async () => {
  if (isLocalVaultUnlocked()) await lockLocalVault();
});

test("vault storage is inert before the first successful unlock", () => {
  assert.equal(vaultStorage.length, 0);
  assert.equal(vaultStorage.key(0), null);
  assert.equal(vaultStorage.getItem("scout-profile"), null);
  assert.doesNotThrow(() => vaultStorage.setItem("scout-profile", "must-not-persist"));
  assert.equal(vaultStorage.getItem("scout-profile"), null);
});

test("the storage adapter stays inert after an intentional lock while reload is pending", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  await flushLocalVault();
  await lockLocalVault();

  assert.equal(vaultStorage.length, 0);
  assert.equal(vaultStorage.key(0), null);
  assert.equal(vaultStorage.getItem("scout-profile"), null);
  assert.doesNotThrow(() => vaultStorage.setItem("scout-profile", "late write"));
  assert.doesNotThrow(() => vaultStorage.removeItem("scout-profile"));
  assert.doesNotThrow(() => vaultStorage.clear());

  await unlockLocalVault(PASS, { storage, backend, lockManager });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { state: "Texas" });
  await lockLocalVault();
});

test("migration encrypts Scholarship Scout records and Supabase session/PKCE values only", async () => {
  const storage = createMemoryStorage({
    [LEGAL_KEY]: JSON.stringify({ accepted: true, version: "2026-11-26.2", acceptedAt: "2026-11-27T00:00:00.000Z" }),
    [RELIABILITY_KEY]: JSON.stringify([{ type: "runtime_error", occurredAt: "2026-11-27T00:00:00.000Z" }]),
    "unrelated-widget-preference": "leave-me-alone",
    "scout-profile": JSON.stringify({ school: "Private School", gpa: "3.8" }),
    "scout-scholarships": JSON.stringify([{ id: "one", name: "Private draft" }]),
    [SESSION_KEY]: JSON.stringify({ access_token: "session-secret" }),
    [PKCE_KEY]: "pkce-verifier-secret",
  });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  await flushLocalVault();

  assert.equal(await hasEncryptedVault({ backend }), true);
  for (const key of ["scout-profile", "scout-scholarships", SESSION_KEY, PKCE_KEY]) {
    assert.equal(storage.getItem(key), null, key + " should be removed after verified migration");
  }
  assert.notEqual(storage.getItem(LEGAL_KEY), null);
  assert.notEqual(storage.getItem(RELIABILITY_KEY), null);
  assert.equal(storage.getItem("unrelated-widget-preference"), "leave-me-alone");
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { school: "Private School", gpa: "3.8" });
  assert.equal(JSON.parse(vaultStorage.getItem(SESSION_KEY)).access_token, "session-secret");
  assert.equal(vaultStorage.getItem(PKCE_KEY), "pkce-verifier-secret");

  const envelopeText = JSON.stringify(backend.inspect());
  for (const privateValue of ["Private School", "session-secret", "pkce-verifier-secret", PASS]) {
    assert.equal(envelopeText.includes(privateValue), false);
  }
  await lockLocalVault();
});

test("a remembered browser unlocks the encrypted local vault without another passphrase", async () => {
  const storage = createMemoryStorage({
    "scout-profile": JSON.stringify({ state: "Texas", graduationYear: 2027 }),
    "scout-scholarships": JSON.stringify([{ id: "saved", title: "Local scholarship" }]),
  });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  await enableLocalVaultDeviceUnlock();
  assert.equal(await hasDeviceUnlock({ backend }), true);
  assert.equal(backend.inspectDeviceKey()?.extractable, false);
  assert.ok(backend.inspect()?.deviceKeyWrap);

  vaultStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: "cloud-session" }));
  await flushLocalVault();
  await lockLocalVault();

  assert.equal(vaultStorage.getItem("scout-profile"), null);
  const result = await unlockLocalVaultWithDeviceKey({ storage, backend, lockManager });
  assert.equal(result.recordCount, 3);
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), {
    state: "Texas",
    graduationYear: 2027,
  });
  assert.equal(JSON.parse(vaultStorage.getItem(SESSION_KEY)).access_token, "cloud-session");
  await lockLocalVault();
});

test("a user can disable remembered-device unlock and return to passphrase-only access", async () => {
  const storage = createMemoryStorage({
    "scout-profile": JSON.stringify({ state: "Texas" }),
  });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  await enableLocalVaultDeviceUnlock();
  await lockLocalVault();
  await unlockLocalVaultWithDeviceKey({ storage, backend, lockManager });
  await forgetLocalVaultDeviceUnlock({ backend });

  assert.equal(await hasDeviceUnlock({ backend }), false);
  assert.equal(backend.inspect()?.deviceUnlock, undefined);
  assert.equal(backend.inspectDeviceKey(), null);
  await lockLocalVault();

  await assert.rejects(
    unlockLocalVaultWithDeviceKey({ storage, backend, lockManager }),
    /remembered device unlock is not available/i,
  );
  await unlockLocalVault(PASS, { storage, backend, lockManager });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { state: "Texas" });
  await lockLocalVault();
});

test("an existing passphrase-only vault can opt into remembered-device unlock after one manual unlock", async () => {
  const storage = createMemoryStorage({
    "scout-profile": JSON.stringify({ state: "Texas" }),
  });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  assert.equal(await hasDeviceUnlock({ backend }), false);
  await lockLocalVault();

  await unlockLocalVault(PASS, { storage, backend, lockManager });
  await enableLocalVaultDeviceUnlock();
  assert.equal(await hasDeviceUnlock({ backend }), true);
  await lockLocalVault();

  await unlockLocalVaultWithDeviceKey({ storage, backend, lockManager });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { state: "Texas" });
  await lockLocalVault();
});

test("wrong passphrases never unlock the vault or expose encrypted records", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ school: "Private School" }) });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  await lockLocalVault();

  await assert.rejects(unlockLocalVault("incorrect phrase of sufficient length", { storage, backend, lockManager }));
  assert.equal(vaultStorage.getItem("scout-profile"), null);
  assert.equal(await hasEncryptedVault({ backend }), true);
});

test("workspace records, Supabase session, and PKCE verifier survive lock and unlock", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  vaultStorage.setItem("scout-profile", JSON.stringify({ state: "New Mexico" }));
  vaultStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: "rotated-secret" }));
  vaultStorage.setItem(PKCE_KEY, "rotated-pkce-secret");
  await flushLocalVault();
  await lockLocalVault();

  await unlockLocalVault(PASS, { storage, backend, lockManager });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), { state: "New Mexico" });
  assert.deepEqual(JSON.parse(vaultStorage.getItem(SESSION_KEY)), { access_token: "rotated-secret" });
  assert.equal(vaultStorage.getItem(PKCE_KEY), "rotated-pkce-secret");
  await lockLocalVault();
});

test("tampered ciphertext is rejected without deleting plaintext recovery data", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();

  await createLocalVault(PASS, { storage, backend, lockManager });
  await lockLocalVault();
  const envelope = backend.inspect();
  envelope.ciphertext = envelope.ciphertext.slice(0, -4) + "AAAA";
  await backend.set(envelope);

  storage.setItem("scout-profile", JSON.stringify({ state: "Recovery copy" }));
  await assert.rejects(unlockLocalVault(PASS, { storage, backend, lockManager }));
  assert.equal(storage.getItem("scout-profile"), JSON.stringify({ state: "Recovery copy" }));
  assert.equal(vaultStorage.getItem("scout-profile"), null);
});

test("a failed encrypted write remains unsaved until a retry succeeds", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();
  let failWrites = false;
  const flakyBackend = {
    async get() { return backend.get(); },
    async set(value) {
      if (failWrites) throw new Error("temporary IndexedDB failure");
      return backend.set(value);
    },
  };

  await createLocalVault(PASS, { storage, backend: flakyBackend, lockManager });
  failWrites = true;
  vaultStorage.setItem("scout-profile", JSON.stringify({ state: "Oklahoma" }));
  await assert.rejects(flushLocalVault(), /could not be encrypted and saved/i);
  assert.equal(hasPendingLocalVaultWrites(), true);

  failWrites = false;
  vaultStorage.setItem("scout-profile", JSON.stringify({ state: "Oklahoma" }));
  await flushLocalVault();
  assert.equal(hasPendingLocalVaultWrites(), false);
  await lockLocalVault();
});

test("Supabase PKCE storage writes remain pending until encrypted persistence completes", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = createMemoryBackend();
  let delayWrites = false;
  let releaseWrite;
  let markWriteStarted;
  const writeStarted = new Promise((resolve) => { markWriteStarted = resolve; });
  const delayedBackend = {
    async get() { return backend.get(); },
    async set(value) {
      if (delayWrites) {
        markWriteStarted();
        await new Promise((resolve) => { releaseWrite = resolve; });
      }
      return backend.set(value);
    },
  };
  const options = { storage, backend: delayedBackend, lockManager: createMemoryLockManager() };

  await createLocalVault(PASS, options);
  await flushLocalVault();
  delayWrites = true;

  const persistResult = vaultStorage.setItem(PKCE_KEY, "fresh-pkce-verifier");
  await writeStarted;
  let settledBeforePersistence = false;
  const observedWrite = Promise.resolve(persistResult).then(() => {
    settledBeforePersistence = true;
  });
  await Promise.resolve();

  const isAwaitable = Boolean(persistResult && typeof persistResult.then === "function");
  const hadResolvedBeforePersistence = settledBeforePersistence;
  releaseWrite();
  await observedWrite;
  await flushLocalVault();
  await lockLocalVault();

  await unlockLocalVault(PASS, options);
  const restoredVerifier = vaultStorage.getItem(PKCE_KEY);
  await lockLocalVault();

  assert.equal(isAwaitable, true, "Supabase must be able to await encrypted PKCE storage writes");
  assert.equal(hadResolvedBeforePersistence, false, "the write promise must not resolve before the encrypted record is durable");
  assert.equal(restoredVerifier, "fresh-pkce-verifier");
});

test("the browser lock is required and a storage failure leaves original data intact", async () => {
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = {
    async get() { return null; },
    async set() { throw new Error("IndexedDB quota failure"); },
  };

  await assert.rejects(createLocalVault(PASS, { storage, backend, lockManager: null }), /single-tab vault lock/i);
  await assert.rejects(createLocalVault("short", { storage, backend, lockManager: createMemoryLockManager() }));
  await assert.rejects(createLocalVault(PASS, { storage, backend, lockManager: createMemoryLockManager() }));
  assert.notEqual(storage.getItem("scout-profile"), null);
});


test("account-linked encrypted vaults restore on another device and enable same-device automatic unlock", async () => {
  const ownerId = "account-user-1";
  const sourceStorage = createMemoryStorage({
    "scout-profile": JSON.stringify({ state: "Texas", graduationYear: 2027 }),
    "scout-tracker": JSON.stringify([{ id: "award-1", name: "Local draft" }]),
  });
  const sourceBackend = createMemoryBackend();
  const lockManager = createMemoryLockManager();
  const wrappingKey = await webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  await createLocalVault(PASS, { storage: sourceStorage, backend: sourceBackend, lockManager, ownerId });
  await createLocalAccountVaultKeyWrap(wrappingKey, { ownerId });
  await flushLocalVault();

  const snapshot = await getAccountVaultSyncEnvelope({ ownerId });
  assert.equal(snapshot.envelope.ownerId, ownerId);
  assert.ok(snapshot.envelope.accountKeyWrap);
  assert.ok(snapshot.envelope.keyWrap);
  assert.equal("deviceKeyWrap" in snapshot.envelope, false);
  assert.equal(snapshot.envelope.localDirty, false);
  assert.equal(typeof snapshot.generation, "number");
  assert.equal(getLocalAccountVaultSyncStatus({ ownerId }).enabled, true);

  await lockLocalVault();

  const destinationStorage = createMemoryStorage();
  const destinationBackend = createMemoryBackend();
  await restoreLocalVaultWithAccountKey(snapshot.envelope, wrappingKey, {
    ownerId,
    cloudRevision: 1,
    storage: destinationStorage,
    backend: destinationBackend,
    lockManager,
  });

  assert.equal(getLocalAccountVaultSyncStatus({ ownerId }).enabled, true);
  assert.equal(getLocalAccountVaultSyncStatus({ ownerId }).revision, 1);
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), {
    state: "Texas",
    graduationYear: 2027,
  });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-tracker")), [
    { id: "award-1", name: "Local draft" },
  ]);
  assert.equal(await hasDeviceUnlock({ backend: destinationBackend, ownerId }), true);

  await lockLocalVault();
  await unlockLocalVaultWithDeviceKey({
    storage: destinationStorage,
    backend: destinationBackend,
    lockManager,
    ownerId,
  });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile")), {
    state: "Texas",
    graduationYear: 2027,
  });
});

test("vault syncing detects edits made while an account backup revision is in flight", async () => {
  const ownerId = "account-user-generation";
  const storage = createMemoryStorage({ "scout-profile": JSON.stringify({ state: "Texas" }) });
  const backend = createMemoryBackend();
  const lockManager = createMemoryLockManager();
  const wrappingKey = await webcrypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await createLocalVault(PASS, { storage, backend, lockManager, ownerId });
  await createLocalAccountVaultKeyWrap(wrappingKey, { ownerId });
  await flushLocalVault();

  const uploadSnapshot = await getAccountVaultSyncEnvelope({ ownerId });
  vaultStorage.setItem("scout-profile", JSON.stringify({ state: "Texas", school: "Updated after snapshot" }));
  await flushLocalVault();

  await setLocalAccountVaultRevision(1, {
    ownerId,
    expectedGeneration: uploadSnapshot.generation,
  });
  let status = getLocalAccountVaultSyncStatus({ ownerId });
  assert.equal(status.revision, 1);
  assert.equal(status.dirty, true, "new edits must remain queued for another sync");

  const nextSnapshot = await getAccountVaultSyncEnvelope({ ownerId });
  assert.notEqual(nextSnapshot.envelope.ciphertext, uploadSnapshot.envelope.ciphertext);
  await setLocalAccountVaultRevision(2, {
    ownerId,
    expectedGeneration: nextSnapshot.generation,
  });
  status = getLocalAccountVaultSyncStatus({ ownerId });
  assert.equal(status.revision, 2);
  assert.equal(status.dirty, false);
});

test("account vault sync status always satisfies its declared shape when locked or owned by another account", async () => {
  const locked = getLocalAccountVaultSyncStatus({ ownerId: "account-user-1" });
  assert.deepEqual(locked, {
    enabled: false,
    revision: 0,
    dirty: false,
    generation: 0,
  });

  await createLocalVault(PASS, {
    storage: createMemoryStorage(),
    backend: createMemoryBackend(),
    lockManager: createMemoryLockManager(),
    ownerId: "account-user-2",
  });
  assert.deepEqual(getLocalAccountVaultSyncStatus({ ownerId: "account-user-1" }), {
    enabled: false,
    revision: 0,
    dirty: false,
    generation: 0,
  });
  assert.deepEqual(getLocalAccountVaultSyncStatus({ ownerId: "account-user-2" }), {
    enabled: false,
    revision: 0,
    dirty: false,
    generation: 0,
  });
});
