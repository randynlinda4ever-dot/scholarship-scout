export const LOCAL_VAULT_FORMAT: string;
export const LOCAL_VAULT_VERSION: number;
export const DEVICE_VAULT_VERSION: number;
export const LOCAL_VAULT_DATABASE: string;
export const LOCAL_VAULT_STORE: string;
export const LOCAL_VAULT_RECORD_KEY: string;
export const LOCAL_VAULT_KDF_ITERATIONS: number;
export type LocalVaultBackend = { get(): Promise<unknown>; set(value: unknown): Promise<unknown>; delete?(): Promise<unknown> };
export type LocalVaultStatus =
  | { mode: "missing" }
  | { mode: "legacy-passphrase" }
  | { mode: "trusted-device" }
  | { mode: "device-key-missing" }
  | { mode: "different-account" }
  | { mode: "unsupported" };
export function getLocalVaultStatus(userId: string, options?: { backend?: Pick<LocalVaultBackend, "get">; keyProvider?: (userId: string) => Promise<CryptoKey> }): Promise<LocalVaultStatus>;
export function hasEncryptedVault(options?: { backend?: Pick<LocalVaultBackend, "get"> }): Promise<boolean>;
export function createDeviceVault(userId: string, options?: { storage?: Storage; backend?: LocalVaultBackend; lockManager?: LockManager | null; keyProvider?: (userId: string) => Promise<CryptoKey> }): Promise<{ recordCount: number }>;
export function unlockDeviceVault(userId: string, options?: { storage?: Storage; backend?: LocalVaultBackend; lockManager?: LockManager | null; keyProvider?: (userId: string) => Promise<CryptoKey> }): Promise<{ recordCount: number }>;
export function resetUnrecoverableDeviceVault(userId: string, options: { backend?: LocalVaultBackend; confirmation: string; keyDeleter?: (userId: string) => Promise<void> }): Promise<boolean>;
export function migrateLocalVaultToDevice(passphrase: string, userId: string, options?: { storage?: Storage; backend?: LocalVaultBackend; lockManager?: LockManager | null; keyProvider?: (userId: string) => Promise<CryptoKey> }): Promise<{ recordCount: number }>;
/** Legacy APIs remain for explicit recovery/migration support. */
export function createLocalVault(passphrase: string, options?: { storage?: Storage; backend?: LocalVaultBackend; lockManager?: LockManager | null }): Promise<{ recordCount: number }>;
export function unlockLocalVault(passphrase: string, options?: { storage?: Storage; backend?: LocalVaultBackend; lockManager?: LockManager | null }): Promise<{ recordCount: number }>;
export function flushLocalVault(): Promise<boolean>;
export function destroyLocalVault(options?: { storage?: Storage; sessionStorage?: Storage; backend?: LocalVaultBackend; userId?: string; keyDeleter?: (userId: string) => Promise<void>; authStorageCleaner?: () => Promise<boolean> }): Promise<boolean>;
export function hasPendingLocalVaultWrites(): boolean;
export function lockLocalVault(): Promise<boolean>;
export function isLocalVaultUnlocked(): boolean;
export const vaultStorage: Storage;
