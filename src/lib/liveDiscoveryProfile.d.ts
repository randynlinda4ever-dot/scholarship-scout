export type LiveDiscoveryPayload = {
  state: string;
  graduationYear: string;
  categories: string[];
};

export function pickLiveDiscoveryProfile(profile?: Record<string, unknown>): {
  state: string;
  graduationYear: string;
};

export function buildLiveDiscoveryPayload(
  profile: Record<string, unknown>,
  categories: string[],
): LiveDiscoveryPayload;
