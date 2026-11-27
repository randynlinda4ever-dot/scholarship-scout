import test from "node:test";
import assert from "node:assert/strict";
import { getEvidenceCompleteness, getEvidenceExcerptAttributions } from "../src/lib/evidence.js";

const completeRecord = {
  name: "Example Senior Award",
  provider: "Example Foundation",
  award: "$1,000",
  awardEvidenceText: "The sponsor awards $1,000 to selected graduating seniors.",
  awardEvidenceUrl: "https://www.aatspshh.org/student-scholarships#award",
  deadline: "2027-05-03",
  deadlineText: "May 3, 2027",
  sourceUrl: "https://www.aatspshh.org/student-scholarships",
  sourceAuthority: "official-program",
  sourceVerified: true,
  evidenceText: "The sponsor states graduating seniors may apply.",
  evidenceUrl: "https://www.aatspshh.org/student-scholarships/rules#eligibility",
  lastCheckedDate: "2026-11-09",
};

test("reports all required sponsor evidence as complete without making a student eligibility claim", () => {
  const review = getEvidenceCompleteness(completeRecord, new Date("2026-11-10T12:00:00"));
  assert.equal(review.complete, true);
  assert.equal(review.completedCount, review.totalCount);
  assert.deepEqual(review.missing, []);
  assert.equal(review.checks.some((item) => item.label.toLowerCase().includes("student")), false);
});

test("requires the exact official page URL associated with the general evidence excerpt", () => {
  const missing = getEvidenceCompleteness({ ...completeRecord, evidenceUrl: "" }, new Date("2026-11-10T12:00:00"));
  assert.ok(missing.missing.includes("General excerpt's official source URL"));

  const mismatched = getEvidenceCompleteness({
    ...completeRecord,
    evidenceUrl: "https://other.example/rules",
  }, new Date("2026-11-10T12:00:00"));
  assert.ok(mismatched.missing.includes("General excerpt's official source URL"));

  const exactPage = getEvidenceCompleteness({
    ...completeRecord,
    evidenceUrl: "https://aatspshh.org/policies/scholarships#eligibility",
  }, new Date("2026-11-10T12:00:00"));
  assert.equal(exactPage.checks.find((item) => item.label === "General excerpt's official source URL").complete, true);
});

test("requires criterion-specific sponsor evidence when structured eligibility rules exist", () => {
  const criteria = { state: "TX", minGpa: 3.0 };
  const withoutEvidence = getEvidenceCompleteness({
    ...completeRecord,
    criteria,
  }, new Date("2026-11-10T12:00:00"));
  assert.equal(withoutEvidence.complete, false);
  assert.ok(withoutEvidence.missing.includes("Criterion-specific sponsor evidence"));

  const withEvidence = getEvidenceCompleteness({
    ...completeRecord,
    criteria,
    criteriaEvidence: {
      state: {
        excerpt: "Applicants must be Texas residents.",
        sourceUrl: "https://aatspshh.org/rules#residency",
      },
      minGpa: {
        excerpt: "Applicants must have a 3.0 GPA.",
        sourceUrl: "https://aatspshh.org/rules#gpa",
      },
    },
  }, new Date("2026-11-10T12:00:00"));
  assert.equal(withEvidence.missing.includes("Criterion-specific sponsor evidence"), false);
});

test("identifies missing sponsor evidence fields and stale verification separately", () => {
  const review = getEvidenceCompleteness({
    ...completeRecord,
    award: "",
    evidenceText: "",
    lastCheckedDate: "2026-09-01",
  }, new Date("2026-11-10T12:00:00"));
  assert.equal(review.complete, false);
  assert.deepEqual(review.missing, [
    "Sponsor and award details",
    "Award wording and currency evidence",
    "Eligibility evidence excerpt",
    "Sponsor check within 30 days",
  ]);
});

