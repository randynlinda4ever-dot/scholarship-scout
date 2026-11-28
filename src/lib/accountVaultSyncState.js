export function getAccountVaultSyncState(local, remote) {
  if (remote && (!Number.isSafeInteger(remote.revision) || remote.revision < 1)) {
    return "invalid-remote";
  }
  if (!remote) {
    if (!local?.enabled || !Number.isSafeInteger(local.revision) || local.revision < 1) {
      return "not-enabled";
    }
    return "missing";
  }
  // A server-side backup is the single account vault. A device without the
  // matching account-linked local revision must restore it, not create another.
  if (!local?.enabled || !Number.isSafeInteger(local.revision) || local.revision < 1) {
    return "remote-ahead";
  }
  if (remote.revision > local.revision) return "remote-ahead";
  if (remote.revision < local.revision) return "local-ahead";
  return local.dirty ? "dirty" : "current";
}
