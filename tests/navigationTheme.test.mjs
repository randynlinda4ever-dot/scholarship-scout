import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

test('primary navigation groups the five main workspace destinations', () => {
  for (const label of ['Home', 'Find scholarships', 'My scholarships', 'My profile', 'Settings']) {
    assert.ok(app.includes(`label: '${label}'`), `missing primary destination: ${label}`);
  }
  assert.doesNotMatch(app.slice(app.indexOf('const navGroups:'), app.indexOf('const activeNavTab')), /Live web search|Application checklist/);
  assert.match(app, /<nav id="primary-navigation" className="primary-nav" data-open=\{mobileNavOpen \? 'true' : 'false'\} aria-label="Main navigation">/);
  assert.match(app, /aria-current=\{activeNavTab === item\.tab \? 'page' : undefined\}/);
});

test('switching workspace tabs returns the new page to the top', () => {
  assert.match(app, /useEffect\(\(\) => \{\s*setMobileNavOpen\(false\);\s*window\.scrollTo\(0, 0\);\s*\}, \[tab\]\);/);
});

test('home screen exposes clear quick links to the main tasks', () => {
  assert.match(app, /Find scholarships/);
  assert.match(app, /My scholarships/);
  assert.match(app, /Application progress/);
  assert.match(app, /My profile/);
});

test('the workspace uses a consistent dark theme for core surfaces and controls', () => {
  for (const selector of ['.shell', '.sidebar', '.main', '.panel', '.quick-link-card', '.modal', '.field input', '.table-card', '.workspace-subnav']) {
    assert.ok(styles.includes(selector), `missing dark theme styling for ${selector}`);
  }
});