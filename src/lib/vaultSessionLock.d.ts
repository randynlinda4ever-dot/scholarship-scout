export interface VaultSessionLockDependencies {
  flush: () => Promise<unknown>;
  stopAutoRefresh: () => Promise<unknown>;
  signOut: () => Promise<unknown>;
  lock: () => Promise<unknown>;
  onLocked?: () => void;
}
export interface VaultSessionLockCoordinator {
  signOutAndLock(): Promise<boolean>;
  lockAfterSignOut(): Promise<boolean>;
}
export function createVaultSessionLockCoordinator(
  dependencies: VaultSessionLockDependencies,
): VaultSessionLockCoordinator;
