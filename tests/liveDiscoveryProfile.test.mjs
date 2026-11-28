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
test("public discovery payload contains exactly the three approved request fields", () => {
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

  assert.deepEqual(Object.keys(payload).sort(), ["categories", "graduationYear", "state"]);
  assert.deepEqual(payload, {
    state: "Texas",
    graduationYear: "2027",
    categories: ["local", "academic"],
  });
  const serialized = JSON.stringify(payload);
  for (const sentinel of [
    "PRIVATE-SCHOOL-SENTINEL", "PRIVATE-GPA-SENTINEL", "PRIVATE-RANK-SENTINEL",
    "PRIVATE-EMAIL-SENTINEL", "PRIVATE-PHONE-SENTINEL", "PRIVATE-RESUME-SENTINEL",
    "PRIVATE-INCOME-SENTINEL",
  ]) assert.equal(serialized.includes(sentinel), false, sentinel);
});
