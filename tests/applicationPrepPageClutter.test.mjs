import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('application preparation does not repeat essay-writing guidance in a separate panel', () => {
  assert.doesNotMatch(app, /<h3>Writing principles<\/h3>/);
  assert.match(app, /Draft — keep your own voice and experiences/);
});

test('public footer does not expose the internal alpha release label', () => {
  assert.doesNotMatch(app, /Alpha 0\.8/);
});

test('application preparation uses visitor-facing page language', () => {
  assert.match(app, /<div className="eyebrow">APPLICATION PREPARATION<\/div>/);
  assert.doesNotMatch(app, /APPLICATION WORKBENCH/);
});
