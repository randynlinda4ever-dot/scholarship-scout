import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TRACKER_RECORDS } from "../src/lib/trackerManagement.js";
import {
  APPLICATION_CHECKLIST_STEPS,
  getApplicationProgressSummary,
  normalizeApplicationProgress,
  updateApplicationProgress,
} from "../src/lib/applicationProgress.js";

test("normalizes saved progress for known scholarship IDs and fixed checklist length", () => {
  const normalized = normalizeApplicationProgress(JSON.parse('{"award-1":[true,false,"yes",true,false,true,true],"unknown-award":[true],"__proto__":[true]}'), ["award-1"]);

  assert.deepEqual(normalized["award-1"], [true, false, false, true, false, true]);
  assert.equal(normalized["unknown-award"], undefined);
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
});

test("updates one scholarship checklist without changing other records or the original object", () => {
  const before = {
    "award-1": [true, false, false, false, false, false],
    "award-2": [false, true, false, false, false, false],
  };
  const updated = updateApplicationProgress(before, "award-1", 2, true);

  assert.deepEqual(updated["award-1"], [true, false, true, false, false, false]);
  assert.deepEqual(updated["award-2"], before["award-2"]);
  assert.deepEqual(before["award-1"], [true, false, false, false, false, false]);
});

test("rejects invalid scholarship IDs and checklist indexes", () => {
  const before = { "award-1": [true, false, false, false, false, false] };
  assert.deepEqual(updateApplicationProgress(before, "", 1, true), before);
  assert.deepEqual(updateApplicationProgress(before, "award-1", -1, true), before);
  assert.deepEqual(updateApplicationProgress(before, "award-1", 99, true), before);
});

test("summarizes completed checklist steps and exposes the shared checklist length", () => {
  const summary = getApplicationProgressSummary({
    "award-1": [true, true, false, true, false, false],
  }, "award-1");

  assert.equal(APPLICATION_CHECKLIST_STEPS.length, 6);
  assert.deepEqual(summary, { completed: 3, total: 6, percent: 50 });
});

test("preserves checklist progress beyond the former 500-record cutoff", () => {
  const source = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [
    `s-${index}`, [true, false, false, false, false, false],
  ]));
  const normalized = normalizeApplicationProgress(source);
  assert.equal(MAX_TRACKER_RECORDS, 2000);
  assert.equal(Object.keys(normalized).length, 600);
});

test("summary handles reserved IDs and invalid or oversized step counts safely", () => {
  assert.deepEqual(getApplicationProgressSummary({}, "__proto__"), { completed: 0, total: 6, percent: 0 });
  assert.deepEqual(getApplicationProgressSummary({}, "award-1", -1), { completed: 0, total: 6, percent: 0 });
  assert.deepEqual(getApplicationProgressSummary({}, "award-1", "6"), { completed: 0, total: 6, percent: 0 });
  assert.deepEqual(getApplicationProgressSummary({}, "award-1", 100), { completed: 0, total: 50, percent: 0 });
});
