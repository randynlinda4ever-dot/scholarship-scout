import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

const {
  createLocalVault,
  destroyLocalVault,
  vaultStorage,
} = await import("../src/lib/localVault.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function memoryBackend() {
  let value = null;
  return {
    async get() { return value ? structuredClone(value) : null; },
    async set(next) { value = structuredClone(next); },
    async delete() { value = null; },
    inspect() { return value; },
  };
}

function memoryLock() {
  return { async request(_name, _options, callback) { return callback({ name: _name }); } };
}

test("destroying a local vault removes its encrypted envelope and app-owned browser metadata only", async () => {
  const storage = memoryStorage({
    "scout-profile": JSON.stringify({ state: "Texas" }),
    "scholarship-scout.legal-acceptance": JSON.stringify({ accepted: true }),
    "scout-local-reliability": "[]",
    "unrelated-widget-preference": "preserve",
  });
  const sessionStorage = memoryStorage({
    "scout-auth-email-cooldown-until": "123",
    "scholarship-scout.discovery-client-id": "d2719d2e-5471-4b62-8e6e-0f7f6f1c01d4",
    "unrelated-session-preference": "preserve",
  });
  const backend = memoryBackend();
  await createLocalVault("a sufficiently long local passphrase", {
    storage, backend, lockManager: memoryLock(),
  });
  await vaultStorage.setItem("scout-profile", JSON.stringify({ state: "Oklahoma" }));

  await destroyLocalVault({ storage, sessionStorage, backend });

  assert.equal(backend.inspect(), null);
  assert.equal(storage.getItem("scholarship-scout.legal-acceptance"), null);
  assert.equal(storage.getItem("scout-local-reliability"), null);
  assert.equal(storage.getItem("unrelated-widget-preference"), "preserve");
  assert.equal(sessionStorage.getItem("scout-auth-email-cooldown-until"), null);
  assert.equal(sessionStorage.getItem("scholarship-scout.discovery-client-id"), null);
  assert.equal(sessionStorage.getItem("unrelated-session-preference"), "preserve");
  assert.equal(vaultStorage.getItem("scout-profile"), null);
  assert.equal(vaultStorage.length, 0);
  assert.equal(vaultStorage.key(0), null);
  assert.doesNotThrow(() => vaultStorage.setItem("scout-profile", "must-not-persist"));
  assert.doesNotThrow(() => vaultStorage.removeItem("scout-profile"));
  assert.equal(await (await import("../src/lib/localVault.js")).flushLocalVault(), true);
});
