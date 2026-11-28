import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
test('tracker comparison labels sponsor-provided award amount and basis without inferring missing details', () => { assert.match(app, /<th>AWARD AMOUNT \/ BASIS<\/th>/); assert.match(app, /data-label="Award amount \/ basis"/); assert.match(app, /item\.awardBasis/); assert.match(app, /item\.awardCurrencyBasis/); assert.doesNotMatch(app, /Basis: as entered; not separately classified/); assert.match(app, /Amount not recorded/); });
test('scholarship detail comparison includes amount basis and sponsor-stated deadline', () => { assert.match(app, /aria-label="Award and deadline comparison details"/); assert.match(app, /Award amount, currency, and basis are not inferred/); assert.match(app, /<b>Final deadline:<\/b>/); assert.match(app, /<b>Priority deadline:<\/b>/); });
test('comparison keeps eligibility unknowns and source evidence distinct and visible', () => { assert.match(app, /selectedSummary!\.unknown\.length} mandatory need review/); assert.match(app, /<EligibilityMatchSummary assessment=\{selectedAssessment\}\/>/); assert.match(app, /<div className="evidence-box">[\s\S]*?Source evidence/); assert.match(app, /<EvidenceCompletenessList item=\{selected\}\/>/); });
