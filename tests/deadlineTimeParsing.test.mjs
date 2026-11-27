import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScholarshipRecord, parseSponsorDeadlineTime } from "../src/lib/evidence.js";

test("parses an explicit 12-hour cutoff and retains its stated IANA zone as source wording", () => {
  const deadlineText = "February 15, 2027 at 11:59 PM America/Chicago";
  assert.deepEqual(parseSponsorDeadlineTime(deadlineText), {
    time: "23:59",
    timeZoneText: "America/Chicago",
  });

  const normalized = normalizeScholarshipRecord({
    deadline: "2027-02-15",
    deadlineText,
    criteria: {},
  });
  assert.equal(normalized.deadlineTime, "23:59");
  assert.equal(normalized.deadlineTimezone, "");
  assert.equal(normalized.deadlineTimezoneText, "America/Chicago");
});
test("clears previously parsed time and zone when edited sponsor wording no longer states them", () => {
  const original = normalizeScholarshipRecord({
    deadline: "2027-02-15",
    deadlineText: "February 15, 2027 at 11:59 PM America/Chicago",
    criteria: {},
  });
  const edited = normalizeScholarshipRecord({
    ...original,
    deadlineText: "February 15, 2027",
  });

  assert.equal(edited.deadlineTime, "");
  assert.equal(edited.deadlineTimezoneText, "");
  assert.equal(edited.deadlineTimezone, "");
});


test("parses an explicit 24-hour cutoff and retains a stated abbreviation verbatim", () => {
  assert.deepEqual(
    parseSponsorDeadlineTime("Applications close at 17:30 CT"),
    { time: "17:30", timeZoneText: "CT" },
  );
});

test("does not invent a cutoff time or time zone when the sponsor states neither", () => {
  assert.equal(parseSponsorDeadlineTime("February 15, 2027"), null);
  const normalized = normalizeScholarshipRecord({
    deadline: "2027-02-15",
    deadlineText: "February 15, 2027",
    criteria: {},
  });
  assert.equal(normalized.deadlineTime, "");
  assert.equal(normalized.deadlineTimezone, "");
  assert.equal(normalized.deadlineTimezoneText, "");
});

test("preserves a sponsor-stated time-zone label without mapping it to an assumed zone", () => {
  const original = "February 15, 2027 at 11:59 PM Central Time";
  const normalized = normalizeScholarshipRecord({
    deadline: "2027-02-15",
    deadlineText: original,
    criteria: {},
  });
  assert.equal(normalized.deadlineText, original);
  assert.equal(normalized.deadlineTime, "23:59");
  assert.equal(normalized.deadlineTimezoneText, "Central Time");
  assert.equal(normalized.deadlineTimezone, "");
});

test("leaves multiple possible cutoff times unparsed instead of choosing one", () => {
  assert.equal(
    parseSponsorDeadlineTime("Portal opens at 9:00 AM and closes at 5:00 PM"),
    null,
  );
});

test("accepts dotted 12-hour sponsor time notation", () => {
  assert.deepEqual(
    parseSponsorDeadlineTime("Deadline: 11:59 p.m. CT"),
    { time: "23:59", timeZoneText: "CT" },
  );
});

test("retains a recognized sponsor time zone stated before the cutoff time", () => {
  assert.deepEqual(
    parseSponsorDeadlineTime("Deadline: Eastern Standard Time, 11:59 PM"),
    { time: "23:59", timeZoneText: "Eastern Standard Time" },
  );
});

test("retains an IANA zone stated before a 24-hour cutoff", () => {
  assert.deepEqual(
    parseSponsorDeadlineTime("Deadline: America/Chicago, 17:30"),
    { time: "17:30", timeZoneText: "America/Chicago" },
  );
});
