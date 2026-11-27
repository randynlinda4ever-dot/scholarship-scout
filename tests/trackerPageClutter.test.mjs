import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
test('scholarship tracker shows award basis in the column without repeating a generic disclaimer', () => {
  assert.doesNotMatch(app, /Basis: as entered; not separately classified/);
  assert.match(app, /<th>AWARD AMOUNT \/ BASIS<\/th>/);
  assert.match(app, /data-label="Award amount \/ basis"/);
});
test('scholarship tracker retains the recorded award amount and missing-value fallback', () => { assert.match(app, /item\.award \|\| 'Amount not recorded'/); });
