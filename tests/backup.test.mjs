import test from "node:test";
import assert from "node:assert/strict";
import { buildScoutBackup, validateScoutBackup } from "../src/lib/backup.js";
import { createApplicationWorkspace } from "../src/lib/applicationWorkspace.js";

const profileKeys = ["grade", "graduationYear"];
const profile = { grade: "senior", graduationYear: "2027" };
const scholarships = [{ id: "s-1", name: "Example award", provider: "Example sponsor", criteria: { minGpa: 3 } }];
const applicationProgress = { "s-1": [true, false, true, false, false, false] };
const applicationWorkspace = { "s-1": createApplicationWorkspace() };
const valid = () => buildScoutBackup(
  profile,
  scholarships,
  new Date("2026-11-10T18:00:00.000Z"),
  applicationProgress,
  applicationWorkspace,
);

test("backup captures profile, tracker, checklist, and workspace in version two", () => {
  const backup = valid();
  assert.equal(backup.format, "scholarship-scout-backup");
  assert.equal(backup.version, 2);
  assert.deepEqual(backup.profile, profile);
  assert.deepEqual(backup.scholarships, scholarships);
  assert.deepEqual(backup.applicationProgress, applicationProgress);
  assert.deepEqual(backup.applicationWorkspace, applicationWorkspace);
});

test("backup contains independent snapshots rather than mutable references", () => {
  const sourceProfile = { ...profile };
  const sourceItems = structuredClone(scholarships);
  const sourceWorkspace = structuredClone(applicationWorkspace);
  const backup = buildScoutBackup(sourceProfile, sourceItems, new Date(0), {}, sourceWorkspace);
  sourceProfile.grade = "changed";
  sourceItems[0].criteria.minGpa = 4;
  sourceWorkspace["s-1"].documents[0].title = "changed";
  assert.equal(backup.profile.grade, "senior");
  assert.equal(backup.scholarships[0].criteria.minGpa, 3);
  assert.notEqual(backup.applicationWorkspace["s-1"].documents[0].title, "changed");
});

test("accepts a valid version-two backup and returns normalized data", () => {
  const result = validateScoutBackup(valid(), profileKeys);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.profile, profile);
    assert.deepEqual(result.value.scholarships, scholarships);
    assert.deepEqual(result.value.applicationProgress, applicationProgress);
    assert.deepEqual(result.value.applicationWorkspace, applicationWorkspace);
  }
});

test("rejects unsupported versions, malformed profile fields, and invalid records", () => {
  const unsupported = { ...valid(), version: 99 };
  const badProfile = { ...valid(), profile: { grade: 12, unknownField: "x" } };
  const badScholarship = { ...valid(), scholarships: [{ id: "", name: "Missing ID" }] };
  const badProgress = { ...valid(), applicationProgress: { "unknown-id": [true] } };
  const malformedProgress = { ...valid(), applicationProgress: { "s-1": [true, "yes"] } };
  assert.equal(validateScoutBackup(unsupported, profileKeys).ok, false);
  assert.equal(validateScoutBackup(badProfile, profileKeys).ok, false);
  assert.equal(validateScoutBackup(badScholarship, profileKeys).ok, false);
  assert.equal(validateScoutBackup(badProgress, profileKeys).ok, false);
  assert.equal(validateScoutBackup(malformedProgress, profileKeys).ok, false);
});

test("rejects workspace records that reference unknown scholarships or contain invalid fields", () => {
  const unknownScholarship = { ...valid(), applicationWorkspace: { "other": createApplicationWorkspace() } };
  const malformedEssay = {
    ...valid(),
    applicationWorkspace: {
      "s-1": {
        ...createApplicationWorkspace(),
        essays: [{ id: "e1", title: "Essay", prompt: "Prompt", wordLimit: "300", draft: "Draft" }],
      },
    },
  };
  assert.equal(validateScoutBackup(unknownScholarship, profileKeys).ok, false);
  assert.equal(validateScoutBackup(malformedEssay, profileKeys).ok, false);
});

test("keeps older version-one backups valid when checklist progress and workspace are absent", () => {
  const olderBackup = { ...valid(), version: 1 };
  delete olderBackup.applicationProgress;
  delete olderBackup.applicationWorkspace;
  const result = validateScoutBackup(olderBackup, profileKeys);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.applicationProgress, {});
    assert.deepEqual(result.value.applicationWorkspace, {});
  }
});

test("rejects oversized or excessive backups", () => {
  const tooLarge = { ...valid(), profile: { grade: "x".repeat(2_100_000) } };
  const tooMany = { ...valid(), scholarships: Array.from({ length: 501 }, (_, i) => ({ id: String(i), name: "Award", provider: "Sponsor" })) };
  assert.equal(validateScoutBackup(tooLarge, profileKeys).ok, false);
  assert.equal(validateScoutBackup(tooMany, profileKeys).ok, false);
});

test("rejects prototype-reserved and duplicate scholarship IDs", () => {
  for (const id of ["__proto__", "prototype", "constructor"]) {
    const input = { ...valid(), scholarships: [{ ...scholarships[0], id }] };
    assert.equal(validateScoutBackup(input, profileKeys).ok, false, id);
  }
  const duplicate = { ...valid(), scholarships: [{ ...scholarships[0] }, { ...scholarships[0] }] };
  assert.equal(validateScoutBackup(duplicate, profileKeys).ok, false);
});

test("sanitizes imported source and evidence URLs before returning records", () => {
  const input = {
    ...valid(),
    scholarships: [{
      ...scholarships[0],
      sourceUrl: "https://example.org/award?access_token=private&page=2#session=private",
      evidenceUrl: "javascript:alert(1)",
      awardEvidenceUrl: "https://example.org/award?email=student%40example.test",
      criteriaEvidence: { minGpa: { excerpt: "Official GPA rule", sourceUrl: "https://example.org/rules?studentId=123" } },
    }],
  };
  const result = validateScoutBackup(input, profileKeys);
  assert.equal(result.ok, true);
  if (result.ok) {
    const item = result.value.scholarships[0];
    assert.equal(new URL(item.sourceUrl).protocol, "https:");
    assert.equal(item.sourceUrl.includes("private"), false);
    assert.equal(new URL(item.sourceUrl).hash, "");
    assert.equal(item.evidenceUrl, "");
    assert.equal(item.awardEvidenceUrl.includes("student%40example.test"), false);
    assert.equal(item.criteriaEvidence.minGpa.sourceUrl.includes("123"), false);
  }
});
