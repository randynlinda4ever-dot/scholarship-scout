import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixtureSource = readFileSync(new URL("./eligibility.test.mjs", import.meta.url), "utf8");
test("eligibility fixture data is explicitly synthetic", () => {
  assert.match(fixtureSource, /name: "Synthetic Student"/);
  assert.match(fixtureSource, /school: "Example Fictional High School"/);
  assert.match(fixtureSource, /district: "Example District"/);
});
import { assessEligibility, profileRankPercent } from "../src/eligibility.js";

const sponsorSourceUrl = "https://www.aatspshh.org/scholarships/example";
const criterionEvidenceFor = (criteria) => Object.fromEntries(Object.keys(criteria).map((key) => [key, {
  excerpt: `Official sponsor requirement for ${key}.`,
  sourceUrl: `https://aatspshh.org/scholarships/example#${key}`,
}]));

const profile = {
  name: "Synthetic Student",
  state: "Example State",
  citizenship: "Synthetic citizenship value",
  grade: "Synthetic high-school senior",
  graduationYear: "2027",
  collegeStatus: "Synthetic planned enrollment",
  gpa: "3.8",
  classRank: "8 of 100 — top 10%",
  act: "30",
  sat: "1300",
  plannedMajor: "Environmental studies",
  interests: "History, archaeology, humanities",
  plannedCollege: "Example State University",
  school: "Example Fictional High School",
  district: "Example District",
  serviceHours: "40",
  activities: "Synthetic service club; Synthetic academic club",
};

test("prefers the exact class-rank fraction over a rounded percentage band", () => {
  assert.equal(profileRankPercent(profile), 8);
  assert.equal(profileRankPercent({ classRank: "Top 8.5%" }), 8.5);
});

test("passes matching objective rules but retains unverified-source state", () => {
  const assessment = assessEligibility({
    criteria: { state: "Texas", educationLevel: "high-school-senior", graduationYear: 2027, minGpa: 3.5, topPercentMax: 10, minAct: 30, majorKeywords: ["environmental science"] },
    sourceUrl: "https://example.org/scholarship",
    sourceVerified: false,
  }, { ...profile, state: "Texas", plannedMajor: "Environmental science" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.failed, 0);
  assert.ok(assessment.unknown > 0);
  assert.equal(assessment.sourceVerified, false);
});

test("keeps unknown membership and financial need from becoming a false pass", () => {
  const assessment = assessEligibility({
    criteria: { requiredMembership: "National Honor Society", requiresFinancialNeed: true },
    sourceUrl: "https://example.org/scholarship",
    sourceVerified: true,
    evidenceText: "High-school seniors in good standing with affiliated NHS chapters.",
  }, profile, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.unknown, 3);
  assert.equal(
    assessment.checks.find((item) => item.label === "Official source verification").outcome,
    "unknown",
  );
});

test("keeps malformed GPA thresholds unknown instead of treating them as a mismatch", () => {
  const criteria = { minGpa: "not a numeric threshold" };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, profile, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Minimum GPA").outcome, "unknown");
  assert.equal(assessment.failed, 0);
});

test("keeps out-of-range ACT thresholds unknown instead of disqualifying applicants", () => {
  const criteria = { minAct: 99 };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, act: "36" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "ACT minimum").outcome, "unknown");
  assert.equal(assessment.failed, 0);
});

test("keeps an ACT-or-SAT match unknown when the only remaining route has an invalid threshold", () => {
  const criteria = { minActOrSat: { act: 28, sat: 9999 } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, act: "27", sat: "" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "ACT or SAT threshold").outcome, "unknown");
  assert.equal(assessment.failed, 0);
});

test("detects a hard GPA mismatch", () => {
  const criteria = { minGpa: 4.0 };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
    sourceVerified: true,
    evidenceText: "Minimum GPA is 4.0.",
  }, profile, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Ineligible");
});

