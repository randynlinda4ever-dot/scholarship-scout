/**
 * Capabilities confirmed from the current scholarship-discover Edge Function.
 * Keep this separate from source-only capabilities.
 */
export const DEPLOYED_DISCOVERY_FUNCTION_VERSION = 21;

const DEPLOYED_CATEGORIES = new Set([
  "local",
  "school_resources",
  "regional",
  "state",
  "academic",
  "humanities",
  "leadership",
  "community_service",
  "language",
  "employment",
  "arts",
  "incoming_college",
  "national",
  "general",
]);

export function isLiveDiscoveryCategorySupported(category) {
  return typeof category === "string" && DEPLOYED_CATEGORIES.has(category);
}

export function getUnsupportedLiveDiscoveryCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return [...new Set(categories.filter(
    (category) => typeof category === "string" &&
      !isLiveDiscoveryCategorySupported(category),
  ))];
}
