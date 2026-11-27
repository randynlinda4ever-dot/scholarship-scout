import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readWorkspaceStyles } from './helpers/styles.mjs';
import { readWorkspaceSource } from './helpers/workspaceSource.mjs';

const app = await readWorkspaceSource();
const styles = await readWorkspaceStyles();

test('primary navigation groups every main workspace destination with descriptions', () => {
  for (const label of ['Find scholarships', 'Live web search', 'My scholarships', 'Application checklist', 'My profile']) {
    assert.ok(app.includes(`label: '${label}'`), `missing navigation destination: ${label}`);
  }
  assert.match(app, /<nav id="primary-navigation" className="primary-nav" data-open=\{mobileNavOpen \? 'true' : 'false'\} aria-label="Main navigation">/);
  assert.match(app, /aria-current=\{tab === item\.tab \? 'page' : undefined\}/);
});

test('home screen exposes clear quick links to the main tasks', () => {
  for (const label of ['Find scholarships', 'My scholarships', 'Application checklist', 'My profile']) {
    assert.match(app, new RegExp(`<b>${label}</b>`));
  }
});

test('the workspace uses a consistent dark theme for core surfaces and controls', () => {
  for (const selector of ['.shell', '.sidebar', '.main', '.panel', '.quick-link-card', '.modal', '.field input', '.table-card']) {
    assert.ok(styles.includes(selector), `missing dark theme styling for ${selector}`);
  }
});