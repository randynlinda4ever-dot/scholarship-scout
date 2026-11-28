import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

const { createEncryptedAuthStorage, clearEncryptedAuthStorage } = await import("../src/lib/deviceKeyStorage.js");

function createMemoryRecords() {
  const records = new Map();
  return {
    records,
    async getRecord(key) { return records.get(key) ?? null; },
    async putRecord(key, value) { records.set(key, structuredClone(value)); },
    async addRecord(key, value) {
      if (records.has(key)) {
        const error = new Error("Duplicate key");
        error.name = "ConstraintError";
        throw error;
      }
      records.set(key, structuredClone(value));
    },
    async deleteRecord(key) { records.delete(key); },
    async listRecordKeys() { return [...records.keys()]; },
  };
}

test("Supabase auth storage encrypts session and PKCE values at rest and restores them", async () => {
  const records = createMemoryRecords();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const storage = createEncryptedAuthStorage({
    getOrCreateKey: async () => key,
    ...records,
  });

  const secret = JSON.stringify({ access_token: "private-access-token", refresh_token: "private-refresh-token" });
  await storage.setItem("sb-project-auth-token", secret);
  await storage.setItem("sb-project-code-verifier", "private-pkce-verifier");

  const stored = JSON.stringify([...records.records.values()]);
  for (const plaintext of ["private-access-token", "private-refresh-token", "private-pkce-verifier"]) {
    assert.equal(stored.includes(plaintext), false);
  }

  assert.equal(await storage.getItem("sb-project-auth-token"), secret);
  assert.equal(await storage.getItem("sb-project-code-verifier"), "private-pkce-verifier");
});

test("encrypted auth storage can be recreated after reload using the same persistent device key", async () => {
  const records = createMemoryRecords();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const first = createEncryptedAuthStorage({ getOrCreateKey: async () => key, ...records });
  await first.setItem("auth-token", "session-value");

  const afterReload = createEncryptedAuthStorage({ getOrCreateKey: async () => key, ...records });
  assert.equal(await afterReload.getItem("auth-token"), "session-value");
});

test("encrypted auth storage rejects tampering instead of returning corrupted credentials", async () => {
  const records = createMemoryRecords();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const storage = createEncryptedAuthStorage({ getOrCreateKey: async () => key, ...records });
  await storage.setItem("auth-token", "session-value");
  const envelope = records.records.get("auth:auth-token");
  envelope.ciphertext[0] ^= 0xff;
  records.records.set("auth:auth-token", envelope);

  await assert.rejects(storage.getItem("auth-token"));
});

test("removing a Supabase auth key deletes only that encrypted entry", async () => {
  const records = createMemoryRecords();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const storage = createEncryptedAuthStorage({ getOrCreateKey: async () => key, ...records });
  await storage.setItem("auth-token", "token");
  await storage.setItem("pkce", "verifier");
  await storage.removeItem("auth-token");

  assert.equal(await storage.getItem("auth-token"), null);
  assert.equal(await storage.getItem("pkce"), "verifier");
});

test("clearing local data removes all encrypted Supabase auth and PKCE records but preserves device vault keys", async () => {
  const records = createMemoryRecords();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const storage = createEncryptedAuthStorage({ getOrCreateKey: async () => key, ...records });
  await storage.setItem("sb-project-auth-token", "session");
  await storage.setItem("sb-project-code-verifier", "pkce");
  records.records.set("key:auth-session", key);
  records.records.set("key:vault:user-a", key);

  await clearEncryptedAuthStorage(records);

  assert.deepEqual([...records.records.keys()], ["key:vault:user-a"]);
});
