import test from "node:test";
import assert from "node:assert/strict";
import { writeJsonStorage, writeJsonStorageBatch } from "../src/lib/browserStorage.js";

test("writes JSON and reports success", () => {
  const values = new Map();
  const storage = {
    setItem(key, value) { values.set(key, value); },
  };

  assert.equal(writeJsonStorage("scout-profile", { state: "Texas" }, () => storage), true);
  assert.deepEqual(JSON.parse(values.get("scout-profile")), { state: "Texas" });
});

test("reports unavailable storage without throwing", () => {
  assert.equal(writeJsonStorage("scout-profile", {}, () => null), false);
  assert.equal(writeJsonStorage("scout-profile", {}, () => { throw new Error("blocked"); }), false);
});

test("reports quota and browser storage failures without throwing", () => {
  const storage = {
    setItem() { throw new Error("QuotaExceededError"); },
  };

  assert.equal(writeJsonStorage("scout-scholarships", [], () => storage), false);
});

function createMemoryStorage(initial = {}, failWriteNumbers = []) {
  const values = new Map(Object.entries(initial));
  const failures = new Set(failWriteNumbers);
  let writes = 0;
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      writes += 1;
      if (failures.delete(writes)) throw new Error("QuotaExceededError");
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    get writeCount() { return writes; },
  };
}

test("batch storage updates all restore keys together on success", () => {
  const storage = createMemoryStorage({
    "scout-profile": JSON.stringify({ state: "Old" }),
    "scout-scholarships": JSON.stringify([{ id: "old" }]),
  });
  const result = writeJsonStorageBatch({
    "scout-profile": { state: "Texas" },
    "scout-scholarships": [{ id: "new" }],
    "scout-application-progress": { new: [true] },
  }, () => storage);

  assert.deepEqual(result, { ok: true, rollbackSucceeded: true });
  assert.deepEqual(JSON.parse(storage.getItem("scout-profile")), { state: "Texas" });
  assert.deepEqual(JSON.parse(storage.getItem("scout-scholarships")), [{ id: "new" }]);
  assert.deepEqual(JSON.parse(storage.getItem("scout-application-progress")), { new: [true] });
});

test("a failed batch write restores prior values and removes newly created keys", () => {
  const storage = createMemoryStorage({
    "scout-profile": JSON.stringify({ state: "Old" }),
    "scout-scholarships": JSON.stringify([{ id: "old" }]),
  }, [2]);
  const result = writeJsonStorageBatch({
    "scout-profile": { state: "Texas" },
    "scout-scholarships": [{ id: "new" }],
    "scout-application-workspace": { new: { essays: [] } },
  }, () => storage);

  assert.deepEqual(result, { ok: false, rollbackSucceeded: true });
  assert.deepEqual(JSON.parse(storage.getItem("scout-profile")), { state: "Old" });
  assert.deepEqual(JSON.parse(storage.getItem("scout-scholarships")), [{ id: "old" }]);
  assert.equal(storage.getItem("scout-application-workspace"), null);
});

test("invalid storage snapshots and unserializable values fail before any writes", () => {
  const blockedRead = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("should not write"); },
    removeItem() {},
  };
  assert.deepEqual(writeJsonStorageBatch({ "scout-profile": {} }, () => blockedRead), {
    ok: false,
    rollbackSucceeded: true,
  });

  const storage = createMemoryStorage();
  const cyclic = {};
  cyclic.self = cyclic;
  assert.deepEqual(writeJsonStorageBatch({ "scout-profile": cyclic }, () => storage), {
    ok: false,
    rollbackSucceeded: true,
  });
  assert.equal(storage.writeCount, 0);
});