test("marks past-deadline scholarships expired", () => {
  const assessment = assessEligibility({ deadline: "2026-10-31", criteria: {} }, profile, new Date("2026-11-09T12:00:00"));  assert.equal(assessment.status, "Expired");
});

test("does not treat impossible calendar deadlines as expired or eligible", () => {
  const assessment = assessEligibility({
    deadline: "2027-02-30",
    criteria: { state: "Texas" },
    sourceUrl: "https://example.org/scholarship",
    sourceVerified: true,
    evidenceText: "Texas residents may apply.",
  }, { ...profile, state: "Texas" }, new Date("2027-03-10T12:00:00"));
  assert.equal(assessment.isExpired, false);
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.checks.find((item) => item.label === "Deadline format").outcome, "unknown");
});

test("flags an application fee", () => {
  const assessment = assessEligibility({ criteria: { applicationFee: true } }, profile, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.riskFlags.length, 1);
});

test("returns eligible only after every structured rule and source-evidence check passes", () => {
  const assessment = assessEligibility({
    criteria: { state: "Texas", educationLevel: "high-school-senior", graduationYear: 2027, topPercentMax: 10 },
    sourceUrl: sponsorSourceUrl,
    evidenceUrl: sponsorSourceUrl + "#rules",
    criteriaEvidence: criterionEvidenceFor({ state: "Texas", educationLevel: "high-school-senior", graduationYear: 2027, topPercentMax: 10 }),
    sourceAuthority: "official-program",
    sourceVerified: true,
    provider: "AATSP",
    award: "$1,000",
    awardEvidenceText: "The sponsor awards $1,000 to eligible Texas high-school seniors.",
    awardEvidenceUrl: sponsorSourceUrl + "#award",
    deadline: "2027-05-03",
    lastCheckedDate: "2026-11-09",
    evidenceText: "Texas high-school seniors in the top 10 percent may apply.",
  }, { ...profile, state: "Texas" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Eligible");
});

test("does not treat a manual sourceVerified flag on an unrecognized host as sponsor verification", () => {
  const assessment = assessEligibility({
    criteria: { state: "Texas" },
    sourceUrl: "https://example.org/scholarship",
    sourceAuthority: "official-sponsor",
    sourceVerified: true,
    provider: "Example Sponsor",
    award: "$1,000",
    deadline: "2027-05-03",
    lastCheckedDate: "2026-11-09",
    evidenceText: "Texas residents may apply.",
  }, { ...profile, state: "Texas" }, new Date("2026-11-09T12:00:00"));

  assert.notEqual(assessment.status, "Eligible");
  assert.equal(assessment.sourceVerified, false);
  assert.equal(assessment.sourceStatus, "needs-review");
  assert.equal(
    assessment.checks.find((item) => item.label === "Official source verification").outcome,
    "unknown",
  );
});

test("can confirm first-generation status when the profile explicitly records it", () => {
  const criteria = { requiresFirstGeneration: true };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
    sourceVerified: false,
  }, { ...profile, firstGeneration: "Yes — I meet the sponsor's definition" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.find((item) => item.label === "First-generation status").outcome, "pass");
});

test("does not call an unconfigured scholarship eligible", () => {
  const assessment = assessEligibility({
    sourceUrl: "https://example.org/scholarship",
    sourceVerified: true,
    evidenceText: "Scholarship details.",
    criteria: {},
  }, profile, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Needs information");
});

test("matches an example school-district requirement", () => {
  const criteria = { district: "Example District", graduationYear: 2027, topPercentMax: 10, minAct: 28 };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
    sourceVerified: true,
    evidenceText: "Example District is listed as a participating partner school.",
  }, { ...profile, district: "Example District" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.find((item) => item.label === "School district").outcome, "pass");
});

test("does not infer SHH chapter standing from a reported membership claim", () => {
  const assessment = assessEligibility({
    criteria: { requiresShhMembership: true },
    sourceUrl: "https://www.aatspshh.org/student-scholarships",
    sourceVerified: true,
    evidenceText: "Graduating senior class members of SHH.",
  }, { ...profile, shhMembershipStatus: "Reported member — sponsor confirmation pending" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.checks.find((item) => item.label === "SHH membership").outcome, "unknown");
});

test("distinguishes an explicit negative NSE registration from an unconfirmed status", () => {
  const scholarship = { criteria: { requiresNseRegistration2027: true } };
  const unconfirmed = assessEligibility(scholarship, { ...profile, nseRegistered2027: "Not confirmed" }, new Date("2026-11-09T12:00:00"));
  const explicitNo = assessEligibility({
    ...scholarship,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(scholarship.criteria),
  }, { ...profile, nseRegistered2027: "No NSE/NPE participation" }, new Date("2026-11-09T12:00:00"));
  assert.equal(unconfirmed.checks.find((item) => item.label === "NSE/NPE 2026/27 participation").outcome, "unknown");
  assert.equal(explicitNo.checks.find((item) => item.label === "NSE/NPE 2026/27 participation").outcome, "fail");
});

test("checks each NSE/NPE medal year separately and leaves undocumented medals unknown", () => {
  const assessment = assessEligibility({    criteria: { requiredNseMedalYears: [2025, 2026], requiresNseRegistration2027: true },
    sourceUrl: "https://nationalspanishexam.org/awards/students/senior-scholarship/",
    sourceVerified: true,
    evidenceText: "Applicants should have earned NSE or NPE medals in 2025 and 2026 and register for the 2027 exam.",
  }, { ...profile, nseMedalYears: "", nseRegistered2027: "Not confirmed" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.checks.filter((item) => item.outcome === "unknown").length >= 3, true);
});

test("passes a standardized test requirement when either ACT or SAT is recorded", () => {
  const criteria = { requiresTestScore: true };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
    sourceVerified: true,
    evidenceText: "Applicants must submit SAT or ACT scores.",
  }, profile, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.find((item) => item.label === "Standardized test score").outcome, "pass");
});

test("treats the provider's ACT-or-SAT threshold as an either/or requirement", () => {
  const criteria = { minActOrSat: { act: 28, sat: 1300 } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
    sourceVerified: true,
    evidenceText: "Applicants need an ACT 28 or SAT 1300 for the top award tier.",
  }, { ...profile, act: "28", sat: "1190" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.find((item) => item.label === "ACT or SAT threshold").outcome, "pass");
});

test("keeps the provider's current college-destination restriction explicit", () => {
  const criteria = { district: "Example District", institution: "Example State University", topPercentMax: 10 };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
    sourceVerified: true,
    evidenceText: "Example District partner-school students can receive the enhanced award when enrolling at the specified university.",
  }, { ...profile, district: "Example District", plannedCollege: "Other State University" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.status, "Ineligible");
  assert.equal(assessment.checks.find((item) => item.label === "College destination").outcome, "fail");
});

