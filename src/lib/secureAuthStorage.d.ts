export const secureAuthStorage: {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
  clear(): Promise<void>;
};
export function destroySecureAuthStorage(): Promise<boolean>;
