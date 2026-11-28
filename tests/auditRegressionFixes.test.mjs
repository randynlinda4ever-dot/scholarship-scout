import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stateMatchesText } from "../supabase/functions/_shared/us-states.mjs";
import { assessEligibility } from "../src/eligibility.js";
import { rankAndDeduplicateLiveResults } from "../src/lib/discoveryPipeline.js";
import { findPotentialDuplicates } from "../src/lib/trackerInsights.js";
import { buildScoutBackup, validateScoutBackup } from "../src/lib/backup.js";

const sponsorSourceUrl = "https://www.aatspshh.org/scholarships/example";
const criterionEvidenceFor = (criteria) => Object.fromEntries(
  Object.keys(criteria).map((key) => [key, {
    excerpt: "Official sponsor requirement for " + key + ".",
    sourceUrl: sponsorSourceUrl,
  }]),
);
const profile = {
  state: "Texas",
  grade: "high-school senior",
  graduationYear: "2027",
  gpa: "3.8",
  act: "30",
  sat: "1300",
  serviceHours: "40",
  activities: "",
};
const fixedNow = new Date("2026-11-25T12:00:00.000Z");

test("state relevance requires a standalone uppercase postal abbreviation", () => {
  assert.equal(stateMatchesText("Applicants in any county may apply.", "IN"), false);
  assert.equal(stateMatchesText("Scholarships or grants for students.", "OR"), false);
  assert.equal(stateMatchesText("Residents of IN may apply.", "IN"), true);
  assert.equal(stateMatchesText("Indiana residents may apply.", "IN"), true);
  assert.equal(stateMatchesText("indiana residents may apply.", "Indiana"), true);
  assert.equal(stateMatchesText("Indianapolis residents may apply.", "IN"), false);
});

test("frontend relevance preserves postal-code case and filters ordinary-word collisions", () => {
  const [ordinaryIn] = rankAndDeduplicateLiveResults([{
    title: "Scholarship information for students",
    source_url: "https://example.org/ordinary-in",
    excerpt: "Applicants in nearby counties may apply.",
  }], { state: "IN" });
  const [ordinaryOr] = rankAndDeduplicateLiveResults([{
    title: "Scholarships or grants for students",
    source_url: "https://example.org/ordinary-or",
    excerpt: "Awards are available nationwide.",
  }], { state: "OR" });
  const [uppercaseCode] = rankAndDeduplicateLiveResults([{
    title: "Scholarship opportunities for students",
    source_url: "https://example.org/uppercase-code",
    excerpt: "Residents of IN may apply.",
  }], { state: "Indiana" });
  const [fullName] = rankAndDeduplicateLiveResults([{
    title: "Indiana student scholarship",
    source_url: "https://example.org/indiana",
    excerpt: "Awards for residents.",
  }], { state: "IN" });

  assert.equal(ordinaryIn.relevance_reasons.includes("Matches your state"), false);
  assert.equal(ordinaryOr.relevance_reasons.includes("Matches your state"), false);
  assert.equal(uppercaseCode.relevance_reasons.includes("Matches your state"), true);
  assert.equal(fullName.relevance_reasons.includes("Matches your state"), true);
});

test("invalid or out-of-range profile numerics remain unknown, never false failures", () => {
  const cases = [
    [{ minGpa: 3.5 }, { gpa: "-5" }, "Minimum GPA"],
    [{ minGpa: 3.5 }, { gpa: "5.1" }, "Minimum GPA"],
    [{ minAct: 24 }, { act: "37" }, "ACT minimum"],
    [{ minAct: 24 }, { act: "-1" }, "ACT minimum"],
    [{ minSat: 1200 }, { sat: "1601" }, "SAT minimum"],
    [{ minSat: 1200 }, { sat: "399" }, "SAT minimum"],
    [{ minServiceHours: 10 }, { serviceHours: "-5" }, "Community service"],
    [{ minServiceHours: 10 }, { serviceHours: "1,2" }, "Community service"],
    [{ minServiceHours: 10 }, { serviceHours: "1000001" }, "Community service"],
  ];

  for (const [criteria, profilePatch, label] of cases) {
    const assessment = assessEligibility({
      criteria,
      sourceUrl: sponsorSourceUrl,
      criteriaEvidence: criterionEvidenceFor(criteria),
    }, { ...profile, ...profilePatch }, fixedNow);
    assert.equal(assessment.checks.find((item) => item.label === label)?.outcome, "unknown", label);
    assert.equal(assessment.failed, 0, label);
  }
});

test("negative and excessive sponsor service-hour thresholds remain unknown", () => {
  for (const threshold of [-1, 1_000_001, "not-a-number"]) {
    const criteria = { minServiceHours: threshold };
    const assessment = assessEligibility({
      criteria,
      sourceUrl: sponsorSourceUrl,
      criteriaEvidence: criterionEvidenceFor(criteria),
    }, profile, fixedNow);
    assert.equal(assessment.checks.find((item) => item.label === "Community service")?.outcome, "unknown");
    assert.equal(assessment.failed, 0);
  }
});

