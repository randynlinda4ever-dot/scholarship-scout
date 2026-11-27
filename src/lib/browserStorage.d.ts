export type JsonWriteStorage = {
  setItem(key: string, value: string): void;
};

export type JsonBatchStorage = JsonWriteStorage & {
  getItem(key: string): string | null;
  removeItem(key: string): void;
};

export type JsonStorageBatchResult = {
  ok: boolean;
  rollbackSucceeded: boolean;
};

export function writeJsonStorage(
  key: string,
  value: unknown,
  resolveStorage?: () => JsonWriteStorage | null | undefined,
): boolean;

export function writeJsonStorageBatch(
  entries: Record<string, unknown>,
  resolveStorage?: () => JsonBatchStorage | null | undefined,
): JsonStorageBatchResult;
