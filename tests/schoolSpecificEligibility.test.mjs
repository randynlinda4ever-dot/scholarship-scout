import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const scholarship = (criteria) => ({
  criteria,
  sourceUrl: "https://www.aatspshh.org/scholarships/synthetic-school-award",
  sourceVerified: true,
  evidenceText: "Synthetic sponsor rules for school-specific eligibility.",
  criteriaEvidence: Object.fromEntries(Object.keys(criteria).map((key) => [key, {
    excerpt: `Synthetic official sponsor rule for ${key}.`,
    sourceUrl: `https://www.aatspshh.org/scholarships/synthetic-school-award#${key}`,
  }])),
});

const assess = (criteria, profile) => assessEligibility(
  scholarship(criteria),
  profile,
  new Date("2026-11-24T12:00:00"),
);

test("missing current-school location remains unknown rather than rejecting on residence or college location", () => {
  const result = assess(
    { schoolState: "Synthetic Required State" },
    {
      state: "Synthetic Different Residence",
      plannedCollegeState: "Synthetic Different College State",
    },
  );

  assert.equal(result.checks.find((item) => item.label === "School location state")?.outcome, "unknown");
  assert.equal(result.failed, 0);
  assert.equal(result.status, "Needs information");
});

test("missing school district remains unknown even when a school name is present", () => {
  const result = assess(
    { district: "Synthetic Required District" },
    { school: "Synthetic Example High School" },
  );

  assert.equal(result.checks.find((item) => item.label === "School district")?.outcome, "unknown");
  assert.equal(result.failed, 0);
  assert.equal(result.status, "Needs information");
});

test("missing school location and district do not inherit unrelated residence or planned-college values", () => {
  const result = assess(
    {
      schoolState: "Synthetic Required School State",
      district: "Synthetic Required District",
    },
    {
      state: "Synthetic Other Residence",
      plannedCollegeState: "Synthetic Other College State",
      plannedCollege: "Synthetic Other University",
    },
  );

  assert.equal(result.checks.find((item) => item.label === "School location state")?.outcome, "unknown");
  assert.equal(result.checks.find((item) => item.label === "School district")?.outcome, "unknown");
  assert.equal(result.failed, 0);
  assert.equal(result.status, "Needs information");
});
