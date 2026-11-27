export type DiscoveryClientIdentityStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type DiscoveryClientIdentityOptions = {
  storage?: DiscoveryClientIdentityStorage | null;
  randomUUID?: () => string;
};

export function createDiscoveryClientIdentity(
  options?: DiscoveryClientIdentityOptions,
): () => string;

export const getDiscoveryClientId: () => string;
