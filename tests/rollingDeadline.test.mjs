import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScholarshipRecord } from "../src/lib/evidence.js";
import { getDeadlineUrgency } from "../src/lib/trackerInsights.js";

function rollingRecord(deadlineText, now) {
  return normalizeScholarshipRecord({
    name: "Synthetic Rolling Review Award",
    provider: "Example Foundation",
    award: "$1,000",
    awardEvidenceText: "The sponsor awards $1,000 to selected applicants.",
    awardEvidenceUrl: "https://www.aatspshh.org/student-scholarships#award",
    deadline: "",
    deadlineText,
    deadlineTimezone: "",
    sourceUrl: "https://www.aatspshh.org/student-scholarships",
    sourceAuthority: "official-program",
    sourceVerified: true,
    evidenceText: "The sponsor describes the application review process.",
    evidenceUrl: "https://www.aatspshh.org/student-scholarships/rules",
    lastCheckedDate: new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
    criteria: {},
  }, now);
}

test("rolling review wording remains date-free across a fixed UTC-midnight boundary", () => {
  const wording = "Applications are accepted and reviewed on a rolling basis throughout the year.";
  const instants = [
    new Date("2026-11-09T23:59:59.999Z"),
    new Date("2026-11-10T00:00:00.000Z"),
  ];

  for (const now of instants) {
    const record = rollingRecord(wording, now);
    assert.equal(record.deadline, "");
    assert.equal(record.deadlineText, wording);
    assert.equal(record.deadlineTime, "");
    assert.equal(record.deadlineTimezoneText, "");
    assert.equal(record.deadlineTimezone, "");
    assert.equal(record.sourceStatus, "verified");
    assert.equal(getDeadlineUrgency(record.deadline, now, record.deadlineTimezone).status, "unknown");
  }
});

test("rolling review until funds are committed does not create a fixed cutoff or cycle", () => {
  const wording = "Applications are reviewed on a rolling basis until available funds are committed.";
  const now = new Date("2027-02-01T12:00:00.000Z");
  const record = rollingRecord(wording, now);

  assert.equal(record.deadline, "");
  assert.equal(record.deadlineText, wording);
  assert.equal(record.deadlineTime, "");
  assert.equal(record.deadlineTimezoneText, "");
  assert.equal(getDeadlineUrgency(record.deadline, now).status, "unknown");
});

test("recurring annual wording preserves the description without inventing the next cycle date", () => {
  const wording = "Applications reopen each September; the sponsor announces the dates annually.";
  const now = new Date("2027-09-01T12:00:00.000Z");
  const record = rollingRecord(wording, now);

  assert.equal(record.deadline, "");
  assert.equal(record.deadlineText, wording);
  assert.equal(record.deadlineTime, "");
  assert.equal(record.deadlineTimezoneText, "");
  assert.equal(record.deadlineTimezone, "");
  assert.equal(getDeadlineUrgency(record.deadline, now).status, "unknown");
});

test("tracker urgency changes at sponsor-local midnight only for an explicitly recorded date and zone", () => {
  const deadline = "2026-11-12";
  const beforeSponsorMidnight = getDeadlineUrgency(
    deadline,
    new Date("2026-11-13T07:59:59.999Z"),
    "America/Los_Angeles",
  );
  const atSponsorMidnight = getDeadlineUrgency(
    deadline,
    new Date("2026-11-13T08:00:00.000Z"),
    "America/Los_Angeles",
  );

  assert.equal(beforeSponsorMidnight.status, "today");
  assert.equal(atSponsorMidnight.status, "overdue");
});