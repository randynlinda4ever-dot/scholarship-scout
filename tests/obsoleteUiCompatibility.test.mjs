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
  assert.match(discovery, /Google receives the generic query and ordinary connection information only when you choose to open a link/);
  assert.match(cloudSearch, /Automated live research currently targets U\.S\. states and sends only your state, graduation year, and selected research categories/);
  assert.match(cloudSearch, /Verify eligibility, award details, and deadlines on each official sponsor page/);
});

test('cloud account management remains in Settings while live discovery exposes saved records', () => {
  const settings = section("{tab === 'Settings'", "{tab === 'Discovery'");
  const cloudSearch = section("{tab === 'Cloud Search'", "{tab === 'Scholarships'");
  assert.match(settings, /Email account and sign-in/);
  assert.match(settings, /Lock workspace and sign out/);
  assert.match(settings, /Import backup/);
  assert.match(cloudSearch, /Saved cloud records/);
  assert.doesNotMatch(cloudSearch, /id="cloud-email"|Check session status|cloud-auth-form/);
});

test('application preparation keeps submission and decision status in the tracker', () => {
  const prep = section("{tab === 'Application prep'", '<footer className="page-footer"');
  assert.match(prep, /Core preparation checklist/);
  assert.match(prep, /Record as submitted/);
  assert.match(prep, /Submission status and decision dates are maintained in the scholarship tracker/);
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
