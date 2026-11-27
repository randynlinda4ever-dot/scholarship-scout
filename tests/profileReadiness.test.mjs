import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileReadiness, getRequiredProfileErrors } from '../src/lib/profileReadiness.js';

test('requires a valid U.S. residence state, education level, and graduation year', () => {
  assert.deepEqual(getRequiredProfileErrors({}), [
    'Choose your state or U.S. territory of residence.',
    'Choose your current education level.',
    'Enter a valid four-digit expected graduation year.',
  ]);
});

test('accepts state names and abbreviations without an unrepresented country field', () => {
  const base = { grade: 'High-school senior', graduationYear: '2027' };
  assert.deepEqual(getRequiredProfileErrors({ ...base, state: 'Texas' }), []);
  assert.deepEqual(getRequiredProfileErrors({ ...base, state: 'TX' }), []);
  assert.deepEqual(getRequiredProfileErrors({ ...base, state: 'CA' }), []);
});

test('rejects invalid U.S. state values', () => {
  assert.deepEqual(getRequiredProfileErrors({
    state: 'Atlantis',
    grade: 'High-school senior',
    graduationYear: '2027',
  }), ['Choose a valid U.S. state or territory of residence.']);
});

test('optional matching fields never block saving', () => {
  const report = getProfileReadiness({ state: 'Texas', grade: 'High-school senior', graduationYear: '2027' });
  assert.equal(report.canSave, true);
  assert.ok(report.supporting.totalCount > 0);
});

test('reports core and optional matching details separately', () => {
  const report = getProfileReadiness({ state: 'Texas', grade: 'High-school senior', graduationYear: '2027' });
  assert.equal(report.core.completedCount, 3);
  assert.equal(report.core.totalCount, 3);
  assert.equal(report.core.percent, 100);
  assert.equal(report.requiredErrors.length, 0);
});
