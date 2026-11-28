import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const appStyles = await readActiveAppStyles();
const brandStyles = await readFile(new URL('../src/brand-system.css', import.meta.url), 'utf8');

test('desktop sidebar collapse control has a 44px target in both dimensions', () => {
  const control = Array.from(appStyles.matchAll(/\.sidebar-collapse-toggle\s*\{([^}]*)\}/g)).at(0)?.[1] ?? '';
  assert.match(control, /width:\s*44px/);
  assert.match(control, /min-width:\s*44px/);
  assert.match(control, /height:\s*44px/);
  assert.match(appStyles, /\.sidebar-collapse-toggle\s*\{[^}]*min-height:\s*44px/);
});

test('overview statistic helper text is at least 12px', () => {
  assert.match(appStyles, /\.stat small\s*\{[^}]*font-size:\s*12px/);
});

test('application progress stage labels are at least 12px', () => {
  assert.match(appStyles, /\.application-pipeline-grid small\s*\{[^}]*font-size:\s*12px/);
});

test('deadline supporting details are at least 12px', () => {
  assert.match(appStyles, /\.deadline-item small\s*\{[^}]*font-size:\s*12px/);
});

test('settings helper text is at least 12px', () => {
  assert.match(appStyles, /\.settings-footnote\s*\{[^}]*font-size:\s*12px/);
});