test("SHH membership alone never satisfies NSE/NPE medal-based scholarship criteria", () => {
  const assessment = assessEligibility({
    criteria: { requiredNseMedalYears: [2025, 2026], requiresNseRegistration2027: true },
    sourceUrl: "https://nationalspanishexam.org/awards/students/senior-scholarship/",
    sourceVerified: true,
    evidenceText: "The 2027 rules require medals in the 2024/25 and 2025/26 NSE/NPE and participation in the 2026/27 exam.",
  }, {
    ...profile,
    shhMembershipStatus: "Confirmed active member in good standing",
    nseMedalYears: "Not recorded",
    nseRegistered2027: "Not confirmed",
  }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.filter((item) => item.label.startsWith("NSE/NPE medal")).every((item) => item.outcome === "unknown"), true);
  assert.equal(assessment.checks.find((item) => item.label === "NSE/NPE 2026/27 participation").outcome, "unknown");
});

test("does not mistake years in a 'not recorded' note for earned NSE medals", () => {
  const assessment = assessEligibility({
    criteria: { requiredNseMedalYears: [2025, 2026] },
    sourceUrl: "https://nationalspanishexam.org/awards/students/senior-scholarship/",
    sourceVerified: true,
    evidenceText: "NSE/NPE medals must be documented for 2025 and 2026.",
  }, { ...profile, nseMedalYears: "Not recorded — confirm NSE/NPE medals earned in 2025 and 2026" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.filter((item) => item.label.startsWith("NSE/NPE medal")).every((item) => item.outcome === "unknown"), true);
});

test("does not match a field keyword inside an unrelated larger word", () => {
  const criteria = { majorKeywords: ["art"] };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, plannedMajor: "Cartography" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Field of study").outcome, "fail");
});

test("matches a complete multi-word field keyword within a longer major name", () => {
  const criteria = { majorKeywords: ["computer science"] };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, plannedMajor: "Computer Science and Engineering" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Field of study").outcome, "pass");
});

test("matches field keywords case-insensitively across punctuation boundaries", () => {
  const criteria = { majorKeywords: ["marine biology"] };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, plannedMajor: "MARINE-BIOLOGY" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Field of study").outcome, "pass");
});

test("does not match a college destination inside an unrelated larger word", () => {
  const criteria = { institution: "Rice University" };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, plannedCollege: "Price University" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "College destination").outcome, "fail");
});