test("false and trimmed/case-insensitive any values are not mandatory sponsor rules", () => {
  for (const criteria of [
    { requiresShhMembership: false },
    { schoolState: "any" },
    { schoolState: " ANY " },
    { schoolState: "Any" },
  ]) {
    const assessment = assessEligibility({
      criteria,
      sourceUrl: sponsorSourceUrl,
      criteriaEvidence: criterionEvidenceFor(criteria),
    }, profile, fixedNow);
    assert.equal(
      assessment.checks.find((item) => item.label === "Mandatory eligibility criteria")?.outcome,
      "unknown",
    );
  }
});

test("grouped duplicate checks preserve original indices and do not cross sponsor/year groups", () => {
  const results = findPotentialDuplicates([
    null,
    { id: "other", name: "Hispanic Heritage Scholarship", provider: "Other Foundation", deadline: "2027-03-01" },
    { id: "a", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2027-03-01" },
    { id: "b", name: "Hispanic Heritage Scholarships", provider: "Civic Foundation", deadline: "2027-04-15" },
    { id: "c", name: "Hispanic Heritage Scholarship", provider: "Civic Foundation", deadline: "2028-03-01" },
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].firstIndex, 2);
  assert.equal(results[0].secondIndex, 3);
  assert.equal(results[0].firstId, "a");
  assert.equal(results[0].secondId, "b");
});

test("backup import sanitizes criteria evidence URLs inside source history", () => {
  const backup = buildScoutBackup(
    { grade: "senior", graduationYear: "2027" },
    [{
      id: "history-record",
      name: "Example award",
      provider: "Example sponsor",
      criteria: {},
      sourceEvidenceHistory: [{
        recordedAt: "2026-11-25T12:00:00.000Z",
        criteriaEvidence: {
          minimumGpa: {
            excerpt: "Synthetic historical criterion.",
            sourceUrl: "https://example.org/rules?email=student%40example.test&page=2",
          },
        },
      }],
    }],
  );
  const imported = validateScoutBackup(backup, ["grade", "graduationYear"]);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;

  assert.equal(
    imported.value.scholarships[0].sourceEvidenceHistory[0].criteriaEvidence.minimumGpa.sourceUrl,
    "https://example.org/rules?page=2",
  );
});

test("encrypted backup export validates the plaintext payload and import allows encryption overhead", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const start = app.indexOf("const exportEncryptedBackup");
  const end = app.indexOf("const restoreLocalBackup", start);
  assert.ok(start >= 0 && end > start);
  const exportHandler = app.slice(start, end);
  assert.match(exportHandler, /buildScoutBackup\(profile, items, new Date\(\), applicationProgress, applicationWorkspace, profileDraft, resourceWorkspace\)/);
  assert.match(exportHandler, /validateScoutBackup\(backup, Object\.keys\(initialProfile\)\)/);
  assert.match(exportHandler, /const validatedBackup = \{ \.\.\.backup, \.\.\.validation\.value \}/);

  const importStart = app.indexOf("const importLocalBackup");
  const importEnd = app.indexOf("const importEncryptedBackup", importStart);
  assert.ok(importStart >= 0 && importEnd > importStart);
  assert.match(app.slice(importStart, importEnd), /file\.size > MAX_ENCRYPTED_BACKUP_FILE_BYTES/);
});

test("backup restore waits for encrypted persistence before reporting success", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const start = app.indexOf("const restoreLocalBackup");
  const end = app.indexOf("const confirmRestoreLocalBackup", start);
  assert.ok(start >= 0 && end > start);
  const restoreHandler = app.slice(start, end);
  assert.match(restoreHandler, /await flushLocalVault\(\)/);
  assert.match(restoreHandler, /mergeProfile\(imported\.profileDraft \?\? imported\.profile\)/);
  assert.match(restoreHandler, /previousStorage = Object\.fromEntries/);
});

test("encrypted backup modal clears passwords on failure and re-focuses when the restore preview changes", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const start = app.indexOf("const exportEncryptedBackup");
  const end = app.indexOf("const restoreLocalBackup", start);
  const exportHandler = app.slice(start, end);
  assert.match(exportHandler, /finally\s*\{\s*backupBusyRef\.current = false;\s*setBackupPassword\(''\);\s*setBackupPasswordConfirm\(''\);\s*setBackupBusy\(false\);\s*\}/);
  assert.match(app, /backupBusyRef\.current = backupBusy;/);
  assert.match(app, /\}, \[showAdd, selected\?\.id, backupDialogMode, backupPendingRestore\]\);/);
});
