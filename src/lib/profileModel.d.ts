export const CURRENT_PROFILE_VERSION: string;
export const LEGACY_PROFILE_KEYS: readonly string[];
export function mergeProfileWithDefaults<T extends Record<string, string>>(
  saved: unknown,
  defaults: T,
  profileVersion?: string,
): T;