test("matches a complete college destination phrase within a longer campus name", () => {
  const criteria = { institution: "Rice University" };
  const assessment = assessEligibility({
    criteria,    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, plannedCollege: "Rice University — Houston Campus" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "College destination").outcome, "pass");
});

test("does not match an organization requirement inside an unrelated larger word", () => {
  const criteria = { requiredMembership: "art" };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, activities: "Cartography Club; good standing" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Organization membership").outcome, "unknown");
});

test("matches complete multi-word organization names across punctuation boundaries", () => {
  const criteria = { requiredMembership: "Art Club" };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, activities: "ART-CLUB; good standing" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Organization membership").outcome, "pass");
});

test("does not treat an explicit lack of good standing as a membership pass", () => {
  const criteria = { requiredMembership: "Art Club" };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, activities: "Art Club; not in good standing" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Organization membership").outcome, "unknown");
});

test("preferred qualification failures do not make a scholarship ineligible", () => {
  const criteria = { state: "Texas", minGpa: 4.0 };
  const assessment = assessEligibility({
    criteria,
    criteriaImportance: { minGpa: "preferred" },
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, state: "Texas", gpa: "3.8" }, new Date("2026-11-09T12:00:00"));

  const preferred = assessment.checks.find((item) => item.label === "Minimum GPA");
  assert.equal(preferred.outcome, "fail");
  assert.equal(preferred.importance, "preferred");
  assert.notEqual(assessment.status, "Ineligible");
});

test("preferred unknowns do not block a match when mandatory rules are satisfied", () => {
  const criteria = { state: "Texas", minGpa: 3.5 };
  const assessment = assessEligibility({
    criteria,
    criteriaImportance: { minGpa: "preferred" },
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: {
      state: { excerpt: "Applicants must be Texas residents.", sourceUrl: "https://aatspshh.org/rules#state" },
    },
  }, { ...profile, state: "Texas", gpa: "" }, new Date("2026-11-09T12:00:00"));

  const preferred = assessment.checks.find((item) => item.label === "Minimum GPA");
  assert.equal(preferred.outcome, "unknown");
  assert.equal(preferred.importance, "preferred");
  assert.equal(assessment.status, "Rules match — source unverified");
});

