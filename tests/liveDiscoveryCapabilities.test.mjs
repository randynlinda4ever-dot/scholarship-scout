import test from "node:test";
import assert from "node:assert/strict";
import {
  DEPLOYED_DISCOVERY_FUNCTION_VERSION,
  isLiveDiscoveryCategorySupported,
  getUnsupportedLiveDiscoveryCategories,
} from "../src/lib/liveDiscoveryCapabilities.js";

test("matches the expanded deployed scholarship-discover category allowlist", () => {
  assert.equal(DEPLOYED_DISCOVERY_FUNCTION_VERSION, 21);
  for (const category of [
    "local", "school_resources", "regional", "state", "academic", "humanities",
    "leadership", "community_service", "language", "employment", "arts",
    "incoming_college", "national", "general",
  ]) assert.equal(isLiveDiscoveryCategorySupported(category), true);
});

test("returns no unsupported categories for the current live search categories", () => {
  assert.deepEqual(
    getUnsupportedLiveDiscoveryCategories([
      "local", "school_resources", "arts", "leadership", "national", "general",
    ]),
    [],
  );
});

test("handles non-array and invalid category values safely", () => {
  assert.deepEqual(getUnsupportedLiveDiscoveryCategories(null), []);
  assert.deepEqual(getUnsupportedLiveDiscoveryCategories([
    "local", null, 42, "regional",
  ]), []);
});
