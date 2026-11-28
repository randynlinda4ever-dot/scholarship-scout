import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const eligibility = await readFile(new URL('../src/eligibility.js', import.meta.url), 'utf8');

const section = (start, end) => {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return app.slice(from, to);
};

test('overview presents readiness and recent discoveries without duplicating profile detail panels', () => {
  const overview = section("{tab === 'Overview'", "{tab === 'Settings'");
  assert.match(overview, /Profile readiness/);
  assert.match(overview, /Recent discoveries/);
  assert.match(overview, /No recent discoveries yet/);
  assert.doesNotMatch(overview, /Eligibility profile snapshot|How Scout verifies/);
});

test('FTC scholarship-scam guidance appears once on the discovery page', () => {
  const discovery = section("{tab === 'Discovery'", "{tab === 'Cloud Search'");
  assert.match(discovery, /FTC guidance/);
  assert.equal((app.match(/FTC guidance/g) || []).length, 1);
});

test('manual search and automated discovery communicate separate privacy boundaries', () => {
  const discovery = section("{tab === 'Discovery'", "{tab === 'Cloud Search'");
  const cloudSearch = section("{tab === 'Cloud Search'", "{tab === 'Scholarships'");
  assert.match(discovery, /generic scholarship terms only/);
  assert.match(discovery, /Google is contacted only when you open a search link/);
  assert.match(cloudSearch, /Only your state, graduation year, and selected categories are sent/);
  assert.match(cloudSearch, /Verify eligibility, award details, and deadlines on each official sponsor page/);
});

test('sign-in lives on Start/Home while Settings manages the connected account', async () => {
  const settings = section("{tab === 'Settings'", "{tab === 'Discovery'");
  const cloudSearch = section("{tab === 'Cloud Search'", "{tab === 'Scholarships'");
  const home = await readFile(new URL('../src/features/home/StartHomePage.tsx', import.meta.url), 'utf8');
  assert.match(home, /Continue with Google/);
  assert.match(home, /Continue without an account/);
  assert.match(settings, /Connected account/);
  assert.match(settings, /Cross-device encrypted vault/);
  assert.match(cloudSearch, /Saved cloud records/);
  assert.doesNotMatch(settings, /id="cloud-email"|settings-auth-form/);
});

test('application preparation keeps submission and decision status in the tracker', () => {
  const prep = section("{tab === 'Application prep'", '<footer className="page-footer"');
  assert.match(prep, /Core preparation checklist/);
  assert.match(prep, /Record as submitted/);
  assert.match(prep, /Track submission and decision dates in your tracker/);
  assert.doesNotMatch(prep, /Submission date:|Decision date:|<ApplicationStatusPill/);
});

test('primary workflow destinations remain reachable from their parent pages', () => {
  const overview = section("{tab === 'Overview'", "{tab === 'Settings'");
  const discovery = section("{tab === 'Discovery'", "{tab === 'Cloud Search'");
  const prep = section("{tab === 'Application prep'", '<footer className="page-footer"');
  assert.match(overview, /setTab\('Scholarships'\)/);
  assert.match(discovery, /<WorkspaceSubnav label="Scholarship search method"/);
  assert.match(discovery, /value: 'Cloud Search', label: 'Live web discovery'/);
  assert.match(prep, /Core preparation checklist/);
});

test('new scholarship criteria use enrollment alternatives while legacy records remain evaluable', () => {
  assert.doesNotMatch(app, /Full-time college enrollment \(legacy rule\)/);
  assert.match(app, /Full-time student/);
  assert.match(app, /updateEnrollmentStatus\("full-time"/);
  assert.match(eligibility, /if \(criteria\.requiresFullTimeEnrollment === true\)/);
  assert.match(eligibility, /criteria\.enrollmentStatuses/);
});