test("requires a verbatim award excerpt and same-domain public source URL", () => {
  const withoutExcerpt = getEvidenceCompleteness({ ...completeRecord, awardEvidenceText: "" }, new Date("2026-11-10T12:00:00"));
  assert.ok(withoutExcerpt.missing.includes("Award wording and currency evidence"));

  const crossDomain = getEvidenceCompleteness({
    ...completeRecord,
    awardEvidenceUrl: "https://other.example/award-rules",
  }, new Date("2026-11-10T12:00:00"));
  assert.ok(crossDomain.missing.includes("Award wording and currency evidence"));
});

test("attributes the general excerpt to its own exact page URL, not the scholarship URL", () => {
  const record = { ...completeRecord, sourceUrl: "https://jkcf.org/scholarships/example", evidenceUrl: "https://www.aatspshh.org/rules/eligibility#senior" };
  const attribution = getEvidenceExcerptAttributions(record).general;
  assert.equal(attribution.url, record.evidenceUrl);
  assert.equal(attribution.authority, "official-program");
  assert.equal(attribution.label, "Official scholarship program website");
});

test("attributes the award excerpt to its own exact page URL", () => {
  const record = { ...completeRecord, sourceUrl: "https://jkcf.org/scholarships/example", awardEvidenceUrl: "https://www.tarleton.edu/financial-aid/scholarships#award" };
  const attribution = getEvidenceExcerptAttributions(record).award;
  assert.equal(attribution.url, record.awardEvidenceUrl);
  assert.equal(attribution.authority, "official-school");
  assert.equal(attribution.label, "Official school / district website");
});

test("keeps each criterion excerpt paired with its own URL rather than sharing another criterion's source", () => {
  const record = {
    ...completeRecord,
    sourceUrl: "https://jkcf.org/scholarships/example",
    criteriaEvidence: {
      residency: { excerpt: "Applicants must reside in Texas.", sourceUrl: "https://www.aatspshh.org/rules#residency" },
      gpa: { excerpt: "Applicants must have a 3.0 GPA.", sourceUrl: "https://www.tarleton.edu/financial-aid/eligibility#gpa" },
    },
  };
  const attributions = getEvidenceExcerptAttributions(record).criteria;
  assert.equal(attributions.residency.url, record.criteriaEvidence.residency.sourceUrl);
  assert.equal(attributions.residency.authority, "official-program");
  assert.equal(attributions.gpa.url, record.criteriaEvidence.gpa.sourceUrl);
  assert.equal(attributions.gpa.authority, "official-school");
});

test("does not fall back to the scholarship URL when an excerpt's own URL is missing or unsafe", () => {
  const record = {
    ...completeRecord,
    sourceUrl: "https://jkcf.org/scholarships/example",
    evidenceText: "A separate general excerpt.",
    evidenceUrl: "",
    awardEvidenceText: "A separate award excerpt.",
    awardEvidenceUrl: "javascript:alert(1)",
  };
  const attributions = getEvidenceExcerptAttributions(record);
  assert.equal(attributions.general.url, "");
  assert.equal(attributions.general.authority, "unverified-lead");
  assert.equal(attributions.award.url, "");
  assert.equal(attributions.award.authority, "unverified-lead");
});

test("does not accept a manually asserted official label for an unrecognized domain", () => {
  const review = getEvidenceCompleteness({
    ...completeRecord,
    sourceUrl: "https://unrelated-example.org/award",
    sourceAuthority: "official-sponsor",
  }, new Date("2026-11-10T12:00:00"));
  assert.equal(review.complete, false);
  assert.ok(review.missing.includes("Official HTTPS source"));
});

test("rejects untrusted source URLs and invalid supporting evidence links", () => {
  const review = getEvidenceCompleteness({
    ...completeRecord,
    sourceUrl: "javascript:alert(1)",
    evidenceUrl: "http://example.org/rules",
  }, new Date("2026-11-10T12:00:00"));
  assert.equal(review.complete, false);
  assert.ok(review.missing.includes("Official HTTPS source"));
  assert.ok(review.missing.includes("General excerpt's official source URL"));
});
