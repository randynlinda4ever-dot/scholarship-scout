import test from "node:test";
import assert from "node:assert/strict";
import { validateProfileChanges } from "../src/lib/profileValidation.js";

test("allows blank optional numeric profile fields", () => {
  const result = validateProfileChanges({}, {
    graduationYear: "",
    gpa: "",
    act: "",
    sat: "",
    serviceHours: "",
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("rejects malformed or impossible graduation years", () => {
  assert.equal(validateProfileChanges({ graduationYear: "" }, { graduationYear: "1899" }).valid, false);
  assert.equal(validateProfileChanges({ graduationYear: "" }, { graduationYear: "2101" }).valid, false);
  assert.equal(validateProfileChanges({ graduationYear: "" }, { graduationYear: "2027.5" }).valid, false);
  assert.equal(validateProfileChanges({ graduationYear: "" }, { graduationYear: "2025" }).valid, true);
  assert.equal(validateProfileChanges({ graduationYear: "" }, { graduationYear: "2027" }).valid, true);
});

test("accepts optional whole-year ages from 0 through 120 and rejects invalid ages", () => {
  assert.equal(validateProfileChanges({ age: "" }, { age: "" }).valid, true);
  assert.equal(validateProfileChanges({ age: "" }, { age: "0" }).valid, true);
  assert.equal(validateProfileChanges({ age: "" }, { age: "120" }).valid, true);
  assert.equal(validateProfileChanges({ age: "" }, { age: "-1" }).valid, false);
  assert.equal(validateProfileChanges({ age: "" }, { age: "121" }).valid, false);
  assert.equal(validateProfileChanges({ age: "" }, { age: "18.5" }).valid, false);
  assert.equal(validateProfileChanges({ age: "" }, { age: "eighteen" }).valid, false);
});

test("rejects ACT and SAT scores outside their score ranges", () => {
  assert.equal(validateProfileChanges({ act: "" }, { act: "37" }).valid, false);
  assert.equal(validateProfileChanges({ act: "" }, { act: "1" }).valid, true);
  assert.equal(validateProfileChanges({ sat: "" }, { sat: "399" }).valid, false);
  assert.equal(validateProfileChanges({ sat: "" }, { sat: "1600" }).valid, true);
  assert.equal(validateProfileChanges({ sat: "" }, { sat: "1455" }).valid, false);
  assert.equal(validateProfileChanges({ sat: "" }, { sat: "1450" }).valid, true);
});

test("rejects negative and nonnumeric service-hour values", () => {
  assert.equal(validateProfileChanges({ serviceHours: "" }, { serviceHours: "-1" }).valid, false);
  assert.equal(validateProfileChanges({ serviceHours: "" }, { serviceHours: "many" }).valid, false);
  assert.equal(validateProfileChanges({ serviceHours: "" }, { serviceHours: "42.5" }).valid, true);
});

test("validates GPA numerically and respects an explicitly entered scale", () => {
  assert.equal(validateProfileChanges({ gpa: "" }, { gpa: "three point nine" }).valid, false);
  assert.equal(validateProfileChanges({ gpa: "" }, { gpa: "-0.1" }).valid, false);
  assert.equal(validateProfileChanges({ gpa: "", gpaType: "Unweighted 4.0 scale" }, { gpa: "4.1", gpaType: "Unweighted 4.0 scale" }).valid, false);
  assert.equal(validateProfileChanges({ gpa: "", gpaType: "Weighted 5.0 scale" }, { gpa: "4.8", gpaType: "Weighted 5.0 scale" }).valid, true);
  assert.equal(validateProfileChanges({ gpa: "" }, { gpa: "4.8" }).valid, true);
});

test("does not block unrelated profile edits because of older unchanged values", () => {
  const previous = { act: "42", interests: "history" };
  const next = { act: "42", interests: "science and engineering" };
  assert.deepEqual(validateProfileChanges(previous, next), { valid: true, errors: [] });
});

test("accepts valid residence, school, and planned-college states without country fields", () => {
  assert.equal(validateProfileChanges({}, { state: "Texas" }).valid, true);
  assert.equal(validateProfileChanges({}, { schoolState: "TX" }).valid, true);
  assert.equal(validateProfileChanges({}, { plannedCollegeState: "California" }).valid, true);
});

test("rejects invalid state values and trims citizenship before validation", () => {
  assert.equal(validateProfileChanges({}, { state: "Atlantis" }).valid, false);
  assert.equal(validateProfileChanges({}, { citizenship: "U.S. citizen " }).valid, true);
});
