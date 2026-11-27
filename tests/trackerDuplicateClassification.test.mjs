import test from "node:test";
import assert from "node:assert/strict";
import { findPotentialDuplicates } from "../src/lib/trackerInsights.js";

const pair = (firstName, secondName) => findPotentialDuplicates([
  { id: "first", name: firstName, provider: "Civic Foundation", deadline: "2027-03-01" },
  { id: "second", name: secondName, provider: "Civic Foundation", deadline: "2027-04-15" },
])[0];

test("classifies identical normalized scholarship titles as exact matches", () => {
  const result = pair(
    "Hispanic Heritage Scholarship",
    "  HISPANIC-HERITAGE Scholarships! ",
  );

  assert.equal(result?.matchType, "exact");
  assert.equal(result?.matchLabel, "Exact title match");
  assert.equal(result?.titleSimilarity, 100);
});

test("classifies high but non-identical title similarity as a strong match", () => {
  const result = pair(
    "Community Service Volunteer Scholarship",
    "Community Service Volunteer Scholarship Leadership",
  );

  assert.equal(result?.matchType, "strong");
  assert.equal(result?.matchLabel, "Strong similarity");
  assert.ok(result?.titleSimilarity >= 85 && result.titleSimilarity < 100);
});

test("classifies lower-threshold title similarity as a possible match", () => {
  const result = pair(
    "Community Service Volunteer Scholarship",
    "Community Service Volunteer Scholarship Leadership Award",
  );

  assert.equal(result?.matchType, "possible");
  assert.equal(result?.matchLabel, "Possible similarity");
  assert.ok(result?.titleSimilarity >= 80 && result.titleSimilarity < 85);
});

test("keeps the sponsor and deadline-year requirements for every classification", () => {
  const results = findPotentialDuplicates([
    { id: "a", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2027-03-01" },
    { id: "b", name: "Hispanic Heritage Scholarship", provider: "Different Foundation", deadline: "2027-04-01" },
    { id: "c", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2028-04-01" },
  ]);

  assert.deepEqual(results, []);
});

test("retains original records unchanged and emits separate non-destructive suggestions", () => {
  const records = [
    { id: "a", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2027-03-01", notes: "first" },
    { id: "b", name: "Hispanic Heritage Scholarships", provider: "Civic Foundation", deadline: "2027-04-01", notes: "second" },
  ];
  const before = structuredClone(records);
  const results = findPotentialDuplicates(records);

  assert.equal(results.length, 1);
  assert.deepEqual(records, before);
  assert.notEqual(records[0], records[1]);
});
