import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeEligibilityAssessment } from "../src/lib/eligibilitySummary.js";

test("groups passed, failed, and unknown rules without collapsing the outcomes", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Needs information",
    checks: [
      { label: "State residency", outcome: "pass", detail: "State matches." },
      { label: "Minimum GPA", outcome: "fail", detail: "Below the threshold." },
      { label: "Financial need", outcome: "unknown", detail: "Not documented." },
    ],
  });

  assert.deepEqual(summary.passed.map((item) => item.label), ["State residency"]);
  assert.deepEqual(summary.failed.map((item) => item.label), ["Minimum GPA"]);
  assert.deepEqual(summary.unknown.map((item) => item.label), ["Financial need"]);
  assert.equal(summary.status, "Ineligible");
});

test("does not claim eligibility when all currently recorded checks are unknown", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Needs information",
    checks: [{ label: "Membership", outcome: "unknown", detail: "Sponsor confirmation needed." }],
  });

  assert.equal(summary.passed.length, 0);
  assert.equal(summary.unknown.length, 1);
  assert.equal(summary.headline, "More information needed");
});

test("reports all recorded checks passing without promising an award", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Eligible",
    checks: [{ label: "Graduation year", outcome: "pass", detail: "Matches." }],
  });

  assert.equal(summary.headline, "All recorded requirements pass");
  assert.match(summary.caveat, /not an award guarantee/i);
});

test("handles a missing or malformed assessment safely", () => {
  const summary = summarizeEligibilityAssessment({ checks: null });
  assert.deepEqual(summary.passed, []);
  assert.deepEqual(summary.failed, []);
  assert.deepEqual(summary.unknown, []);
  assert.equal(summary.headline, "No structured checks available");
});

test("an unknown criterion overrides an inconsistent upstream Eligible status", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Eligible",
    checks: [
      { label: "State residency", outcome: "pass" },
      { label: "Financial need", outcome: "unknown", detail: "Sponsor confirmation required." },
    ],
  });

  assert.equal(summary.status, "Needs information");
  assert.equal(summary.headline, "More information needed");
  assert.equal(summary.passed.length, 1);
  assert.equal(summary.unknown.length, 1);
  assert.match(summary.caveat, /not an award guarantee/i);
});

test("an Eligible status with no structured checks is downgraded to Needs information", () => {
  const summary = summarizeEligibilityAssessment({ status: "Eligible", checks: [] });
  assert.equal(summary.status, "Needs information");
  assert.equal(summary.headline, "More information needed");
});

test("a confirmed failure cannot be presented as Eligible", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Eligible",
    checks: [{ label: "Minimum GPA", outcome: "fail" }],
  });
  assert.equal(summary.status, "Ineligible");
});

test("unverified source matches remain distinct from verified eligibility and award outcomes", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Rules match — source unverified",
    checks: [{ label: "Graduation year", outcome: "pass" }],
  });
  assert.equal(summary.status, "Rules match — source unverified");
  assert.match(summary.caveat, /not an award guarantee/i);
});

test("discovery cards, tracker status, and detail banner use the defensive eligibility summary", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /function CandidateCard[\s\S]*?const summary = summarizeEligibilityAssessment\(assessment\)/);
  assert.match(app, /<StatusPill status=\{summary\.status as Status\}\/>/);
  assert.match(app, /<StatusPill status=\{selectedSummary!\.status as Status\}\/>/);
  assert.match(app, /summarizeEligibilityAssessment\(assessments\.get\(item\.id\)\)\.status as Status/);
  assert.match(app, /\{summary\.caveat\}/);
});

test("preferred failures and unknowns are displayed separately without changing eligibility status", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Rules match — source unverified",
    checks: [
      { label: "State residency", outcome: "pass", importance: "mandatory" },
      { label: "Minimum GPA", outcome: "fail", importance: "preferred" },
      { label: "ACT minimum", outcome: "unknown", importance: "preferred" },
    ],
  });

  assert.equal(summary.status, "Rules match — source unverified");
  assert.deepEqual(summary.passed.map((item) => item.label), ["State residency"]);
  assert.deepEqual(summary.failed, []);
  assert.deepEqual(summary.unknown, []);
  assert.deepEqual(summary.preferred.map((item) => item.label), ["Minimum GPA", "ACT minimum"]);
});

test("preferred-only summary cannot claim eligibility without a mandatory rule", () => {
  const summary = summarizeEligibilityAssessment({
    status: "Eligible",
    checks: [{ label: "Preferred GPA", outcome: "pass", importance: "preferred" }],
  });

  assert.equal(summary.status, "Needs information");
  assert.equal(summary.headline, "More information needed");
  assert.deepEqual(summary.preferred.map((item) => item.label), ["Preferred GPA"]);
});

test("repeated summaries preserve identical pass, fail, and unknown explanations", () => {
  const assessment = {
    status: "Needs information",
    checks: [
      { label: "Residency", outcome: "pass", detail: "Recorded state matches the sponsor rule." },
      { label: "Minimum GPA", outcome: "fail", detail: "Recorded GPA is below the sponsor minimum." },
      { label: "Financial need", outcome: "unknown", detail: "No qualifying financial-need evidence is recorded." },
    ],
  };

  const first = summarizeEligibilityAssessment(assessment);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.deepEqual(summarizeEligibilityAssessment(assessment), first);
  }
  assert.deepEqual(first.passed.map(({ label, detail }) => ({ label, detail })), [
    { label: "Residency", detail: "Recorded state matches the sponsor rule." },
  ]);
  assert.deepEqual(first.failed.map(({ label, detail }) => ({ label, detail })), [
    { label: "Minimum GPA", detail: "Recorded GPA is below the sponsor minimum." },
  ]);
  assert.deepEqual(first.unknown.map(({ label, detail }) => ({ label, detail })), [
    { label: "Financial need", detail: "No qualifying financial-need evidence is recorded." },
  ]);
});

test("equivalent synthetic assessments produce deeply identical summaries", () => {
  const assessment = {
    status: "Eligible",
    checks: [
      { label: "Graduation year", outcome: "pass", detail: "Expected year matches." },
      { label: "School district", outcome: "unknown", detail: "District has not been provided." },
    ],
  };
  const equivalentAssessment = structuredClone(assessment);

  assert.deepEqual(
    summarizeEligibilityAssessment(equivalentAssessment),
    summarizeEligibilityAssessment(assessment),
  );
  assert.equal(summarizeEligibilityAssessment(assessment).status, "Needs information");
});

test("repeated summaries keep preferred explanations separate from mandatory outcomes", () => {
  const assessment = {
    status: "Rules match — source unverified",
    checks: [
      { label: "State residency", outcome: "pass", importance: "mandatory", detail: "State matches." },
      { label: "Leadership", outcome: "fail", importance: "preferred", detail: "Preferred leadership evidence is absent." },
      { label: "ACT score", outcome: "unknown", importance: "preferred", detail: "Preferred score is not recorded." },
    ],
  };

  const expected = summarizeEligibilityAssessment(assessment);
  assert.equal(expected.status, "Rules match — source unverified");
  assert.deepEqual(expected.failed, []);
  assert.deepEqual(expected.unknown, []);
  assert.deepEqual(expected.preferred.map(({ label, outcome, detail }) => ({ label, outcome, detail })), [
    { label: "Leadership", outcome: "fail", detail: "Preferred leadership evidence is absent." },
    { label: "ACT score", outcome: "unknown", detail: "Preferred score is not recorded." },
  ]);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.deepEqual(summarizeEligibilityAssessment(assessment), expected);
  }
});
