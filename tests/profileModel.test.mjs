import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_PROFILE_VERSION, LEGACY_PROFILE_KEYS, mergeProfileWithDefaults } from "../src/lib/profileModel.js";

const defaults = {
  country: "",
  state: "",
  graduationYear: "",
  plannedMajor: "",
  profileVersion: CURRENT_PROFILE_VERSION,
};

test("profile migration preserves current values and fills newly introduced fields", () => {
  const merged = mergeProfileWithDefaults({
    state: "Texas",
    graduationYear: "2027",
    plannedMajor: "Anthropology",
    oldOptionalValue: "remove me",
  }, defaults);

  assert.equal(merged.state, "Texas");
  assert.equal(merged.graduationYear, "2027");
  assert.equal(merged.plannedMajor, "Anthropology");
  assert.equal(merged.country, "");
  assert.equal(merged.profileVersion, CURRENT_PROFILE_VERSION);
  assert.equal(Object.hasOwn(merged, "oldOptionalValue"), false);
});

test("profile migration discards legacy profile aliases rather than carrying them into new backups", () => {
  const legacy = Object.fromEntries(LEGACY_PROFILE_KEYS.map((key) => [key, "legacy content"]));
  const merged = mergeProfileWithDefaults({
    country: "US",
    state: "Texas",
    ...legacy,
  }, defaults);

  assert.equal(merged.country, "US");
  assert.equal(merged.state, "Texas");
  for (const key of LEGACY_PROFILE_KEYS) assert.equal(Object.hasOwn(merged, key), false);
});

test("profile migration ignores malformed non-string values and unknown keys", () => {
  const merged = mergeProfileWithDefaults({
    state: 123,
    graduationYear: null,
    plannedMajor: "History",
    extra: { secret: "not a profile field" },
  }, defaults);

  assert.equal(merged.state, "");
  assert.equal(merged.graduationYear, "");
  assert.equal(merged.plannedMajor, "History");
  assert.equal(Object.hasOwn(merged, "extra"), false);
});
