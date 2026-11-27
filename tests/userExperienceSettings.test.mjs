import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cloudApi = await readFile(new URL('../src/lib/scholarshipApi.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

test('email sign-in remains available as an optional account path', () => {
  assert.match(app, /id="cloud-email"/);
  assert.match(app, /htmlFor="cloud-email"/);
  assert.match(app, /VITE_SUPABASE_PUBLISHABLE_KEY|supabaseConfigured/);
  assert.doesNotMatch(app, /!supabaseConfigured \? <div className="panel cloud-setup">/);
});

test('live scholarship search is public while account management stays in Settings', () => {
  const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));
  const settings = app.slice(app.indexOf("{tab === 'Settings'"), app.indexOf("{tab === 'Discovery'"));
  assert.match(cloudSearch, /Public search works without signing in or creating an account/);
  assert.match(settings, /id="cloud-email"/);
  assert.doesNotMatch(app, /Cloud account required/);
  assert.doesNotMatch(app, /ensureCloudUser\(/);
  assert.doesNotMatch(cloudApi, /ensureAnonymousUser/);
  assert.match(cloudApi, /runLiveScholarshipDiscovery[\s\S]*?const client = await requireClient\(\)/);
});

test('theme preference is toggleable and persisted locally', () => {
  assert.match(app, /localStorage\.getItem\('scout-theme'\)/);
  assert.match(app, /localStorage\.setItem\('scout-theme', theme\)/);
  assert.match(app, /data-theme=\{theme\}/);
  assert.match(app, /aria-pressed=\{theme === 'light'\}/);
  assert.match(styles, /\.shell\[data-theme="light"\]/);
  assert.match(styles, /\.theme-toggle/);
});

test('manual search links use the profile fields that are actually editable', () => {
  for (const field of ['academicHonors', 'interests', 'searchKeywords', 'schoolState', 'plannedCollegeState', 'collegeStatus']) {
    assert.match(app, new RegExp(field));
  }
  assert.match(app, /const topicTerms = \[profile\.plannedMajor, profile\.interests, profile\.academicHonors, profile\.searchKeywords\]/);
  assert.match(app, /const collegeTerms = \[profile\.plannedCollege, profile\.plannedCollegeState, profile\.collegeStatus\]/);
  assert.match(app, /const schoolTerms = \[profile\.school, profile\.schoolState, profile\.district\]/);
  for (const removedField of ['academicStrengths', 'careerInterests', 'awardsHonors', 'preferredCollegeLocation', 'enrollmentPlan']) {
    assert.doesNotMatch(app, new RegExp('profile\\.' + removedField));
  }
});

test('older profile backups merge with defaults and restore through a rollback-capable storage batch', () => {
  assert.match(app, /const restoredProfile = mergeProfile\(imported\.profile\)/);
  assert.match(app, /const storageResult = writeJsonStorageBatch\(\{/);
  assert.match(app, /if \(!storageResult\.ok\)/);
  assert.match(app, /setProfile\(restoredProfile\)/);
  assert.doesNotMatch(app, /saveProfile\(restoredProfile\)/);
});

test('live web discovery rechecks Supabase auth and protects against stale session state', () => {
  assert.match(app, /let authEventObserved = false/);
  assert.match(app, /authEventObserved = true/);
  assert.match(app, /if \(active && !authEventObserved\)/);
  assert.match(app, /const user = await getCloudUser\(\)/);
  assert.ok(app.indexOf('const user = await getCloudUser()') < app.indexOf('const run = await runLiveScholarshipDiscovery'));
  assert.match(cloudApi, /export async function getCloudUser\(\)[\s\S]*?await getSupabaseClient\(\)[\s\S]*?client\.auth\.getUser\(\)/);
});

test('live web discovery keeps its current category selection and result review flow', () => {
  const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));
  assert.match(cloudSearch, /<WorkspaceSubnav label="Scholarship search method"/);\n  assert.match(cloudSearch, /value: 'Cloud Search', label: 'Live web discovery'/);
  assert.match(cloudSearch, /Run research/);
  assert.match(cloudSearch, /DISCOVERY_CATEGORY_OPTIONS\.map/);
  assert.match(cloudSearch, /current\.length < 4/);
  assert.match(cloudSearch, /Live scholarship results/);
  assert.match(cloudSearch, /relevance_score/);
  assert.match(cloudSearch, /Sponsor, award, deadline, and eligibility remain unverified/);
  assert.doesNotMatch(cloudSearch, /SearXNG|Exa/);
});

test('manual and automated discovery explain their separate data boundaries', () => {
  const discovery = app.slice(app.indexOf("{tab === 'Discovery'"), app.indexOf("{tab === 'Cloud Search'"));
  const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));
  assert.match(discovery, /open Google only when selected/i);
  assert.match(discovery, /use the search terms shown on each card/i);
  assert.match(cloudSearch, /Only your state, graduation year, and selected categories are sent/);
  assert.match(cloudSearch, /Verify eligibility, award details, and deadlines on each official sponsor page/);
});
