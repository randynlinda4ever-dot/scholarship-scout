import test from "node:test";
import assert from "node:assert/strict";
import { createVaultSessionLockCoordinator } from "../src/lib/vaultSessionLock.js";

test("manual sign-out and its SIGNED_OUT event share one flush and one vault lock", async () => {
  const calls = [];
  let coordinator;
  coordinator = createVaultSessionLockCoordinator({
    flush: async () => { calls.push("flush"); },
    stopAutoRefresh: async () => { calls.push("stop-auto-refresh"); },
    signOut: async () => {
      calls.push("sign-out");
      queueMicrotask(() => { void coordinator.lockAfterSignOut(); });
    },
    lock: async () => { calls.push("lock"); },
    onLocked: () => calls.push("reload"),
  });

  await coordinator.signOutAndLock();
  await Promise.resolve();

  assert.deepEqual(calls, ["flush", "stop-auto-refresh", "sign-out", "lock", "reload"]);
  assert.equal(await coordinator.lockAfterSignOut(), true);
  assert.equal(calls.filter((entry) => entry === "lock").length, 1);
});

test("a failed flush keeps the vault unlocked and allows a safe retry", async () => {
  const calls = [];
  let shouldFail = true;
  const coordinator = createVaultSessionLockCoordinator({
    flush: async () => {
      calls.push("flush");
      if (shouldFail) throw new Error("pending writes could not be saved");
    },
    stopAutoRefresh: async () => calls.push("stop-auto-refresh"),
    signOut: async () => calls.push("sign-out"),
    lock: async () => calls.push("lock"),
    onLocked: () => calls.push("reload"),
  });

  await assert.rejects(coordinator.signOutAndLock(), /pending writes could not be saved/);
  assert.deepEqual(calls, ["flush"]);

  shouldFail = false;
  await coordinator.signOutAndLock();
  assert.deepEqual(calls, ["flush", "flush", "stop-auto-refresh", "sign-out", "lock", "reload"]);
});
