import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";
import { calendarDateKey } from "../src/lib/evidence.js";

const now = (year, month, day, hour, minute, second, millisecond = 0) =>
  new Date(year, month - 1, day, hour, minute, second, millisecond);

test("does not expire a date-only deadline during any part of the stated local day", () => {
  const assessment = assessEligibility(
    { deadline: "2026-11-12", criteria: {} },
    {},
    now(2026, 11, 12, 23, 59, 59, 999),
  );

  assert.equal(assessment.isExpired, false);
  assert.notEqual(assessment.status, "Expired");
});

test("expires a date-only deadline at the start of the following local day", () => {
  const assessment = assessEligibility(
    { deadline: "2026-11-12", criteria: {} },
    {},
    now(2026, 11, 13, 0, 0, 0),
  );

  assert.equal(assessment.isExpired, true);
  assert.equal(assessment.status, "Expired");
});

test("uses an explicitly stated sponsor time zone for date-only expiry", () => {
  const instant = new Date("2026-11-13T06:00:00.000Z");
  const pacific = assessEligibility(
    { deadline: "2026-11-12", deadlineTimezone: "America/Los_Angeles", criteria: {} },
    {},
    instant,
  );
  const central = assessEligibility(
    { deadline: "2026-11-12", deadlineTimezone: "America/Chicago", criteria: {} },
    {},
    instant,
  );

  assert.equal(pacific.isExpired, false);
  assert.equal(central.isExpired, true);
  assert.equal(central.status, "Expired");
});


test("keeps a spring-forward date-only deadline active until sponsor-local midnight", () => {
  const scholarship = {
    deadline: "2026-03-08",
    deadlineTimezone: "America/New_York",
    criteria: {},
  };
  const finalMomentOfDeadline = assessEligibility(
    scholarship,
    {},
    new Date("2026-03-09T03:59:59.999Z"),
  );
  const firstMomentOfNextDay = assessEligibility(
    scholarship,
    {},
    new Date("2026-03-09T04:00:00.000Z"),
  );

  assert.equal(finalMomentOfDeadline.isExpired, false);
  assert.equal(firstMomentOfNextDay.isExpired, true);
  assert.equal(firstMomentOfNextDay.status, "Expired");
});

test("does not expire during either occurrence of the repeated fall-back hour", () => {
  const scholarship = {
    deadline: "2026-11-01",
    deadlineTimezone: "America/New_York",
    criteria: {},
  };
  const firstOneThirty = assessEligibility(
    scholarship,
    {},
    new Date("2026-11-01T05:30:00.000Z"),
  );
  const repeatedOneThirty = assessEligibility(
    scholarship,
    {},
    new Date("2026-11-01T06:30:00.000Z"),
  );
  const followingMidnight = assessEligibility(
    scholarship,
    {},
    new Date("2026-11-02T05:00:00.000Z"),
  );

  assert.equal(firstOneThirty.isExpired, false);
  assert.equal(repeatedOneThirty.isExpired, false);
  assert.equal(followingMidnight.isExpired, true);
});

test("applies each IANA zone's DST rules instead of treating the UTC date as the deadline date", () => {
  const instant = new Date("2026-11-02T06:30:00.000Z");
  assert.equal(calendarDateKey(instant, "America/New_York"), "2026-11-02");
  assert.equal(calendarDateKey(instant, "America/Phoenix"), "2026-11-01");

  const eastern = assessEligibility(
    { deadline: "2026-11-01", deadlineTimezone: "America/New_York", criteria: {} },
    {},
    instant,
  );
  const arizona = assessEligibility(
    { deadline: "2026-11-01", deadlineTimezone: "America/Phoenix", criteria: {} },
    {},
    instant,
  );

  assert.equal(eastern.isExpired, true);
  assert.equal(arizona.isExpired, false);
});

test("does not guess expiry when the stated sponsor time zone is invalid", () => {
  const assessment = assessEligibility(
    { deadline: "2026-11-12", deadlineTimezone: "Central Time-ish", criteria: {} },
    {},
    new Date("2026-11-13T06:00:00.000Z"),
  );

  assert.equal(assessment.isExpired, false);
  assert.equal(assessment.status, "Needs information");
  assert.equal(assessment.checks.find((item) => item.label === "Deadline time zone").outcome, "unknown");
});
