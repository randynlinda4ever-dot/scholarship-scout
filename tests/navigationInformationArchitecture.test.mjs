import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const navStart = app.indexOf('const navGroups:');
const navEnd = app.indexOf('const activeNavTab', navStart);
const navigation = app.slice(navStart, navEnd);

test('primary navigation exposes five distinct destinations', () => {
  assert.notEqual(navStart, -1);
  assert.notEqual(navEnd, -1);
  assert.equal((navigation.match(/tab: '/g) || []).length, 5);
  for (const label of ['Overview', 'Find scholarships', 'My scholarships', 'My profile', 'Settings']) {
    assert.ok(navigation.includes(`label: '${label}'`), `missing primary destination: ${label}`);
  }
  assert.doesNotMatch(navigation, /Live web search|Application checklist/);
});

test('search methods are grouped under Find scholarships with an accessible sub-navigation', () => {
  assert.match(app, /<WorkspaceSubnav label="Scholarship search method"/);
  assert.match(app, /value: 'Discovery', label: 'Browse search links'/);
  assert.match(app, /value: 'Cloud Search', label: 'Live web discovery'/);
  assert.equal((app.match(/<WorkspaceSubnav label="Scholarship search method"/g) || []).length, 2);
});

test('tracker and application preparation are grouped under My scholarships', () => {
  assert.match(app, /<WorkspaceSubnav label="Scholarship management view"/);
  assert.match(app, /value: 'Scholarships', label: 'Tracker'/);
  assert.match(app, /value: 'Application prep', label: 'Application preparation'/);
  assert.equal((app.match(/<WorkspaceSubnav label="Scholarship management view"/g) || []).length, 2);
});

test('nested pages retain the correct primary navigation selection and breadcrumb', () => {
  assert.match(app, /const activeNavTab = tab === 'Cloud Search' \? 'Discovery' : tab === 'Application prep' \? 'Scholarships' : tab;/);
  assert.match(app, /item\.tab === activeNavTab/);
  assert.match(app, /aria-current=\{activeNavTab === item\.tab \? 'page' : undefined\}/);
});

test('workspace sub-navigation uses pressed state and native buttons', () => {
  assert.match(app, /function WorkspaceSubnav\(/);
  assert.match(app, /aria-pressed=\{active === option\.value\}/);
  assert.match(app, /role="group" aria-label=\{label\}/);
});
