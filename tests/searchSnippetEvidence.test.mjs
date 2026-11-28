import test from "node:test";
import assert from "node:assert/strict";
import {
  extractScholarshipSearchSignals,
  getScholarshipTitleSpecificity,
  isScholarshipDirectoryLandingPage,
  matchScholarshipEvidence,
  parseStrictSearchDate,
} from "../supabase/functions/_shared/search-snippet-evidence.mjs";

test("parses full, abbreviated, ordinal, ISO, and US numeric deadline dates", () => {
  for (const [input, expected] of [
    ["December 1, 2026", "2026-12-01"],
    ["Dec 15th, 2026", "2026-12-15"],
    ["Sept. 4th, 2027", "2027-09-04"],
    ["2026-12-15", "2026-12-15"],
    ["12/15/2026", "2026-12-15"],
  ]) assert.equal(parseStrictSearchDate(input), expected, input);
});

test("rejects impossible, unsupported, or ambiguous dates", () => {
  for (const input of ["February 30, 2026", "02/30/2026", "04/05/2027", "15/12/2026", "May 1, 27", "2026-02-30", "Dec 15, 2026 and Jan 2, 2027"]) {
    assert.equal(parseStrictSearchDate(input), null, input);
  }
});

test("keeps decimal award amounts intact when splitting snippets", () => {
  const signals = extractScholarshipSearchSignals(
    "The North Star Community Scholarship awards $2,500.50 each year. Apply by May 1st, 2027."
  );
  assert.equal(signals.awardText, "The North Star Community Scholarship awards $2,500.50 each year.");
  assert.equal(signals.deadline, "2027-05-01");
});

test("matches a named scholarship plus adjacent award and deadline details", () => {
  const value = "The North Star Community Scholarship supports graduating seniors. Awards range from $2,500 to $5,000. Applications close on Dec 15th, 2026.";
  const matched = matchScholarshipEvidence("North Star Community Scholarship", value);
  const signals = extractScholarshipSearchSignals(matched);
  assert.match(matched, /Awards range from \$2,500 to \$5,000/);
  assert.equal(signals.deadline, "2026-12-15");
});

test("does not attach evidence belonging to a competing named opportunity", () => {
  const value = "The North Star Community Scholarship supports seniors. Blue River Essay Contest offers a $4,000 award. The Blue River Essay Contest deadline is December 1, 2026.";
  const matched = matchScholarshipEvidence("North Star Community Scholarship", value);
  assert.doesNotMatch(matched, /Blue River Essay Contest/);
  assert.equal(extractScholarshipSearchSignals(matched).awardText, null);
  assert.equal(extractScholarshipSearchSignals(matched).deadline, null);
});

test("dedup title specificity favors a named program over generic labels", () => {
  assert.ok(getScholarshipTitleSpecificity("North Star Community Scholarship") >
    getScholarshipTitleSpecificity("Scholarships for Students"));
});

test("filters directory pages while retaining a named scholarship beneath an audience route", () => {
  assert.equal(isScholarshipDirectoryLandingPage(
    "https://sponsor.example/scholarships/for-high-school-seniors",
    "Scholarships for High School Seniors",
    "Browse scholarships for high school seniors."
  ), true);
  assert.equal(isScholarshipDirectoryLandingPage(
    "https://sponsor.example/texas/top-scholarships",
    "Top 30 Scholarships for Texas Students",
    "Compare scholarship opportunities."
  ), true);
  assert.equal(isScholarshipDirectoryLandingPage(
    "https://sponsor.example/scholarships/for-high-school-seniors/north-star-community",
    "North Star Community Scholarship",
    "The North Star Community Scholarship awards $3,000."
  ), false);
});
