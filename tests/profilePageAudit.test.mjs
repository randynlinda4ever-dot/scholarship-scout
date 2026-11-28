import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const profile = app.slice(app.indexOf("{tab === 'Eligibility filters'"), app.indexOf("{tab === 'Application prep'"));

test('profile separates required research setup from optional matching details', () => {
  assert.match(profile, /Required for automated research/);
  assert.match(profile, /Country of residence/);
  assert.match(profile, /State of residence/);
  assert.match(profile, /Expected graduation year/);
  assert.match(profile, /OPTIONAL MATCHING DETAILS/);
  const requirement = app.slice(app.indexOf('function ProfileRequirement'), app.indexOf('function Field'));
  assert.match(profile, /ProfileRequirement kind="required"/);
  assert.match(profile, /ProfileRequirement kind="optional"/);
  assert.match(requirement, /data-requirement=\{kind\}/);
  assert.match(requirement, /Required/);
  assert.match(requirement, /Optional/);
});

test('education level and enrollment use supported options, not unrestricted text', () => {
  assert.ok(profile.includes('Current education level'));
  assert.ok(profile.includes('High school freshman (grade 9)'));
  assert.ok(profile.includes('High school senior (grade 12)'));
  assert.ok(profile.includes('College undergraduate'));
  assert.ok(profile.includes('College freshman'));
  assert.ok(profile.includes('College sophomore'));
  assert.ok(profile.includes('Full-time enrolled'));
  assert.ok(profile.includes('Part-time enrolled'));
  assert.doesNotMatch(profile, /label="Current education level"[^>]*type="text"/);
  assert.doesNotMatch(profile, /label="College status"[^>]*type="text"/);
});

test('academic numeric values use number inputs and sponsor ranges', () => {
  assert.ok(profile.includes('label="Age (whole years)"') && profile.includes('type="number" min={0} max={120}'));
  assert.ok(profile.includes('label="Expected graduation year"') && profile.includes('type="number" min={1900} max={2100}'));
  assert.ok(profile.includes('label="GPA (0-5 scale)"') && profile.includes('type="number" min={0} max={5} step="any"'));
  assert.ok(profile.includes('label="ACT composite"') && profile.includes('type="number" min={1} max={36}'));
  assert.ok(profile.includes('label="SAT score"') && profile.includes('type="number" min={400} max={1600} step={10}'));
  assert.match(profile, /Community service hours/);
});

test('profile exposes every supported optional organization and sponsor-specific qualification', () => {
  for (const label of [
    'First-generation college student status',
    'SHH membership',
    'Spanish achievement',
    'NSE/NPE medal years',
    '2026/27 NSE/NPE participation',
    '4-H membership',
  ]) assert.ok(profile.includes(label), 'missing optional qualification: ' + label);
});

test('unusable legacy Texas Grant notation and duplicate school section are removed', () => {
  assert.doesNotMatch(profile, /Texas Grant notation|Graduation program, achievement level/);
  assert.doesNotMatch(profile, /Long-term education\/career goal|degreeGoal/);
  assert.equal((profile.match(/School district/g) || []).length, 1);
});

test('informational fields are explicitly distinguished from eligibility calculations', () => {
  assert.match(profile, /credits are retained for reference only/i);
  assert.match(profile, /Credits earned/);
  assert.match(profile, /Employment experience \(local result ordering\)/);
  assert.match(profile, /Certifications \(local result ordering\)/);
  assert.match(profile, /Languages \(local result ordering\)/);
  assert.match(profile, /Service and volunteer experience \(local result ordering\)/);
  assert.match(profile, /Private result-ranking keywords/);
  assert.match(profile, /not included in the search request/);
});

test('profile UI does not display internal backend or debugging details', () => {
  assert.doesNotMatch(profile, /supabase|edge function|endpoint|API key|stack trace|debug|request id|database table|SQL/i);
  assert.match(profile, /encrypted local workspace/);
  assert.match(profile, /Automated research receives only your U\.S\. state, expected graduation year, and selected research category IDs/);
});

test('transcript import remains local, reviewable, and profile-only', () => {
  assert.match(profile, /Choose transcript/);
  assert.match(profile, /Review extracted values/);
  assert.match(profile, /Apply selected values to profile/);
  assert.match(profile, /No document is uploaded to the server/);
});
