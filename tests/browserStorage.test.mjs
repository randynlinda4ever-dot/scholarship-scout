import test from "node:test";
import assert from "node:assert/strict";
import { writeJsonStorage, writeJsonStorageBatch, writeAndFlushJsonState } from "../src/lib/browserStorage.js";

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

test("writes a local record, updates its UI state, then flushes encrypted persistence", async () => {
  const events = [];
  const storage = createMemoryStorage();
  const nextState = { scholarship: [true, false] };
  const result = await writeAndFlushJsonState({
    key: "scout-application-progress",
    value: nextState,
    resolveStorage: () => ({
      ...storage,
      setItem(key, value) {
        events.push("write");
        storage.setItem(key, value);
      },
    }),
    updateState(value) {
      events.push("state");
      assert.equal(value, nextState);
    },
    flush: async () => { events.push("flush"); },
  });

  assert.deepEqual(result, { ok: true, durable: true });
  assert.deepEqual(events, ["write", "state", "flush"]);
  assert.deepEqual(JSON.parse(storage.getItem("scout-application-progress")), nextState);
});

test("does not update UI state or flush when the synchronous storage write fails", async () => {
  let updated = false;
  let flushed = false;
  const result = await writeAndFlushJsonState({
    key: "scout-application-workspace",
    value: {},
    resolveStorage: () => ({ setItem() { throw new Error("quota exceeded"); } }),
    updateState() { updated = true; },
    flush: async () => { flushed = true; },
  });

  assert.deepEqual(result, { ok: false, durable: false });
  assert.equal(updated, false);
  assert.equal(flushed, false);
});

test("keeps the in-tab state update but reports when encrypted persistence fails", async () => {
  let state;
  const result = await writeAndFlushJsonState({
    key: "scout-resource-workspace",
    value: { worksheet: "draft" },
    resolveStorage: () => createMemoryStorage(),
    updateState(value) { state = value; },
    flush: async () => { throw new Error("IndexedDB unavailable"); },
  });

  assert.deepEqual(result, { ok: true, durable: false });
  assert.deepEqual(state, { worksheet: "draft" });
});
