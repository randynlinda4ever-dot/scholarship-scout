export type AuthCallbackLocation = {
  origin: string;
  pathname?: string;
};

export function getMagicLinkRedirectUrl(
  locationLike?: AuthCallbackLocation | null,
): string;
