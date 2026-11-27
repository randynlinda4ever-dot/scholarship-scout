import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const now = new Date("2026-11-13T12:00:00");
const profile = { state: "TX" };

test("sponsor-wide excerpts cannot make an unsupported criterion pass", () => {
  const assessment = assessEligibility({
    criteria: { state: "TX" },
    sourceUrl: "https://www.aatspshh.org/scholarships",
    sourceVerified: true,
    evidenceText: "Applicants must be Texas residents.",
  }, profile, now);

  const check = assessment.checks.find((item) => item.label === "State residency");
  assert.equal(check.outcome, "unknown");
  assert.equal(check.criterionKey, "state");
  assert.match(check.detail, /criterion-specific evidence/i);
  assert.deepEqual(check.evidence, { state: "unknown", excerpt: "", sourceUrl: "" });
});

test("criterion-specific evidence links only the matching criterion", () => {
  const assessment = assessEligibility({
    criteria: { state: "TX", district: "Example ISD" },
    sourceUrl: "https://www.aatspshh.org/scholarships",
    evidenceText: "General sponsor notes that may mention multiple rules.",
    criteriaEvidence: {
      state: {
        excerpt: "Applicants must be Texas residents.",
        sourceUrl: "https://aatspshh.org/rules#residency",
      },
    },
  }, profile, now);

  const state = assessment.checks.find((item) => item.label === "State residency");
  const district = assessment.checks.find((item) => item.label === "School district");
  assert.equal(state.outcome, "pass");
  assert.deepEqual(state.evidence, {
    state: "linked",
    excerpt: "Applicants must be Texas residents.",
    sourceUrl: "https://aatspshh.org/rules#residency",
  });
  assert.equal(district.outcome, "unknown");
  assert.deepEqual(district.evidence, { state: "unknown", excerpt: "", sourceUrl: "" });
  assert.equal(district.criterionKey, "district");
});

test("criterion-linked sponsor evidence supports Pass, Fail, and Unknown without changing provenance", () => {
  const scholarship = {
    criteria: { state: "TX" },
    sourceUrl: "https://www.aatspshh.org/scholarships",
    criteriaEvidence: {
      state: {
        excerpt: "Applicants must be Texas residents.",
        sourceUrl: "https://aatspshh.org/rules#residency",
      },
    },
  };
  const outcomes = [
    { profile: { state: "TX" }, expected: "pass" },
    { profile: { state: "CA" }, expected: "fail" },
    { profile: {}, expected: "unknown" },
  ];

  for (const { profile: candidate, expected } of outcomes) {
    const assessment = assessEligibility(scholarship, candidate, now);
    const check = assessment.checks.find((item) => item.label === "State residency");
    assert.equal(check.outcome, expected);
    assert.deepEqual(check.evidence, {
      state: "linked",
      excerpt: "Applicants must be Texas residents.",
      sourceUrl: "https://aatspshh.org/rules#residency",
    });
  }
});

test("criterion excerpts without a safe source URL remain unlinked", () => {
  for (const sourceUrl of [undefined, "javascript:alert(1)", "http://example.org/rules", "https://user:pass@example.org/rules", "https://localhost/rules"]) {
    const assessment = assessEligibility({
      criteria: { state: "TX" },
      sourceUrl: "https://www.aatspshh.org/scholarships",
      criteriaEvidence: { state: { excerpt: "Applicants must be Texas residents.", sourceUrl } },
    }, profile, now);
    const check = assessment.checks.find((item) => item.label === "State residency");
    assert.deepEqual(check.evidence, { state: "unknown", excerpt: "", sourceUrl: "" });
  }
});

test("records without criteriaEvidence never turn a profile mismatch into a definitive failure", () => {
  const assessment = assessEligibility({
    criteria: { state: "CA" },
    sourceUrl: "https://www.aatspshh.org/scholarships",
  }, profile, now);
  const check = assessment.checks.find((item) => item.label === "State residency");
  assert.equal(check.outcome, "unknown");
  assert.deepEqual(check.evidence, { state: "unknown", excerpt: "", sourceUrl: "" });
});

test("rejects criterion evidence from a different recognized sponsor domain", () => {
  const assessment = assessEligibility({
    criteria: { state: "TX" },
    sourceUrl: "https://www.aatspshh.org/scholarships",
    criteriaEvidence: {
      state: {
        excerpt: "Applicants must be Texas residents.",
        sourceUrl: "https://nationalspanishexam.org/rules",
      },
    },
  }, profile, now);
  const check = assessment.checks.find((item) => item.label === "State residency");
  assert.equal(check.outcome, "unknown");
  assert.deepEqual(check.evidence, { state: "unknown", excerpt: "", sourceUrl: "" });
});
