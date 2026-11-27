import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_STATUSES,
  getApplicationStatusCounts,
  normalizeTrackerRecord,
  filterAndSortTrackerRecords,
} from "../src/lib/trackerManagement.js";

const rows = [
  { id: "a", name: "Alpha Award", provider: "Foundation A", deadline: "2027-03-01", award: "$1,000", applicationStatus: "Preparing", priority: "High" },
  { id: "b", name: "Beta Award", provider: "Foundation B", deadline: "2027-01-15", award: "Up to $5,000", applicationStatus: "Submitted", priority: "Low" },
  { id: "c", name: "Gamma Award", provider: "Foundation C", deadline: "", award: "$10,000", applicationStatus: "Ready", priority: "Medium", archived: true },
];

test("normalizes older scholarship records with safe workflow defaults", () => {
  const record = normalizeTrackerRecord({ id: "old", name: "Old Award" });
  assert.equal(record.applicationStatus, "Not started");
  assert.equal(record.priority, "Medium");
  assert.deepEqual(record.tags, []);
  assert.equal(record.archived, false);
  assert.equal(record.submittedAt, "");
  assert.equal(record.decisionDate, "");
});

test("normalizes status, priority, tags, and dates without trusting malformed values", () => {
  const record = normalizeTrackerRecord({
    id: "custom",
    applicationStatus: "Submitted",
    priority: "High",
    tags: ["  humanities ", "", 42, "humanities", "Texas"],
    submittedAt: "2027-01-03",
    decisionDate: "not-a-date",
    archived: true,
  });
  assert.ok(APPLICATION_STATUSES.includes(record.applicationStatus));
  assert.equal(record.applicationStatus, "Submitted");
  assert.equal(record.priority, "High");
  assert.deepEqual(record.tags, ["humanities", "Texas"]);
  assert.equal(record.submittedAt, "2027-01-03");
  assert.equal(record.decisionDate, "");
  assert.equal(record.archived, true);
});

test("filters application status independently from eligibility and archive state", () => {
  const visible = filterAndSortTrackerRecords(rows, {
    applicationStatusFilter: "Preparing",
    archiveFilter: "active",
  });
  assert.deepEqual(visible.map((row) => row.id), ["a"]);

  const archived = filterAndSortTrackerRecords(rows, { archiveFilter: "archived" });
  assert.deepEqual(archived.map((row) => row.id), ["c"]);
});

test("supports search and eligibility filtering alongside application status", () => {
  const assessments = new Map([
    ["a", { status: "Rules match — source unverified" }],
    ["b", { status: "Eligible" }],
    ["c", { status: "Needs information" }],
  ]);
  const result = filterAndSortTrackerRecords(rows, {
    search: "foundation b",
    eligibilityFilter: "Eligible",
    assessments,
  });
  assert.deepEqual(result.map((row) => row.id), ["b"]);
});

test("sorts by deadline with undated records last and by priority high to low", () => {
  const byDeadline = filterAndSortTrackerRecords(rows, { archiveFilter: "all", sortBy: "deadline" });
  assert.deepEqual(byDeadline.map((row) => row.id), ["b", "a", "c"]);

  const byPriority = filterAndSortTrackerRecords(rows, { archiveFilter: "all", sortBy: "priority" });
  assert.deepEqual(byPriority.map((row) => row.id), ["a", "c", "b"]);
});

test("sorts by award and application status deterministically", () => {
  const byAward = filterAndSortTrackerRecords(rows, { archiveFilter: "all", sortBy: "award" });
  assert.deepEqual(byAward.map((row) => row.id), ["a", "b", "c"]);

  const byStatus = filterAndSortTrackerRecords(rows, { archiveFilter: "all", sortBy: "applicationStatus" });
  assert.deepEqual(byStatus.map((row) => row.id), ["a", "c", "b"]);
});

test("counts active application workflow states separately from archived records", () => {
  const counts = getApplicationStatusCounts(rows);
  assert.equal(counts.inProgress, 1);
  assert.equal(counts.ready, 0);
  assert.equal(counts.submitted, 1);
  assert.equal(counts.awarded, 0);
  assert.equal(counts.rejected, 0);
  assert.equal(counts.notStarted, 0);
});
