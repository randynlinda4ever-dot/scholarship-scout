import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

const overview = section("{tab === 'Overview'", "{tab === 'Settings'");
const discovery = section("{tab === 'Discovery'", "{tab === 'Cloud Search'");
const cloudSearch = section("{tab === 'Cloud Search'", "{tab === 'Scholarships'");
const prep = section("{tab === 'Application prep'", "<footer className=\"page-footer\"");

test('overview avoids repeating the profile page and discovery workflow', () => {
  assert.doesNotMatch(overview, /Eligibility profile snapshot|How Scout verifies/);
  assert.match(overview, /Profile readiness/);
  assert.match(overview, /Recent discoveries/);
});

test('FTC scam guidance has one canonical card on Discovery', () => {
  assert.doesNotMatch(app, /FTC — Avoid Scholarship Scams/);
  assert.match(discovery, /FTC guidance/);
});

test('discovery distinguishes manual Google searches from automated live search', () => {
  assert.match(discovery, /open Google only when selected/);
  assert.match(discovery, /Automated public-page research is available separately/);
  assert.doesNotMatch(discovery, /Your school, grades, rank, test scores, activities/);
});

test('cloud account management remains centralized in Settings', () => {
  assert.doesNotMatch(cloudSearch, /cloud-authenticated|Connected as/);
  assert.match(app.slice(app.indexOf("{tab === 'Settings'"), app.indexOf("{tab === 'Discovery'")), /Account & cloud access/);
  assert.match(cloudSearch, /Saved cloud records/);
});

test('application preparation does not repeat tracker submission and decision fields', () => {
  assert.match(prep, /Submission status and decision dates are maintained in the scholarship tracker/);
  assert.doesNotMatch(prep, /Submission date:|Decision date:|<ApplicationStatusPill/);
  assert.match(prep, /Record as submitted/);
});

test('the shared workflow keeps its primary destinations available', () => {
  assert.match(overview, /setTab\('Scholarships'\)/);
  assert.match(discovery, /<WorkspaceSubnav label="Scholarship search method"/);
  assert.match(discovery, /value: 'Cloud Search', label: 'Live web discovery'/);
  assert.match(prep, /Core preparation checklist/);
});
