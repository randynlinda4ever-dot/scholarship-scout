import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScholarshipRecord } from "../src/lib/evidence.js";
import { getDeadlineMilestones, getDeadlineUrgency } from "../src/lib/trackerInsights.js";

function annualRecord({ deadline, deadlineText, deadlineTimezone = "", lastCheckedDate }, now) {
  return normalizeScholarshipRecord({
    name: "Synthetic Annual Cycle Scholarship",
    provider: "Example Foundation",
    award: "$1,000",
    awardEvidenceText: "The sponsor awards $1,000 to selected applicants.",
    awardEvidenceUrl: "https://www.aatspshh.org/student-scholarships#award",
    deadline,
    deadlineText,
    deadlineTimezone,
    sourceUrl: "https://www.aatspshh.org/student-scholarships",
    sourceAuthority: "official-program",
    sourceVerified: true,
    evidenceText: "The sponsor describes the annual application cycle.",
    evidenceUrl: "https://www.aatspshh.org/student-scholarships/rules",
    lastCheckedDate,
    criteria: {},
  }, now);
}

test("a prior-year annual cutoff stays in its original year and is expired in the next cycle", () => {
  const wording = "Applications close September 15 each year; the sponsor confirms each cycle separately.";
  const now = new Date("2027-09-15T17:00:00.000Z");
  const record = annualRecord({
    deadline: "2026-09-15",
    deadlineText: wording,
    deadlineTimezone: "America/Chicago",
    lastCheckedDate: "2027-09-15",
  }, now);

  assert.equal(record.deadline, "2026-09-15");
  assert.equal(record.deadlineText, wording);
  assert.equal(record.sourceStatus, "expired");
  assert.equal(record.sourceVerified, false);
  assert.equal(getDeadlineUrgency(record.deadline, now, record.deadlineTimezone).status, "overdue");
  assert.deepEqual(getDeadlineMilestones(record).map(({ deadline, deadlineText }) => ({
    deadline,
    deadlineText,
  })), [{ deadline: "2026-09-15", deadlineText: wording }]);
});

test("an annual prior-cycle date expires at sponsor-local midnight without rolling forward", () => {
  const wording = "Applications close December 31 annually.";
  const deadline = "2026-12-31";
  const beforeMidnight = new Date("2027-01-01T07:59:59.999Z");
  const atMidnight = new Date("2027-01-01T08:00:00.000Z");
  const before = annualRecord({
    deadline,
    deadlineText: wording,
    deadlineTimezone: "America/Los_Angeles",
    lastCheckedDate: "2026-12-31",
  }, beforeMidnight);
  const after = annualRecord({
    deadline,
    deadlineText: wording,
    deadlineTimezone: "America/Los_Angeles",
    lastCheckedDate: "2026-12-31",
  }, atMidnight);

  assert.equal(before.deadline, deadline);
  assert.equal(before.sourceStatus, "verified");
  assert.equal(getDeadlineUrgency(before.deadline, beforeMidnight, before.deadlineTimezone).status, "today");
  assert.equal(after.deadline, deadline);
  assert.equal(after.sourceStatus, "expired");
  assert.equal(getDeadlineUrgency(after.deadline, atMidnight, after.deadlineTimezone).status, "overdue");
});

test("annual wording without a confirmed current-cycle date remains unconfirmed near the usual month", () => {
  const wording = "The award reopens each September; the sponsor announces the exact deadline annually.";
  const now = new Date("2027-09-15T12:00:00.000Z");
  const record = annualRecord({
    deadline: "",
    deadlineText: wording,
    lastCheckedDate: "2027-09-15",
  }, now);

  assert.equal(record.deadline, "");
  assert.equal(record.deadlineText, wording);
  assert.equal(record.deadlineTimezone, "");
  assert.equal(record.sourceStatus, "verified");
  assert.equal(getDeadlineUrgency(record.deadline, now).status, "unknown");
  assert.deepEqual(getDeadlineMilestones(record).map(({ deadline, deadlineText }) => ({
    deadline,
    deadlineText,
  })), [{ deadline: "", deadlineText: wording }]);
});

test("an invalid sponsor timezone does not allow a prior annual date to be rolled or classified", () => {
  const now = new Date("2027-01-01T12:00:00.000Z");
  const record = annualRecord({
    deadline: "2026-12-31",
    deadlineText: "Applications close December 31 every year.",
    deadlineTimezone: "Not/A_Zone",
    lastCheckedDate: "2027-01-01",
  }, now);

  assert.equal(record.deadline, "2026-12-31");
  assert.equal(record.sourceStatus, "needs-review");
  assert.equal(getDeadlineUrgency(record.deadline, now, record.deadlineTimezone).status, "unknown");
});
