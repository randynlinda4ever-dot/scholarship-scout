import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";
import { deriveSourceStatus, normalizeScholarshipRecord } from "../src/lib/evidence.js";
import { getDeadlineUrgency, getDeadlineMilestones } from "../src/lib/trackerInsights.js";
import { buildCloudScholarshipRow, mapCloudScholarship } from "../src/lib/cloudMapping.js";
import { appendSourceEvidenceHistory, invalidateSourceReviewIfChanged } from "../src/lib/sourceReview.js";

const verifiedRecord = {
  name: "Synthetic Opening-Date Scholarship",
  provider: "Example Foundation",
  award: "$1,000",
  awardEvidenceText: "The sponsor awards $1,000 to selected applicants.",
  awardEvidenceUrl: "https://example.org/award#amount",
  sourceUrl: "https://example.org/award",
  sourceAuthority: "official-program",
  sourceVerified: true,
  evidenceText: "The official program page lists the application window.",
  evidenceUrl: "https://example.org/award#rules",
  lastCheckedDate: "2027-01-01",
  criteria: { state: "Texas" },
  criteriaImportance: {},
  criteriaEvidence: {
    state: {
      excerpt: "Applicants must be Texas residents.",
      sourceUrl: "https://example.org/award#residency",
    },
  },
};

test("a future opening date prevents a prior-cycle deadline from showing overdue", () => {
  const now = new Date("2027-01-01T12:00:00.000Z");
  const wording = "Applications open March 1, 2027 and close April 30, 2027.";
  const record = normalizeScholarshipRecord({
    ...verifiedRecord,
    deadline: "2026-04-30",
    deadlineText: wording,
    openDate: "2027-03-01",
    openDateTimezone: "America/Chicago",
  }, now);

  assert.equal(record.openDate, "2027-03-01");
  assert.equal(record.deadline, "2026-04-30");
  assert.equal(record.deadlineText, wording);
  assert.equal(record.sourceStatus, "needs-review");
  assert.equal(getDeadlineUrgency(
    record.deadline, now, "", record.openDate, record.openDateTimezone,
  ).status, "not-open");
  assert.equal(getDeadlineUrgency(
    record.deadline, now, "", record.openDate, record.openDateTimezone,
  ).label, "Opens in 59 days");
  const assessment = assessEligibility({
    ...record,
    criteria: {},
    criteriaEvidence: {},
  }, {}, now);
  assert.equal(assessment.isExpired, false);
  assert.equal(assessment.status, "Needs information");
  assert.ok(assessment.checks.some((item) => item.label === "Application opening date" && item.outcome === "unknown"));
});

test("an opening date uses its explicit sponsor timezone at the local-day boundary", () => {
  const before = new Date("2027-03-01T05:59:59.999Z");
  const at = new Date("2027-03-01T06:00:00.000Z");
  assert.equal(getDeadlineUrgency("2027-04-30", before, "America/Chicago", "2027-03-01", "America/Chicago").status, "not-open");
  assert.equal(getDeadlineUrgency("2027-04-30", at, "America/Chicago", "2027-03-01", "America/Chicago").status, "upcoming");
});

test("an invalid opening date or explicit opening timezone stays Unknown and never guesses", () => {
  const now = new Date("2027-01-01T12:00:00.000Z");
  assert.equal(getDeadlineUrgency("2026-12-31", now, "", "2027-02-30", "America/Chicago").status, "unknown");
  const invalidOpening = assessEligibility({ ...verifiedRecord, deadline: "2026-12-31", openDate: "2027-02-30" }, {}, now);
  assert.equal(invalidOpening.isExpired, false);
  assert.notEqual(invalidOpening.status, "Expired");
  assert.equal(getDeadlineUrgency("2026-12-31", now, "", "2027-02-01", "Not/A_Zone").status, "unknown");
  assert.equal(getDeadlineUrgency("2027-02-28", new Date("2027-03-02T12:00:00.000Z"), "", "2027-03-01", "America/Chicago").status, "unknown");
  const inconsistentRange = assessEligibility({ ...verifiedRecord, deadline: "2027-02-28", openDate: "2027-03-01" }, {}, new Date("2027-03-02T12:00:00.000Z"));
  assert.equal(inconsistentRange.isExpired, false);
  assert.notEqual(inconsistentRange.status, "Expired");
  assert.ok(inconsistentRange.checks.some((item) => item.label === "Application date range" && item.outcome === "unknown"));
  assert.equal(deriveSourceStatus({
    ...verifiedRecord,
    deadline: "2026-12-31",
    openDate: "2027-02-01",
    openDateTimezone: "Not/A_Zone",
  }, now), "needs-review");
});

