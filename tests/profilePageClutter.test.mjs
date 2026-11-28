import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const profile = app.slice(app.indexOf("{tab === 'Eligibility filters'"), app.indexOf("{tab === 'Application prep'"));

test('profile removes duplicate optional matching fields already represented elsewhere', () => {
  for (const field of ['Academic strengths or favorite subjects', 'Career fields you want to explore', 'Awards, honors, and recognitions', 'Preferred college location', 'Expected enrollment plan']) {
    assert.doesNotMatch(profile, new RegExp(field));
  }
  assert.match(profile, /Extra scholarship search keywords/);
});

test('profile does not print transcript rank clarification twice', () => {
  assert.doesNotMatch(profile, /<p>\{profileDraft\.rankDetails\}<\/p>/);
  assert.match(profile, /Rank source and date \/ clarification/);
});

test('school district guidance accurately describes the remaining field', () => {
  assert.match(profile, /Add your district to help find school-based awards/);
  assert.doesNotMatch(profile, /Both fields are optional/);
});

test('age label avoids repeating the page privacy explanation', () => {
  assert.match(profile, /Age \(optional\)/);
  assert.doesNotMatch(profile, /Age \(whole years; optional, stays on this device\)/);
});


test('numeric profile fields expose the same ranges enforced by validation', () => {
  assert.match(profile, /label="Age \(optional\)"[\\s\\S]*?type="number"[\\s\\S]*?min=\{0\}[\\s\\S]*?max=\{120\}[\\s\\S]*?step=\{1\}/);
  assert.match(profile, /label="Expected graduation year"[\\s\\S]*?type="number"[\\s\\S]*?min=\{1900\}[\\s\\S]*?max=\{2100\}[\\s\\S]*?step=\{1\}/);
  assert.match(profile, /label="ACT composite"[\\s\\S]*?type="number"[\\s\\S]*?min=\{1\}[\\s\\S]*?max=\{36\}[\\s\\S]*?step=\{1\}/);
  assert.match(profile, /label="SAT score"[\\s\\S]*?type="number"[\\s\\S]*?min=\{400\}[\\s\\S]*?max=\{1600\}[\\s\\S]*?step=\{10\}/);
  assert.match(profile, /label="Community service hours"[\\s\\S]*?type="number"[\\s\\S]*?min=\{0\}[\\s\\S]*?step="any"/);
});
