import test from "node:test";
import assert from "node:assert/strict";
import {
  appendReliabilityEvent,
  clearReliabilityEvents,
  installReliabilityMonitoring,
  readReliabilityEvents,
  recordReliabilityEvent,
  RELIABILITY_EVENT_TYPES,
  RELIABILITY_STORAGE_KEY,
} from "../src/lib/reliabilityMonitor.js";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) { return key === RELIABILITY_STORAGE_KEY ? value : null; },
    setItem(key, next) { if (key === RELIABILITY_STORAGE_KEY) value = next; },
    removeItem(key) { if (key === RELIABILITY_STORAGE_KEY) value = null; },
    get value() { return value; },
  };
}

test("records only allowlisted event categories and timestamps", () => {
  const events = appendReliabilityEvent([], {
    type: "runtime_error",
    message: "private essay text",
    stack: "secret stack",
    url: "https://example.com/private",
  }, new Date("2026-11-10T18:00:00.000Z"));
  assert.deepEqual(events, [{ type: "runtime_error", occurredAt: "2026-11-10T18:00:00.000Z" }]);
  assert.deepEqual(RELIABILITY_EVENT_TYPES, [
    "runtime_error", "unhandled_rejection", "react_render_error", "storage_write_failure",
  ]);
});

test("rejects unrecognized event types and malformed timestamps", () => {
  assert.deepEqual(appendReliabilityEvent([], { type: "private_data_leak" }), []);
  assert.deepEqual(appendReliabilityEvent([], { type: "runtime_error", occurredAt: "not-a-date" }), []);
});

test("retains only the newest bounded events", () => {
  const initial = Array.from({ length: 40 }, (_, index) => ({
    type: "runtime_error", occurredAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
  }));
  const next = appendReliabilityEvent(initial, { type: "unhandled_rejection" }, new Date("2026-11-10T18:00:00.000Z"));
  assert.equal(next.length, 25);
  assert.equal(next.at(-1).type, "unhandled_rejection");
});

test("reads malformed or unavailable local storage without throwing", () => {
  const malformed = memoryStorage("{bad");
  assert.deepEqual(readReliabilityEvents(malformed), []);
  const broken = { getItem() { throw new Error("unavailable"); } };
  assert.deepEqual(readReliabilityEvents(broken), []);
});

test("clear removes only the local reliability history", () => {
  const storage = memoryStorage(JSON.stringify([{ type: "runtime_error", occurredAt: "2026-11-10T18:00:00.000Z" }]));
  clearReliabilityEvents(storage);
  assert.deepEqual(readReliabilityEvents(storage), []);
});

test("global listeners store generic local event categories and can be removed", () => {
  const storage = memoryStorage();
  const handlers = new Map();
  const target = {
    addEventListener(type, handler) { handlers.set(type, handler); },
    removeEventListener(type, handler) { if (handlers.get(type) === handler) handlers.delete(type); },
    dispatchEvent() {},
  };
  const cleanup = installReliabilityMonitoring({ target, storage, now: () => new Date("2026-11-10T18:00:00.000Z") });
  handlers.get("error")({ message: "private content from the page" });
  handlers.get("unhandledrejection")({ reason: "private content from promise" });
  const stored = readReliabilityEvents(storage);
  assert.deepEqual(stored.map((event) => event.type), ["runtime_error", "unhandled_rejection"]);
  assert.equal(JSON.stringify(stored).includes("private content"), false);
  assert.deepEqual(Object.keys(stored[0]).sort(), ["occurredAt", "type"]);
  assert.doesNotMatch(storage.value, /message|stack|url|reason|private content/i);
  cleanup();
  assert.equal(handlers.size, 0);
});

test("handles a SecurityError thrown by the global localStorage getter", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("SecurityError"); },
  });

  try {
    assert.deepEqual(readReliabilityEvents(), []);
    assert.doesNotThrow(() => recordReliabilityEvent("runtime_error", {
      now: () => new Date("2026-11-10T18:00:00.000Z"),
    }));
    assert.doesNotThrow(() => clearReliabilityEvents());
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      delete globalThis.localStorage;
    }
  }
});

test("does not fail application behavior when reliability storage is unavailable", () => {
  const storage = { getItem() { throw new Error("no storage"); }, setItem() { throw new Error("no storage"); } };
  assert.doesNotThrow(() => appendReliabilityEvent([], { type: "storage_write_failure" }, new Date()));
  assert.deepEqual(readReliabilityEvents(storage), []);
});
