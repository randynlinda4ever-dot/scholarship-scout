import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('discovery page does not show a permanently empty preloaded-scholarships section', () => {
  assert.doesNotMatch(app, /No sample scholarships are preloaded/);
  assert.doesNotMatch(app, /<h2>Scholarship opportunities<\/h2>/);
});

test('discovery page keeps actionable search paths and trusted sources', () => {
  assert.match(app, /<h2>Run profile-specific searches<\/h2>/);
  assert.match(app, /<h2>Trusted scholarship sources<\/h2>/);
  assert.match(app, /Open live web discovery/);
});
