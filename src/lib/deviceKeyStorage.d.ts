export function getOrCreateAuthStorageKey(dependencies?: unknown): Promise<CryptoKey>;
export function getOrCreateDeviceVaultKey(userId: string, dependencies?: unknown): Promise<CryptoKey>;
export function getDeviceVaultKey(userId: string, dependencies?: unknown): Promise<CryptoKey>;
export function deleteDeviceVaultKey(userId: string): Promise<void>;
export function clearEncryptedAuthStorage(dependencies?: {
  listRecordKeys?: () => Promise<IDBValidKey[]>;
  deleteRecord?: (key: IDBValidKey) => Promise<void>;
}): Promise<boolean>;
export function createEncryptedAuthStorage(dependencies?: unknown): {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export const encryptedAuthStorage: ReturnType<typeof createEncryptedAuthStorage>;
