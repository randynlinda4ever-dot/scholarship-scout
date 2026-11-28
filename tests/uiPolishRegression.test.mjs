import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = await readActiveAppStyles();

const footer = app.match(/<footer className="page-footer">([\s\S]*?)<\/footer>/)?.[1] ?? '';

test('public footer shows the product identity without an internal alpha release label', () => {
  assert.ok(footer.length > 0, 'public footer should exist');
  assert.match(footer, /Scholarship Scout/);
  assert.match(footer, /Personal scholarship assistant/);
  assert.doesNotMatch(footer, /Alpha\s+0\.\d+/i);
});

test('profile privacy note uses a human-readable label', () => {
  assert.match(app, /Privacy-conscious profile\./);
  assert.doesNotMatch(app, /Privacy-conscious profileDraft\./);
});

test('footer text is not rendered at the unusually small 9px size', () => {
  assert.match(styles, /\.page-footer\s*\{[^}]*font-size:\s*11px/);
});

test('application preparation inputs have readable desktop and mobile sizing', () => {
  assert.match(styles, /\.prep-add-form input:not\(\[type="checkbox"\]\)\s*\{[^}]*min-height:\s*42px[^}]*font-size:\s*13px/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.prep-add-form input:not\(\[type="checkbox"\]\)\s*\{[^}]*min-height:\s*44px[^}]*font-size:\s*16px/);
});

test('discovery and source-card links can wrap instead of forcing horizontal overflow', () => {
  assert.match(styles, /\.search-card a, \.source-card a\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
});
