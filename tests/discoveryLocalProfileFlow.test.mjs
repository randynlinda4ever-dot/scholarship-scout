import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const apiSource = readFileSync(new URL("../src/lib/scholarshipApi.ts", import.meta.url), "utf8");

test("live discovery receives the full local profile for browser-side relevance ranking", () => {
  assert.ok(
    appSource.includes("runLiveScholarshipDiscovery(\n        profile,\n        selectedDiscoveryCategories,\n      )"),
    "the discovery call must pass the full in-memory profile to the local ranking stage",
  );
});

test("the discovery loading message distinguishes local profile matching from transmitted fields", () => {
  assert.ok(appSource.includes(
    "Only your state, graduation year, and category choices are sent to the search service; additional profile details stay on this device for matching.",
  ));
});

test("the live discovery API still projects only state and graduation year to the public request", () => {
  assert.match(apiSource, /const safeProfile = pickLiveDiscoveryProfile\(profile\)/);
  assert.match(apiSource, /body:\s*\{\s*profile:\s*safeProfile,\s*categories\s*\}/);
  assert.match(apiSource, /rankAndDeduplicateLiveResults\(data\.results,\s*profile\)/);
});
