import test from "node:test";
import assert from "node:assert/strict";
import { getAccountVaultSyncState } from "../src/lib/accountVaultSyncState.js";

test("classifies accounts without enabled backups", () => {
  assert.equal(getAccountVaultSyncState({ enabled: false, revision: 0, dirty: false }, null), "not-enabled");
  assert.equal(getAccountVaultSyncState(null, { revision: 1 }), "not-enabled");
});

test("detects a newer cloud backup without allowing a stale device to overwrite it", () => {
  assert.equal(getAccountVaultSyncState({ enabled: true, revision: 3, dirty: true }, { revision: 4 }), "remote-ahead");
});

test("detects a missing, invalid, or unexpectedly older cloud backup", () => {
  const local = { enabled: true, revision: 3, dirty: false };
  assert.equal(getAccountVaultSyncState(local, null), "missing");
  assert.equal(getAccountVaultSyncState(local, { revision: 0 }), "invalid-remote");
  assert.equal(getAccountVaultSyncState(local, { revision: 2 }), "local-ahead");
});

test("uploads pending local changes only when cloud and local revisions match", () => {
  assert.equal(getAccountVaultSyncState({ enabled: true, revision: 3, dirty: true }, { revision: 3 }), "dirty");
  assert.equal(getAccountVaultSyncState({ enabled: true, revision: 3, dirty: false }, { revision: 3 }), "current");
});
