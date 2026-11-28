import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveDiscoveryPayload, pickLiveDiscoveryProfile } from "../src/lib/liveDiscoveryProfile.js";

test("projects only state and a complete four-digit graduation year", () => {
  assert.deepEqual(
    pickLiveDiscoveryProfile({
      state: " Texas ",
      graduationYear: "2027",
      school: "PRIVATE-SCHOOL-SENTINEL",
      gpa: "PRIVATE-GPA-SENTINEL",
      email: "PRIVATE-EMAIL-SENTINEL",
    }),
    { state: "Texas", graduationYear: "2027" },
  );
});

test("does not turn malformed graduation years into valid four-digit prefixes", () => {
  for (const graduationYear of ["2027.5", "2027junk", "2027junk ", "202"]) {
    assert.deepEqual(
      pickLiveDiscoveryProfile({ state: "Texas", graduationYear }),
      { state: "Texas", graduationYear: "" },
      graduationYear,
    );
  }
});

test("public discovery payload serializes exactly the three approved request fields", () => {
  const payload = buildLiveDiscoveryPayload({
    state: " Texas ",
    graduationYear: "2027",
    school: "PRIVATE-SCHOOL-SENTINEL",
    gpa: "PRIVATE-GPA-SENTINEL",
    classRank: "PRIVATE-RANK-SENTINEL",
    email: "PRIVATE-EMAIL-SENTINEL",
    phone: "PRIVATE-PHONE-SENTINEL",
    resume: "PRIVATE-RESUME-SENTINEL",
    familyIncome: "PRIVATE-INCOME-SENTINEL",
  }, ["local", "academic"]);

  const serialized = JSON.stringify(payload);
  assert.equal(serialized, JSON.stringify({
    state: "Texas",
    graduationYear: "2027",
    categories: ["local", "academic"],
  }));
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), ["categories", "graduationYear", "state"]);
  for (const sentinel of [
    "PRIVATE-SCHOOL-SENTINEL", "PRIVATE-GPA-SENTINEL", "PRIVATE-RANK-SENTINEL",
    "PRIVATE-EMAIL-SENTINEL", "PRIVATE-PHONE-SENTINEL", "PRIVATE-RESUME-SENTINEL",
    "PRIVATE-INCOME-SENTINEL",
  ]) assert.equal(serialized.includes(sentinel), false, sentinel);
});

test("rejects missing or oversized state values before a request can be built", () => {
  assert.throws(() => buildLiveDiscoveryPayload({ state: "  ", graduationYear: "2027" }, ["local"]), /valid state/);
  assert.throws(() => buildLiveDiscoveryPayload({ state: "x".repeat(61), graduationYear: "2027" }, ["local"]), /valid state/);
});

test("rejects malformed graduation years before a request can be built", () => {
  for (const graduationYear of ["", "202", "2027.5", "2027junk", 20275, null]) {
    assert.throws(
      () => buildLiveDiscoveryPayload({ state: "Texas", graduationYear }, ["local"]),
      /four-digit graduation year/,
    );
  }
});

test("rejects empty, unsupported, duplicated, or oversized category selections", () => {
  for (const categories of [[], ["not-a-category"], ["local", "local"], Array(15).fill("local")]) {
    assert.throws(
      () => buildLiveDiscoveryPayload({ state: "Texas", graduationYear: "2027" }, categories),
      /supported|duplicated/,
    );
  }
});

test("accepts all supported categories at most once", () => {
  const categories = [
    "local", "school_resources", "regional", "state", "academic", "humanities",
    "leadership", "community_service", "language", "employment", "arts",
    "incoming_college", "national", "general",
  ];
  const payload = buildLiveDiscoveryPayload({ state: "Texas", graduationYear: "2027" }, categories);
  assert.deepEqual(payload.categories, categories);
});