test("an opening date without a published deadline still appears as a not-open tracker milestone", () => {
  const milestones = getDeadlineMilestones({ openDate: "2027-03-01", openDateTimezone: "America/Chicago" });
  assert.equal(milestones.length, 1);
  assert.equal(milestones[0].key, "opening");
  assert.equal(milestones[0].label, "Application opens");
  assert.equal(milestones[0].deadline, "");
  assert.equal(milestones[0].timeZone, "America/Chicago");
  assert.equal(getDeadlineUrgency("", new Date("2027-01-01T12:00:00.000Z"), "", "2027-03-01", "America/Chicago").status, "not-open");
  const priorityOnly = getDeadlineMilestones({ priorityDeadline: "2027-04-30", openDate: "2027-03-01" });
  assert.equal(priorityOnly.length, 1);
  assert.equal(priorityOnly[0].key, "priority");
});

test("opening date and sponsor wording stay distinct deadline milestones", () => {
  const wording = "Applications open March 1, 2027 through April 30, 2027.";
  const record = normalizeScholarshipRecord({
    ...verifiedRecord,
    deadline: "2027-04-30",
    deadlineText: wording,
    openDate: "2027-03-01",
    openDateTimezone: "America/Denver",
  }, new Date("2027-01-01T12:00:00.000Z"));
  const [milestone] = getDeadlineMilestones(record);
  assert.equal(milestone.deadline, "2027-04-30");
  assert.equal(milestone.deadlineText, wording);
  assert.equal(getDeadlineUrgency(milestone.deadline, new Date("2027-01-01T12:00:00.000Z"), milestone.timeZone, record.openDate, record.openDateTimezone).status, "not-open");
});

test("opening-date changes retain the prior opening-date evidence", () => {
  const previous = {
    ...verifiedRecord,
    openDate: "2027-03-01",
    openDateTimezone: "America/Denver",
  };
  const updated = appendSourceEvidenceHistory(previous, {
    ...previous,
    openDate: "2027-03-15",
  }, "2027-01-02T12:00:00.000Z");
  assert.equal(updated.sourceEvidenceHistory[0].openDate, "2027-03-01");
  assert.equal(updated.sourceEvidenceHistory[0].openDateTimezone, "America/Denver");
});

test("opening-date changes invalidate a previous sponsor review", () => {
  const previous = {
    ...verifiedRecord,
    openDate: "2027-03-01",
    sourceVerified: true,
  };
  const updated = invalidateSourceReviewIfChanged(previous, {
    ...previous,
    openDate: "2027-03-15",
  });
  assert.equal(updated.sourceVerified, false);
  assert.equal(updated.lastCheckedDate, "");
});

test("opening dates survive the existing cloud JSON metadata round trip", () => {
  const row = buildCloudScholarshipRow({
    ...verifiedRecord,
    deadline: "2027-04-30",
    deadlineText: "Applications open March 1, 2027 through April 30, 2027.",
    openDate: "2027-03-01",
    openDateTimezone: "America/Denver",
  }, "synthetic-owner");
  const reloaded = mapCloudScholarship({ ...row, id: "synthetic-opening-date" });
  assert.equal(reloaded.open_date, "2027-03-01");
  assert.equal(reloaded.open_date_timezone, "America/Denver");
});
