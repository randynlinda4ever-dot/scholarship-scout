import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_PROFILE,
  DEMO_SCHOLARSHIPS,
  filterDemoScholarships,
} from "../src/features/agent-demo/agentDemoData.js";

test("demo content is entirely synthetic and clearly marked for testing", () => {
  assert.match(DEMO_PROFILE.note, /Fictional/);
  assert.equal(DEMO_SCHOLARSHIPS.length, 5);
  assert.ok(DEMO_SCHOLARSHIPS.every((item) => item.id.startsWith("demo-")));
  assert.ok(DEMO_SCHOLARSHIPS.every((item) => item.stateEligibility.length > 0));
});

test("demo search matches scholarship names, sponsors, summaries, and categories", () => {
  assert.deepEqual(
    filterDemoScholarships(DEMO_SCHOLARSHIPS, { query: "northstar" }).map((item) => item.id),
    ["demo-northstar-stem"],
  );
  assert.equal(
    filterDemoScholarships(DEMO_SCHOLARSHIPS, { query: "humanities" }).length,
    1,
  );
});

test("demo state and category filters compose without mutating source data", () => {
  const results = filterDemoScholarships(DEMO_SCHOLARSHIPS, {
    state: "TX",
    category: "STEM",
  });
  assert.deepEqual(results.map((item) => item.id), ["demo-northstar-stem"]);
  assert.equal(DEMO_SCHOLARSHIPS.length, 5);
});
