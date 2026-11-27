import test from "node:test";
import assert from "node:assert/strict";
import { createDiscoveryClientIdentity } from "../src/lib/discoveryClientIdentity.js";

const firstId = "a3f5f0b0-2f1b-4a3b-9a0c-7d8e9f001122";
const secondId = "b3f5f0b0-2f1b-4a3b-9a0c-7d8e9f001122";

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test("discovery identity persists only within the current browser tab session", () => {
  const storage = makeStorage();
  const getId = createDiscoveryClientIdentity({ storage, randomUUID: () => firstId });
  assert.equal(getId(), firstId);
  assert.equal(storage.values.get("scholarship-scout.discovery-client-id"), firstId);
  assert.equal(getId(), firstId);
});

test("a valid existing session identity is reused without generating another id", () => {
  const storage = makeStorage({ "scholarship-scout.discovery-client-id": secondId });
  let generated = 0;
  const getId = createDiscoveryClientIdentity({ storage, randomUUID: () => { generated++; return firstId; } });
  assert.equal(getId(), secondId);
  assert.equal(generated, 0);
});

test("invalid stored identities are replaced with a fresh UUID", () => {
  const storage = makeStorage({ "scholarship-scout.discovery-client-id": "not-a-uuid" });
  const getId = createDiscoveryClientIdentity({ storage, randomUUID: () => firstId });
  assert.equal(getId(), firstId);
  assert.equal(storage.values.get("scholarship-scout.discovery-client-id"), firstId);
});

test("storage failures fall back to one in-memory identity for the page lifetime", () => {
  const storage = {
    getItem() { throw new Error("storage disabled"); },
    setItem() { throw new Error("storage disabled"); },
  };
  let generated = 0;
  const getId = createDiscoveryClientIdentity({ storage, randomUUID: () => { generated++; return firstId; } });
  assert.equal(getId(), firstId);
  assert.equal(getId(), firstId);
  assert.equal(generated, 1);
});
