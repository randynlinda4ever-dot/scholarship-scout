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

test('live scholarship search can start without a pre-existing account session', () => {
  assert.match(app, /Public search — no account required/);
  assert.match(app, /no email or password/i);
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

test('profile adds optional discovery fields and search cards use them', () => {
  for (const field of ['academicStrengths', 'careerInterests', 'awardsHonors', 'preferredCollegeLocation', 'enrollmentPlan', 'searchKeywords']) {
    assert.match(app, new RegExp(field));
  }
  assert.match(app, /profile\.academicStrengths/);
  assert.match(app, /profile\.careerInterests/);
  assert.match(app, /profile\.searchKeywords/);
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

test('live web discovery offers category selection, bounded research, and ranked SearXNG leads', () => {
  assert.match(app, /Live web discovery is ready/i);
  assert.match(app, /onClick=\{\(\)=>setTab\('Cloud Search'\)\}/);
  assert.match(app, /SearXNG live web discovery/i);
  assert.match(app, /Run research/);
  assert.match(app, /DISCOVERY_CATEGORY_OPTIONS\.map/);
  assert.match(app, /current\.length < 4/);
  assert.match(app, /two result pages per query/i);
  assert.match(app, /Research run summary/);
  assert.match(app, /Live SearXNG results/);
  assert.match(app, /relevance_score/);
  assert.doesNotMatch(app, /live web discovery is not deployed/i);
  assert.doesNotMatch(app, /Search Exa now|Live Exa results|sent to Exa/i);
});

test('manual searches and live SearXNG discovery keep their data boundaries clear', () => {
  assert.match(app, /A query is sent to Google only after you click its Search link/i);
  assert.match(app, /Only state, graduation year, and category choices are sent to SearXNG/);
  assert.match(app, /Research completed/);
  assert.match(app, /student profile stay on this device/);
  assert.match(app, /Sponsor, award, deadline, and eligibility remain unverified/);
});
