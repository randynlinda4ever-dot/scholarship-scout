import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("tracker comparison labels award amount and basis consistently on desktop and mobile", () => {
  assert.match(app, /<th>AWARD AMOUNT \/ BASIS<\/th>/);
  assert.match(app, /data-label="Award amount \/ basis"/);
  assert.match(app, /Basis: as entered; not separately classified/);
  assert.match(app, /Amount not recorded/);
});

test("scholarship detail comparison includes amount basis and sponsor-stated deadline", () => {
  assert.match(app, /aria-label="Award and deadline comparison details"/);
  assert.match(app, /Award amount, currency, and basis are not inferred/);
  assert.match(app, /<b>Final deadline:<\/b>/);
  assert.match(app, /<b>Priority deadline:<\/b>/);
});

test("comparison keeps eligibility unknowns and source evidence distinct and visible", () => {
  assert.match(app, /selectedSummary!\.unknown\.length} mandatory need review/);
  assert.match(app, /<EligibilityMatchSummary assessment=\{selectedAssessment\}\/>/);
  assert.match(app, /<div className="evidence-box">[\s\S]*?Source evidence/);
  assert.match(app, /<EvidenceCompletenessList item=\{selected\}\/>/);
});

test("tracker retains separate truly empty and filtered-empty recovery states", () => {
  assert.match(app, /filtered\.length===0 && items\.length===0 \? <Empty/);
  assert.match(app, /hasFilteredEmptyState \? <FilteredEmpty/);
  assert.match(app, /No scholarships in this view/);
  assert.match(app, /No scholarships match these filters/);
});