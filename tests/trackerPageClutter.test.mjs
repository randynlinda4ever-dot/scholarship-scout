import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('scholarship tracker does not show a redundant award-basis disclaimer on every row', () => {
  assert.doesNotMatch(app, /Basis: as entered; not separately classified/);
  assert.match(app, /<th>AWARD AMOUNT<\/th>/);
  assert.doesNotMatch(app, /AWARD AMOUNT \/ BASIS/);
});

test('scholarship tracker retains the recorded award amount and missing-value fallback', () => {
  assert.match(app, /item\.award \|\| 'Amount not recorded'/);
});