test("mandatory failures remain disqualifying when preferred qualifications also fail", () => {
  const criteria = { state: "Texas", minGpa: 3.5, minAct: 28 };
  const assessment = assessEligibility({
    criteria,
    criteriaImportance: { minAct: "preferred" },
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, state: "California", gpa: "3.8", act: "20" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "State residency").importance, "mandatory");
  assert.equal(assessment.checks.find((item) => item.label === "State residency").outcome, "fail");
  assert.equal(assessment.checks.find((item) => item.label === "ACT minimum").importance, "preferred");
  assert.equal(assessment.status, "Ineligible");
});

test("preferred-only records remain needs-information until at least one mandatory rule is recorded", () => {
  const criteria = { minGpa: 3.5 };
  const assessment = assessEligibility({
    criteria,
    criteriaImportance: { minGpa: "preferred" },
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, profile, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Minimum GPA").importance, "preferred");
  assert.equal(assessment.status, "Needs information");
});

test("includes an applicant whose age equals an inclusive minimum", () => {
  const criteria = { ageRange: { min: 18, minInclusive: true } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, age: "18" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "pass");
});

test("excludes an applicant whose age equals an exclusive minimum", () => {
  const criteria = { ageRange: { min: 18, minInclusive: false } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, age: "18" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "fail");});

test("includes an applicant whose age equals an inclusive maximum", () => {
  const criteria = { ageRange: { max: 24, maxInclusive: true } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, age: "24" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "pass");
});

test("excludes an applicant whose age equals an exclusive maximum", () => {
  const criteria = { ageRange: { max: 24, maxInclusive: false } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, age: "24" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "fail");
});

test("keeps age eligibility unknown when the applicant's age is missing", () => {
  const criteria = { ageRange: { min: 18, minInclusive: true, max: 24, maxInclusive: true } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, profile, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "unknown");
});

test("keeps age eligibility unknown when a stated boundary lacks inclusive or exclusive wording", () => {
  const criteria = { ageRange: { min: 18, max: 24, maxInclusive: true } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, age: "20" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "unknown");
});

test("keeps malformed or contradictory age ranges unknown instead of disqualifying the applicant", () => {
  const criteria = { ageRange: { min: 25, minInclusive: true, max: 18, maxInclusive: true } };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, age: "20" }, new Date("2026-11-09T12:00:00"));

  assert.equal(assessment.checks.find((item) => item.label === "Age range").outcome, "unknown");
});


test("rejects signed, percentage, and decorated numeric profile values", () => {
  for (const value of ["-5", "92%", "40 hours", "1e3"]) {
    const criteria = { minServiceHours: 10 };
    const assessment = assessEligibility({
      criteria,
      sourceUrl: sponsorSourceUrl,
      criteriaEvidence: criterionEvidenceFor(criteria),
    }, { ...profile, serviceHours: value }, new Date("2026-11-09T12:00:00"));
    assert.equal(assessment.checks.find((item) => item.label === "Community service").outcome, "unknown", value);
    assert.equal(assessment.failed, 0, value);
  }
});

test("invalid service-hour thresholds remain unknown instead of creating false failures", () => {
  const criteria = { minServiceHours: "not-a-number" };
  const assessment = assessEligibility({
    criteria,
    sourceUrl: sponsorSourceUrl,
    criteriaEvidence: criterionEvidenceFor(criteria),
  }, { ...profile, serviceHours: "100" }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.find((item) => item.label === "Community service").outcome, "unknown");
  assert.equal(assessment.failed, 0);
});

test("inactive false and any-valued criteria do not count as mandatory sponsor rules", () => {
  for (const criteria of [{ requiresShhMembership: false }, { schoolState: "any" }]) {
    const assessment = assessEligibility({
      criteria,
      sourceUrl: sponsorSourceUrl,
      criteriaEvidence: criterionEvidenceFor(criteria),
    }, profile, new Date("2026-11-09T12:00:00"));
    assert.equal(
      assessment.checks.find((item) => item.label === "Mandatory eligibility criteria").outcome,
      "unknown",
    );
  }
});
