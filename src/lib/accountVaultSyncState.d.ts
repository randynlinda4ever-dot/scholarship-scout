export type AccountVaultSyncState =
  | "not-enabled"
  | "missing"
  | "invalid-remote"
  | "remote-ahead"
  | "local-ahead"
  | "dirty"
  | "current";
export function getAccountVaultSyncState(
  local: { enabled: boolean; revision: number; dirty: boolean } | null | undefined,
  remote: { revision: number } | null | undefined,
): AccountVaultSyncState;
