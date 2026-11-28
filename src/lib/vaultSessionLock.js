/**
 * Serializes vault flushing, auth sign-out, and memory locking.
 * Supabase can emit SIGNED_OUT while signOut() is still resolving; the
 * auth-state listener must join this in-flight operation rather than race
 * a second flush/lock sequence.
 */
export function createVaultSessionLockCoordinator({
  flush,
  stopAutoRefresh,
  signOut,
  lock,
  onLocked,
}) {
  let inFlight = null;
  let completed = false;

  const execute = (signOutFirst) => {
    if (completed) return Promise.resolve(true);
    if (inFlight) return inFlight;

    const operation = (async () => {
      await flush();
      if (signOutFirst) {
        await stopAutoRefresh();
        await signOut();
      }
      await lock();
      completed = true;
      onLocked?.();
      return true;
    })();

    inFlight = operation;
    return operation.finally(() => {
      if (inFlight === operation) inFlight = null;
    });
  };

  return Object.freeze({
    signOutAndLock: () => execute(true),
    lockAfterSignOut: () => execute(false),
  });
}
