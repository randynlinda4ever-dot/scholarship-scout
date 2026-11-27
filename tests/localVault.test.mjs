import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

const {
  createLocalVault,
  destroyLocalVault,
  flushLocalVault,
  hasEncryptedVault,
  hasPendingLocalVaultWrites,
  lockLocalVault,
  unlockLocalVault,
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
  return {
    async get() { return value ? structuredClone(value) : null; },
    async set(next) { value = structuredClone(next); },
    async delete() { value = null; },
    inspect() { return value ? structuredClone(value) : null; },
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
