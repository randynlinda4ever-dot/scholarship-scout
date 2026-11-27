import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const scholarship = (criteria) => ({
  criteria,
  sourceUrl: "https://www.aatspshh.org/scholarships/rules",
  sourceVerified: true,
  evidenceText: "Official sponsor requirements.",
  criteriaEvidence: Object.fromEntries(Object.keys(criteria).map((key) => [key, {
    excerpt: `Official sponsor rule for ${key}.`,
    sourceUrl: `https://aatspshh.org/scholarships/rules#${key}`,
  }])),
});

const check = (criteria, profile, label) => assessEligibility(
  scholarship(criteria),
  profile,
  new Date("2026-11-12T12:00:00"),
).checks.find((item) => item.label === label);

test("keeps an ACT-or-SAT requirement unknown when one untested alternative could still qualify", () => {
  const result = check(
    { minActOrSat: { act: 28, sat: 1300 } },
    { act: "27", sat: "" },
    "ACT or SAT threshold",
  );

  assert.equal(result?.outcome, "unknown");
  assert.match(result?.detail ?? "", /alternative|SAT|ACT/i);
});

test("keeps an ACT-or-SAT requirement unknown when the recorded score is below threshold and the other score is missing", () => {
  const result = check(
    { minActOrSat: { act: 28, sat: 1300 } },
    { act: "", sat: "1290" },
    "ACT or SAT threshold",
  );

  assert.equal(result?.outcome, "unknown");
});

test("fails an ACT-or-SAT requirement only when both recorded alternatives are below their thresholds", () => {
  const result = check(
    { minActOrSat: { act: 28, sat: 1300 } },
    { act: "27", sat: "1290" },
    "ACT or SAT threshold",
  );

  assert.equal(result?.outcome, "fail");
});

test("does not infer eligible-noncitizen status from a generic non-citizen statement", () => {
  const result = check(
    { citizenship: "eligible-noncitizen" },
    { citizenship: "Not a U.S. citizen" },
    "Eligible noncitizen status",
  );

  assert.equal(result?.outcome, "unknown");
});

test("does not infer eligible-noncitizen status from an immigration category that has not been reviewed", () => {
  const result = check(
    { citizenship: "eligible-noncitizen" },
    { citizenship: "Permanent resident" },
    "Eligible noncitizen status",
  );

  assert.equal(result?.outcome, "unknown");
});

test("does not treat a U.S. citizen as an eligible noncitizen", () => {
  const result = check(
    { citizenship: "eligible-noncitizen" },
    { citizenship: "U.S. citizen or U.S. national" },
    "Eligible noncitizen status",
  );

  assert.equal(result?.outcome, "fail");
});

test("accepts numeric twelfth-grade profile entries for high-school senior rules", () => {
  const result = check(
    { educationLevel: "high-school-senior" },
    { grade: "12th grade" },
    "Education level",
  );

  assert.equal(result?.outcome, "pass");
});

test("accepts numeric grade-level entries for current high-school-student rules", () => {
  const result = check(
    { educationLevel: "high-school-student" },
    { grade: "Grade 11" },
    "Education level",
  );

  assert.equal(result?.outcome, "pass");
});

test("does not treat a numeric grade 12 entry as current undergraduate enrollment", () => {
  const result = check(
    { educationLevel: "undergraduate" },
    { grade: "Grade 12" },
    "Education level",
  );

  assert.equal(result?.outcome, "fail");
});

test("keeps a bare senior label unknown for high-school senior criteria", () => {
  const result = check(
    { educationLevel: "high-school-senior" },
    { grade: "Senior" },
    "Education level",
  );

  assert.equal(result?.outcome, "unknown");
});

test("does not equate a graduating class year with twelfth grade", () => {
  const result = check(
    { educationLevel: "high-school-senior" },
    { grade: "Class of 2027" },
    "Education level",
  );

  assert.equal(result?.outcome, "unknown");
});

test("keeps a bare freshman label unknown for undergraduate criteria", () => {
  const result = check(
    { educationLevel: "undergraduate" },
    { grade: "Freshman" },
    "Education level",
  );

  assert.equal(result?.outcome, "unknown");
});

test("accepts an explicitly college freshman as an undergraduate", () => {
  const result = check(
    { educationLevel: "undergraduate" },
    { grade: "College freshman" },
    "Education level",
  );

  assert.equal(result?.outcome, "pass");
});

test("rejects an explicitly college senior for high-school senior criteria", () => {
  const result = check(
    { educationLevel: "high-school-senior" },
    { grade: "College senior" },
    "Education level",
  );

  assert.equal(result?.outcome, "fail");
});

test("does not interpret a college grade number as a high-school grade", () => {
  const result = check(
    { educationLevel: "high-school-senior" },
    { grade: "College grade 12" },
    "Education level",
  );

  assert.equal(result?.outcome, "fail");
});

test("keeps a bare junior label unknown for current high-school-student criteria", () => {
  const result = check(
    { educationLevel: "high-school-student" },
    { grade: "Junior" },
    "Education level",
  );

  assert.equal(result?.outcome, "unknown");
});
