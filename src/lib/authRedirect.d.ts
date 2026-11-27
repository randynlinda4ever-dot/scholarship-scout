export type AuthCallbackLocation = {
  origin: string;
  pathname?: string;
  search?: string;
  hash?: string;
};

export function getMagicLinkRedirectUrl(
  locationLike?: AuthCallbackLocation | null,
): string;

export function hasPendingAuthCallback(
  locationLike?: AuthCallbackLocation | null,
): boolean;

export function hasPendingAuthCallbackError(
  locationLike?: AuthCallbackLocation | null,
): boolean;
