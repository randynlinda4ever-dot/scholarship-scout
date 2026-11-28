export function getAccountVaultSyncState(local, remote) {
  if (!local?.enabled || !Number.isSafeInteger(local.revision) || local.revision < 1) {
    return "not-enabled";
  }
  if (!remote) return "missing";
  if (!Number.isSafeInteger(remote.revision) || remote.revision < 1) return "invalid-remote";
  if (remote.revision > local.revision) return "remote-ahead";
  if (remote.revision < local.revision) return "local-ahead";
  return local.dirty ? "dirty" : "current";
}
