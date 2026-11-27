import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COUNTRY_OPTIONS,
  US_STATE_OPTIONS,
  PROFILE_CITIZENSHIP_OPTIONS,
  countryNameForCode,
  isCountryCode,
  normalizeUsStateName,
} from "../src/lib/profileLocations.js";
import { validateProfileChanges } from "../src/lib/profileValidation.js";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const profile = app.slice(app.indexOf("{tab === 'Eligibility filters'"), app.indexOf("{tab === 'Application prep'"));

test("country choices contain the complete unique ISO 3166-1 alpha-2 set", () => {
  const codes = COUNTRY_OPTIONS.map(([code]) => code);
  assert.equal(codes.length, 249);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => /^[A-Z]{2}$/.test(code)));
  assert.equal(countryNameForCode("US"), "United States");
  assert.equal(isCountryCode("US"), true);
  assert.equal(isCountryCode("ZZ"), false);
});

test("US state choices contain states, DC, and the inhabited territories supported by this app", () => {
  const codes = US_STATE_OPTIONS.map(([code]) => code);
  const names = US_STATE_OPTIONS.map(([, name]) => name);
  assert.equal(codes.length, 56);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(new Set(names).size, names.length);
  assert.equal(normalizeUsStateName("TX"), "Texas");
  assert.equal(normalizeUsStateName("texas"), "Texas");
  assert.equal(normalizeUsStateName("Atlantis"), "");
});

test("citizenship choices match the categories understood by eligibility matching", () => {
  assert.deepEqual(PROFILE_CITIZENSHIP_OPTIONS.map(([value]) => value), [
    "",
    "U.S. citizen",
    "U.S. national",
    "Eligible noncitizen",
    "Other or unsure",
  ]);
});

test("profile validation rejects unknown countries and unsupported regional values", () => {
  assert.equal(validateProfileChanges({ country: "" }, { country: "ZZ" }).valid, false);
  assert.equal(validateProfileChanges({ country: "" }, { country: "US" }).valid, true);
  assert.equal(validateProfileChanges({ country: "US", state: "" }, { country: "US", state: "Atlantis" }).valid, false);
  assert.equal(validateProfileChanges({ country: "US", state: "" }, { country: "US", state: "Texas" }).valid, true);
  assert.equal(validateProfileChanges({ country: "US", state: "Texas" }, { country: "CA", state: "" }).valid, true);
  assert.equal(validateProfileChanges({ country: "US", state: "" }, { country: "CA", state: "Texas" }).valid, false);
});

test("country validation covers residence, school, and intended-college locations", () => {
  for (const field of ["country", "schoolCountry", "plannedCollegeCountry"]) {
    assert.equal(validateProfileChanges({ [field]: "US" }, { [field]: "GB" }).valid, true);
    assert.equal(validateProfileChanges({ [field]: "US" }, { [field]: "XX" }).valid, false);
  }
  for (const field of ["schoolState", "plannedCollegeState"]) {
    assert.equal(validateProfileChanges({ schoolCountry: "US", plannedCollegeCountry: "US", [field]: "" }, { schoolCountry: "US", plannedCollegeCountry: "US", [field]: "Texas" }).valid, true);
    assert.equal(validateProfileChanges({ schoolCountry: "US", plannedCollegeCountry: "US", [field]: "" }, { schoolCountry: "US", plannedCollegeCountry: "US", [field]: "Atlantis" }).valid, false);
  }
});

test("citizenship changes must use supported non-free-text categories", () => {
  assert.equal(validateProfileChanges({ citizenship: "" }, { citizenship: "U.S. citizen" }).valid, true);
  assert.equal(validateProfileChanges({ citizenship: "" }, { citizenship: "Eligible noncitizen" }).valid, true);
  assert.equal(validateProfileChanges({ citizenship: "" }, { citizenship: "citizen-ish" }).valid, false);
});

test("profile removes stale application and resume labels and unused duplicate goal field", () => {
  assert.doesNotMatch(profile, /<span className="source-tag">APPLICATION<\/span>/);
  assert.doesNotMatch(profile, /RÉSUMÉ|RESUME/i);
  assert.doesNotMatch(profile, /degreeGoal|Long-term education\/career goal/);
});

test("profile uses controlled country and state options for all three distinct location contexts", () => {
  for (const label of [
    "Country of residence",
    "Country where your school is located",
    "Country where your intended college is located",
    "State of residence",
    "State where your school is located",
    "State where your intended college is located",
  ]) {
    assert.ok(profile.includes(label), `missing location control: ${label}`);
  }
  assert.match(profile, /COUNTRY_OPTIONS/);
  assert.match(profile, /US_STATE_OPTIONS/);
  assert.match(profile, /PROFILE_CITIZENSHIP_OPTIONS/);
});
