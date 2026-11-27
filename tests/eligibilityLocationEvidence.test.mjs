import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const scholarship = (criteria) => ({
  criteria,
  sourceUrl: "https://www.aatspshh.org/scholarships/rules",
  sourceVerified: true,
  criteriaEvidence: Object.fromEntries(Object.keys(criteria).map((key) => [key, {
    excerpt: `Official sponsor rule for ${key}.`,
    sourceUrl: `https://www.aatspshh.org/scholarships/rules#${key}`,
  }])),
});

const assess = (criteria, profile) => assessEligibility(
  scholarship(criteria),
  profile,
  new Date("2026-11-24T12:00:00"),
);

test("state residency compares only the applicant residence field", () => {
  const result = assess(
    { state: "Texas" },
    { state: "Texas", schoolState: "Oklahoma", plannedCollegeState: "New Mexico" },
  );
  assert.equal(result.checks.find((item) => item.label === "State residency")?.outcome, "pass");
});

test("school location state does not inherit applicant residence or college destination", () => {
  const result = assess(
    { schoolState: "Oklahoma" },
    { state: "Texas", schoolState: "Oklahoma", plannedCollegeState: "New Mexico" },
  );
  assert.equal(result.checks.find((item) => item.label === "School location state")?.outcome, "pass");
});

test("intended college location state compares only the planned college state", () => {
  const result = assess(
    { collegeState: "New Mexico" },
    { state: "Texas", schoolState: "Oklahoma", plannedCollegeState: "New Mexico" },
  );
  assert.equal(result.checks.find((item) => item.label === "Intended college location state")?.outcome, "pass");
});

test("missing school or college location remains unknown rather than failing", () => {
  const result = assess(
    { schoolState: "Oklahoma", collegeState: "New Mexico" },
    { state: "Texas" },
  );
  assert.equal(result.checks.find((item) => item.label === "School location state")?.outcome, "unknown");
  assert.equal(result.checks.find((item) => item.label === "Intended college location state")?.outcome, "unknown");
});
