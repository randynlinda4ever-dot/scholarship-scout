import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const verifiedScholarship = (criteria) => ({
  criteria,
  sourceUrl: "https://www.aatspshh.org/scholarships/example",
  sourceVerified: true,
  evidenceText: "Official sponsor eligibility rules.",
  criteriaEvidence: Object.fromEntries(Object.keys(criteria).map((key) => [key, {
    excerpt: `Official sponsor rule for ${key}.`,
    sourceUrl: `https://aatspshh.org/scholarships/example#${key}`,
  }])),
});

const emptyProfile = {};

const missingRequirementCases = [
  ["state residency", { state: "Texas" }, "State residency"],
  ["school district", { district: "Example District" }, "School district"],
  ["high-school senior status", { educationLevel: "high-school-senior" }, "Education level"],
  ["graduation year", { graduationYear: 2027 }, "Graduation year"],
  ["field of study", { majorKeywords: ["environmental science"] }, "Field of study"],
  ["college destination", { institution: "Example University" }, "College destination"],
];

for (const [description, criteria, label] of missingRequirementCases) {
  test(`treats missing ${description} as unknown instead of a failed requirement`, () => {
    const assessment = assessEligibility(
      verifiedScholarship(criteria),
      emptyProfile,
      new Date("2026-11-11T12:00:00"),
    );
    const check = assessment.checks.find((item) => item.label === label);

    assert.equal(check?.outcome, "unknown");
    assert.equal(assessment.status, "Needs information");
  });
}

test("does not count an explicit non-citizen profile value as satisfying a US-citizen rule", () => {
  const assessment = assessEligibility(
    verifiedScholarship({ citizenship: "us-citizen" }),
    { citizenship: "Not a U.S. citizen" },
    new Date("2026-11-11T12:00:00"),
  );

  assert.equal(assessment.checks.find((item) => item.label === "Citizenship")?.outcome, "fail");
  assert.equal(assessment.status, "Ineligible");
});
