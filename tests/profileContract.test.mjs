import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/domain/types.ts", import.meta.url), "utf8");
const ranking = await readFile(new URL("../src/lib/discoveryPipeline.js", import.meta.url), "utf8");

test("the domain Profile type is the sole canonical contract used by the app", () => {
  assert.ok(app.includes("import type { Profile } from './domain/types.js';"));
  assert.ok(!app.includes("type Profile = {"));
  for (const field of [
    "country", "state", "county", "citizenship", "age", "school", "schoolCountry",
    "schoolState", "grade", "graduationYear", "plannedCollege", "plannedCollegeCountry",
    "plannedCollegeState", "plannedMajor", "collegeStatus", "gpa", "gpaType", "classRank",
    "rankDetails", "credits", "act", "sat", "apCourses", "dualCreditCourses",
    "academicHonors", "interests", "activities", "serviceHours", "service", "employment",
    "certifications", "languages", "firstGeneration", "district", "shhMembershipStatus",
    "spanishAchievementStatus", "nseMedalYears", "nseRegistered2027",
    "fourHMembershipStatus", "searchKeywords", "profileVersion",
  ]) assert.ok(domain.includes(field + ":"), "domain Profile misses " + field);
});

test("local result ranking consumes visible profile attributes rather than retired aliases", () => {
  for (const field of [
    "searchKeywords", "plannedMajor", "interests", "school", "academicHonors",
    "apCourses", "dualCreditCourses", "activities", "service", "employment",
    "languages", "certifications",
  ]) assert.ok(ranking.includes("profile." + field), "local result ranking does not use " + field);
  for (const retired of ["academicStrengths", "careerInterests", "awardsHonors"]) {
    assert.ok(!ranking.includes("profile." + retired), "retired Profile alias is still used: " + retired);
  }
});

test("legacy-only Profile controls are not rendered in the current My Profile page", () => {
  const page = app.slice(app.indexOf("{tab === 'Eligibility filters'"), app.indexOf("{tab === 'Application prep'"));
  for (const label of [
    "Texas Grant notation", "Graduation program, achievement level",
    "Long-term education/career goal", "Preferred college location",
    "Expected enrollment plan",
  ]) assert.ok(!page.includes(label), "legacy field is still visible: " + label);
  assert.ok(page.includes("School name (local result ordering)"));
});
