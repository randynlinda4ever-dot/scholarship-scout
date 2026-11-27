import test from "node:test";
import assert from "node:assert/strict";
import { pickLiveDiscoveryProfile } from "../src/lib/liveDiscoveryProfile.js";

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