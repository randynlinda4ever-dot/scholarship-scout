import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const profile = app.slice(app.indexOf("{tab === 'Eligibility filters'"), app.indexOf("{tab === 'Application prep'"));

test('profile removes duplicate optional matching fields already represented elsewhere', () => {
  for (const field of ['Academic strengths or favorite subjects', 'Career fields you want to explore', 'Awards, honors, and recognitions', 'Preferred college location', 'Expected enrollment plan']) {
    assert.doesNotMatch(profile, new RegExp(field));
  }
  assert.match(profile, /Private result-ranking keywords/);
  assert.match(profile, /Topics to prioritize locally/);
  assert.doesNotMatch(profile, /Extra scholarship search keywords/);
});

test('profile does not print transcript rank clarification twice', () => {
  assert.doesNotMatch(profile, /<p>\{profileDraft\.rankDetails\}<\/p>/);
  assert.match(profile, /Rank source and date \/ clarification/);
});

test('school district guidance accurately describes the remaining field', () => {
  assert.match(profile, /School district/);
  assert.match(profile, /Used only when a saved scholarship specifies a school-district requirement/);
  assert.doesNotMatch(profile, /Both fields are optional/);
});

test('age label avoids repeating the page privacy explanation', () => {
  assert.match(profile, /Age \(whole years\)/);
  assert.match(profile, /Age \(whole years\)[\s\S]*?requirement="optional"/);
  assert.doesNotMatch(profile, /Age \(whole years; optional, stays on this device\)/);
});
