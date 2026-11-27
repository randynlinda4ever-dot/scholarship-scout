import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const scholarship = {
  criteria: { requiresFinancialNeed: true },
  sourceUrl: "https://www.aatspshh.org/scholarships/synthetic-financial-need",
  sourceAuthority: "official-program",
  sourceVerified: true,
  provider: "Synthetic Example Sponsor",
  award: "$1,000",
  deadline: "2027-05-03",
  lastCheckedDate: "2026-11-24",
  evidenceText: "Applicants must demonstrate financial need.",
  criteriaEvidence: {
    requiresFinancialNeed: {
      excerpt: "Applicants must demonstrate financial need.",
      sourceUrl: "https://www.aatspshh.org/scholarships/synthetic-financial-need#need",
    },
  },
};

const baseProfile = {
  name: "Synthetic Student",
  state: "Example State",
  grade: "Synthetic high-school senior",
  graduationYear: "2027",
};

function financialNeedCheck(profile) {
  const assessment = assessEligibility(scholarship, profile, new Date("2026-11-24T12:00:00"));
  const check = assessment.checks.find((item) => item.label === "Financial need");
  assert.ok(check, "financial-need criterion should be represented explicitly");
  return { assessment, check };
}

test("missing financial information remains Unknown rather than passing or failing", () => {
  const { assessment, check } = financialNeedCheck(baseProfile);

  assert.equal(check.outcome, "unknown");
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.passed, 0);
  assert.equal(assessment.failed, 0);
});

test("academic achievement and service history cannot substitute for financial-need evidence", () => {
  const { assessment, check } = financialNeedCheck({
    ...baseProfile,
    gpa: "4.0",
    classRank: "1 of 100 — top 1%",
    act: "36",
    serviceHours: "200",
    activities: "Synthetic academic and service activities",
  });

  assert.equal(check.outcome, "unknown");
  assert.equal(assessment.status, "Needs information");
});

test("an unsupported self-reported financialNeed field is not treated as sponsor evidence", () => {
  const { assessment, check } = financialNeedCheck({
    ...baseProfile,
    financialNeed: "Yes — synthetic self-report; sponsor documentation not reviewed",
  });

  assert.equal(check.outcome, "unknown");
  assert.match(check.detail, /cannot be inferred/i);
  assert.equal(assessment.status, "Needs information");
});
