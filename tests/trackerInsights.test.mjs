import test from "node:test";
import assert from "node:assert/strict";
import { findPotentialDuplicates, getDeadlineUrgency } from "../src/lib/trackerInsights.js";

const today = new Date(2026, 10, 10, 12, 0, 0);

test("labels missing and impossible calendar deadlines as unconfirmed", () => {
  assert.deepEqual(getDeadlineUrgency("", today), {
    status: "unknown", daysRemaining: null, label: "Deadline not confirmed",
  });
  assert.equal(getDeadlineUrgency("2027-02-30", today).status, "unknown");
  assert.equal(getDeadlineUrgency("November 20, 2026", today).status, "unknown");
});

test("validates leap-day and month-end boundaries at fixed instants in sponsor time zones", () => {
  const nonLeapBoundary = new Date("2027-03-01T07:30:00.000Z");
  assert.equal(getDeadlineUrgency("2027-02-29", nonLeapBoundary, "America/Los_Angeles").status, "unknown");
  assert.equal(getDeadlineUrgency("2027-04-31", nonLeapBoundary, "America/Los_Angeles").status, "unknown");

  const leapDayBoundary = new Date("2028-02-29T18:00:00.000Z");
  assert.deepEqual(getDeadlineUrgency("2028-02-29", leapDayBoundary, "America/Los_Angeles"), {
    status: "today", daysRemaining: 0, label: "Due today",
  });
});

test("distinguishes overdue, due today, due soon, and upcoming dates", () => {
  assert.deepEqual(getDeadlineUrgency("2026-11-09", today), {
    status: "overdue", daysRemaining: -1, label: "Overdue by 1 day",
  });
  assert.deepEqual(getDeadlineUrgency("2026-11-10", today), {
    status: "today", daysRemaining: 0, label: "Due today",
  });
  assert.deepEqual(getDeadlineUrgency("2026-11-17", today), {
    status: "due-soon", daysRemaining: 7, label: "Due in 7 days",
  });
  assert.deepEqual(getDeadlineUrgency("2026-11-18", today), {
    status: "upcoming", daysRemaining: 8, label: "Due in 8 days",
  });
});

test("calculates date-only urgency in the explicitly stated sponsor time zone", () => {
  const instant = new Date("2026-11-13T06:00:00.000Z");
  assert.deepEqual(getDeadlineUrgency("2026-11-12", instant, "America/Los_Angeles"), {
    status: "today", daysRemaining: 0, label: "Due today",
  });
  assert.deepEqual(getDeadlineUrgency("2026-11-12", instant, "America/Chicago"), {
    status: "overdue", daysRemaining: -1, label: "Overdue by 1 day",
  });
  assert.equal(getDeadlineUrgency("2026-11-12", instant, "Not/A_Zone").status, "unknown");
});

test("suggests similar awards only when sponsor and deadline year agree", () => {
  const pairs = findPotentialDuplicates([
    { id: "a", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2027-03-01" },
    { id: "b", name: "Hispanic Heritage Scholarships", provider: "Civic Foundation", deadline: "2027-04-15" },
    { id: "c", name: "Hispanic Heritage Scholarship", provider: "Different Foundation", deadline: "2027-03-01" },
    { id: "d", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2028-03-01" },
  ]);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].firstId, "a");
  assert.equal(pairs[0].secondId, "b");
  assert.equal(pairs[0].deadlineYear, "2027");
  assert.equal(pairs[0].titleSimilarity, 100);
  assert.equal(pairs[0].matchType, "exact");
  assert.equal(pairs[0].matchLabel, "Exact title match");
  assert.deepEqual(pairs[0].reasons, ["Same sponsor", "Same deadline year", "Titles match after normalization"]);
});

test("does not suggest duplicates for weakly related titles or missing deadline years", () => {
  const pairs = findPotentialDuplicates([
    { id: "a", name: "Science Achievement Award", provider: "Civic Foundation", deadline: "2027-03-01" },
    { id: "b", name: "Community Service Scholarship", provider: "Civic Foundation", deadline: "2027-04-15" },
    { id: "c", name: "Science Achievement Award", provider: "Civic Foundation", deadline: "" },
    { id: "d", name: "Science Achievement Award", provider: "Civic Foundation", deadline: "" },
  ]);
  assert.deepEqual(pairs, []);
});

test("same-day sponsor cutoffs use the explicit IANA zone and never infer a zone", () => {
  const before = new Date("2026-11-10T22:59:00.000Z");
  const after = new Date("2026-11-10T23:01:00.000Z");
  assert.deepEqual(getDeadlineUrgency("2026-11-10", before, "America/Chicago", "", "", "17:00"), {
    status: "today", daysRemaining: 0, label: "Due today by 5:00 PM",
  });
  assert.deepEqual(getDeadlineUrgency("2026-11-10", after, "America/Chicago", "", "", "17:00"), {
    status: "overdue", daysRemaining: 0, label: "Sponsor cutoff passed today",
  });
  assert.equal(getDeadlineUrgency("2026-11-10", after, "", "", "", "17:00").status, "unknown");
});
