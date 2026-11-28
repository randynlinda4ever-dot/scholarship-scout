export type AccountVaultPasskey = {
  credentialId: string;
  prfSalt: string;
  wrappingKey: CryptoKey;
};
export function encodeBase64Url(value: ArrayBuffer | ArrayBufferView): string;
export function decodeBase64Url(value: string): Uint8Array;
export function registerAccountVaultPasskey(options: {
  userId: string;
  displayName?: string;
  credentials?: Credentials;
  rpId?: string;
}): Promise<AccountVaultPasskey>;
export function getAccountVaultPasskeyKey(options: {
  credentialId: string;
  prfSalt: string;
  credentials?: Credentials;
  rpId?: string;
}): Promise<CryptoKey>;
export function isAccountVaultPasskeyAvailable(credentials?: Credentials): boolean;
