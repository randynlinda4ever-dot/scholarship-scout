import test from "node:test";
import assert from "node:assert/strict";
import { buildManualSearchQueries } from "../src/lib/manualSearchQueries.js";

test("manual search suggestions are generic and independent of student profile data", () => {
  const profile = {
    state: "Texas",
    county: "Travis County",
    school: "Example High School",
    plannedMajor: "Anthropology",
    plannedCollege: "Example University",
    graduationYear: "2027",
    interests: "student profile sentinel",
  };
  const queries = buildManualSearchQueries(profile);
  assert.equal(queries.length, 8);
  assert.ok(queries.every((item) => typeof item.title === "string" && typeof item.query === "string"));
  const serialized = JSON.stringify(queries).toLowerCase();
  for (const value of Object.values(profile)) {
    assert.equal(serialized.includes(String(value).toLowerCase()), false);
  }
});
