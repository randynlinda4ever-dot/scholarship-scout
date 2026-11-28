import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../src/App.tsx", import.meta.url);
const cloudMappingUrl = new URL("../src/lib/cloudMapping.js", import.meta.url);

test("application workspace persists to local storage and is included in encrypted backups", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /localStorage\.getItem\('scout-application-workspace'\)/);
  assert.match(app, /persistLocalJsonState\(\s*'scout-application-workspace'/);
  assert.match(app, /buildScoutBackup\(profile, items, new Date\(\), applicationProgress, applicationWorkspace, profileDraft, resourceWorkspace\)/);
  assert.match(app, /normalizeApplicationWorkspace\(imported\.applicationWorkspace, restoredScholarshipIds\)/);
  assert.match(app, /scout-resource-workspace/);
});

test("application workspace contains a user-confirmed local submission record, not a submit integration", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.match(app, /window\.confirm\('Record '/);
  assert.match(app, /applicationStatus: 'Submitted', submittedAt: localToday\(\)/);
  assert.match(app, /it does not send an application to the sponsor/);
  assert.doesNotMatch(app, /submitApplicationToSponsor|sendScholarshipApplication/);
});

test("cloud sponsor mapping does not accept essays, recommendation notes, or application workspace data", async () => {
  const mapping = await readFile(cloudMappingUrl, "utf8");
  assert.doesNotMatch(mapping, /applicationWorkspace|recommenders|essayDraft|essayPrompt/);
  assert.match(mapping, /const CRITERIA_FIELDS = \[/);
  assert.match(mapping, /free-form notes may contain personal information; keep them local/i);
});
