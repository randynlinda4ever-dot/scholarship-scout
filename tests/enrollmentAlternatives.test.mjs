import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";
import { buildCloudScholarshipRow, mapCloudScholarship } from "../src/lib/cloudMapping.js";

const scholarship = (criteria) => ({
  criteria,
  sourceUrl: "https://www.aatspshh.org/scholarships/enrollment-rules",
  sourceVerified: true,
  evidenceText: "Synthetic official sponsor enrollment rules.",
  criteriaEvidence: Object.fromEntries(Object.keys(criteria).map((key) => [key, {
    excerpt: `Synthetic sponsor rule for ${key}.`,
    sourceUrl: `https://www.aatspshh.org/scholarships/enrollment-rules#${key}`,
  }])),
});

const enrollmentCheck = (criteria, profile) => assessEligibility(
  scholarship(criteria),
  profile,
  new Date("2026-11-24T12:00:00"),
).checks.find((item) => item.label === "Enrollment status alternatives");

test("accepts explicitly confirmed full-time enrollment as one allowed alternative", () => {
  const result = enrollmentCheck(
    { enrollmentStatuses: ["full-time", "incoming"] },
    { grade: "College freshman", collegeStatus: "Full-time confirmed" },
  );
  assert.equal(result?.outcome, "pass");
});

test("accepts explicitly confirmed part-time enrollment as an alternative to full-time", () => {
  const result = enrollmentCheck(
    { enrollmentStatuses: ["full-time", "part-time"] },
    { grade: "College sophomore", collegeStatus: "Part-time confirmed" },
  );
  assert.equal(result?.outcome, "pass");
});

test("accepts an incoming college plan for a high-school senior without treating it as current college enrollment", () => {
  const result = enrollmentCheck(
    { enrollmentStatuses: ["incoming", "full-time"] },
    { grade: "Grade 12", collegeStatus: "College enrollment planned" },
  );
  assert.equal(result?.outcome, "pass");
});

test("accepts a current high-school or college student through the current-student alternative", () => {
  const result = enrollmentCheck(
    { enrollmentStatuses: ["incoming", "current-student"] },
    { grade: "Grade 11", collegeStatus: "" },
  );
  assert.equal(result?.outcome, "pass");
});

test("keeps enrollment alternatives unknown when no route is evidenced and at least one could still qualify", () => {
  const result = enrollmentCheck(
    { enrollmentStatuses: ["full-time", "part-time", "incoming"] },
    { grade: "Grade 12", collegeStatus: "" },
  );
  assert.equal(result?.outcome, "unknown");
});

test("fails only when the profile explicitly rules out every enrollment alternative", () => {
  const result = enrollmentCheck(
    { enrollmentStatuses: ["full-time", "part-time", "incoming"] },
    { grade: "College sophomore", collegeStatus: "Not full-time; not part-time; not incoming" },
  );
  assert.equal(result?.outcome, "fail");
});

test("does not let a generic confirmed status satisfy the legacy full-time-only rule", () => {
  const result = assessEligibility(
    scholarship({ requiresFullTimeEnrollment: true }),
    { collegeStatus: "Confirmed" },
    new Date("2026-11-24T12:00:00"),
  ).checks.find((item) => item.label === "Full-time enrollment");
  assert.equal(result?.outcome, "unknown");
});

test("preserves enrollment alternatives through the existing cloud criteria mapping", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Enrollment Award",
    provider: "Synthetic Sponsor",
    sourceUrl: "https://www.aatspshh.org/enrollment",
    criteria: { enrollmentStatuses: ["full-time", "part-time", "incoming", "current-student"] },
    criteriaEvidence: {
      enrollmentStatuses: {
        excerpt: "Full-time, part-time, incoming, or current students may apply.",
        sourceUrl: "https://www.aatspshh.org/enrollment#status",
      },
    },
  }, "synthetic-owner");

  const reloaded = mapCloudScholarship({ ...row, id: "synthetic-enrollment-award" });
  assert.deepEqual(reloaded.extracted_rules.criteria.enrollmentStatuses, [
    "full-time", "part-time", "incoming", "current-student",
  ]);
});
