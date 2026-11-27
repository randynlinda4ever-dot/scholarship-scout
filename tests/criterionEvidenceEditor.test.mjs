import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWorkspaceSource } from './helpers/workspaceSource.mjs';

const app = await readWorkspaceSource();

test("scholarship editor collects a URL and excerpt for every active structured criterion", () => {
  assert.match(app, /criteriaEvidence\?: Record<string, \{ excerpt\?: string; sourceUrl\?: string \}>/);
  assert.match(app, /const setCriterionEvidence =/);
  assert.match(app, /const activeCriterionEntries = Object\.entries\(draft\.criteria\)/);
  assert.match(app, /Public sponsor evidence for each criterion/);
  assert.match(app, /same recognized official sponsor domain/);
  assert.match(app, /Each structured rule needs its own short excerpt and exact HTTPS page URL/);
  assert.match(app, /Exact official page URL for this rule/);
  assert.match(app, /setCriterionEvidence\(key,\{sourceUrl:v\}\)/);
  assert.match(app, /setCriterionEvidence\(key,\{excerpt:e\.target\.value\}\)/);
});

test("labels each general evidence excerpt with the exact page URL field", () => {
  assert.match(app, /Exact official page URL for the general evidence excerpt/);
  assert.match(app, /General evidence excerpt from official sponsor rules \(use the exact text from that page\)/);
});

test("editing a scholarship copies criterion evidence instead of dropping it", () => {
  assert.match(app, /criteriaEvidence: Object\.fromEntries\(Object\.entries\(candidate\.criteriaEvidence \?\? \{\}\)/);
  assert.match(app, /criteriaEvidence: \{\s*\.\.\.\(current\.criteriaEvidence \?\? \{\}\)/);
});