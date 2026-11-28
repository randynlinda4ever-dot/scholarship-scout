import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileReadiness, getRequiredProfileErrors } from '../src/lib/profileReadiness.js';

const validUsProfile = { country: 'US', state: 'Texas', graduationYear: '2027' };

test('requires a valid residence country, a US state for US residents, and a graduation year', () => {
  assert.deepEqual(getRequiredProfileErrors({}), [
    'Choose your country of residence.',
    'Enter a valid four-digit expected graduation year.',
  ]);
});

test('does not require a US state or current grade for a valid non-US profile', () => {
  assert.deepEqual(getRequiredProfileErrors({
    country: 'CA',
    state: '',
    graduationYear: '2027',
  }), []);
  assert.deepEqual(getRequiredProfileErrors({
    country: 'GB',
    state: '',
    graduationYear: '2028',
    grade: '',
  }), []);
});

test('requires a valid US state only when residence country is the United States', () => {
  assert.deepEqual(getRequiredProfileErrors({
    country: 'US',
    state: '',
    graduationYear: '2027',
  }), ['Choose your state or U.S. territory of residence.']);
  assert.deepEqual(getRequiredProfileErrors({
    country: 'US',
    state: 'Atlantis',
    graduationYear: '2027',
  }), ['Choose a valid U.S. state or territory of residence.']);
  assert.deepEqual(getRequiredProfileErrors({
    country: 'CA',
    state: 'Ontario',
    graduationYear: '2027',
  }), ['Clear the U.S. state field when your country of residence is not the United States.']);
});

test('rejects unsupported country values', () => {
  assert.deepEqual(getRequiredProfileErrors({
    country: 'ZZ',
    state: '',
    graduationYear: '2027',
  }), ['Choose a valid country of residence.']);
});

test('current education level is optional and does not block profile save', () => {
  const report = getProfileReadiness({ ...validUsProfile, grade: '' });
  assert.equal(report.canSave, true);
  assert.equal(report.requiredErrors.length, 0);
  assert.equal(report.supporting.fields.some((field) => field.key === 'grade'), true);
});

test('profile readiness reflects country-dependent core requirements', () => {
  const us = getProfileReadiness(validUsProfile);
  assert.equal(us.core.totalCount, 3);
  assert.equal(us.core.completedCount, 3);
  assert.equal(us.core.percent, 100);

  const international = getProfileReadiness({ country: 'CA', graduationYear: '2027' });
  assert.equal(international.core.totalCount, 2);
  assert.equal(international.core.completedCount, 2);
  assert.equal(international.canSave, true);
});

test('optional academic, enrollment, and scholarship attributes never block saving', () => {
  const report = getProfileReadiness(validUsProfile);
  assert.equal(report.canSave, true);
  assert.ok(report.supporting.totalCount > 0);
  assert.deepEqual(report.requiredErrors, []);
});
