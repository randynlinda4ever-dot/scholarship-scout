import { recordReliabilityEvent } from "./reliabilityMonitor.js";

function recordStorageFailure() {
  recordReliabilityEvent("storage_write_failure");
}

/**
 * Save JSON to browser storage and return an explicit status.
 */
export function writeJsonStorage(key, value, resolveStorage = () => globalThis.localStorage) {
  try {
    const storage = resolveStorage();
    if (!storage || typeof storage.setItem !== "function") {
      recordStorageFailure();
      return false;
    }
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") {
      recordStorageFailure();
      return false;
    }
    storage.setItem(key, serialized);
    return true;
  } catch {
    recordStorageFailure();
    return false;
  }
}

/**
 * Persist several related JSON records as one best-effort transaction.
 *
 * Web Storage has no multi-key transaction API. This helper snapshots every
 * affected key before writing, performs all writes, and restores the snapshots
 * in reverse order if any write fails. Callers must update UI state only after
 * success is true. A failed rollback is reported explicitly so callers do not
 * promise stronger atomicity than localStorage can provide.
 */
export function writeJsonStorageBatch(entries, resolveStorage = () => globalThis.localStorage) {
  let operations;
  try {
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
      recordStorageFailure();
      return { ok: false, rollbackSucceeded: true };
    }
    operations = Object.entries(entries).map(([key, value]) => {
      const serialized = JSON.stringify(value);
      if (typeof key !== "string" || !key || typeof serialized !== "string") {
        throw new Error("Invalid storage batch entry.");
      }
      return { key, serialized };
    });
  } catch {
    recordStorageFailure();
    return { ok: false, rollbackSucceeded: true };
  }

  if (operations.length === 0) return { ok: true, rollbackSucceeded: true };

  let storage;
  let snapshots;
  try {
    storage = resolveStorage();
    if (!storage ||
        typeof storage.getItem !== "function" ||
        typeof storage.setItem !== "function" ||
        typeof storage.removeItem !== "function") {
      throw new Error("Browser storage does not support transactional writes.");
    }
    snapshots = operations.map(({ key }) => ({
      key,
      value: storage.getItem(key),
    }));
  } catch {
    recordStorageFailure();
    return { ok: false, rollbackSucceeded: true };
  }

  try {
    for (const operation of operations) {
      storage.setItem(operation.key, operation.serialized);
    }
    return { ok: true, rollbackSucceeded: true };
  } catch {
    let rollbackSucceeded = true;
    for (const snapshot of [...snapshots].reverse()) {
      try {
        if (snapshot.value === null || snapshot.value === undefined) {
          storage.removeItem(snapshot.key);
        } else {
          storage.setItem(snapshot.key, snapshot.value);
        }
      } catch {
        rollbackSucceeded = false;
      }
    }
    recordStorageFailure();
    return { ok: false, rollbackSucceeded };
  }
}
