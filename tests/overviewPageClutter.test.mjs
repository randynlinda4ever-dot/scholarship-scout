import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('overview does not duplicate primary navigation with quick-access cards', () => {
  assert.doesNotMatch(app, /className="quick-access"/);
  assert.doesNotMatch(app, /quick-link-card/);
});

test('overview does not repeat profile discovery guidance beside profile readiness', () => {
  assert.doesNotMatch(app, /Profile-based scholarship discovery/);
});

test('sidebar does not expose internal alpha release labeling', () => {
  assert.doesNotMatch(app, /SCHOLARSHIP SCOUT · ALPHA/);
});
