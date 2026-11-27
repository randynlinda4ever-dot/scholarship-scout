import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileReadiness } from '../src/lib/profileReadiness.js';

test('reports core profile fields separately from optional matching details', () => {
  const report = getProfileReadiness({
    state: 'Texas',
    grade: 'High-school senior',
    graduationYear: '2027',
  });

  assert.equal(report.core.completedCount, 3);
  assert.equal(report.core.totalCount, 3);
  assert.equal(report.core.percent, 100);
  assert.equal(report.core.missing.length, 0);
  assert.equal(report.supporting.completedCount, 0);
  assert.ok(report.supporting.totalCount > 0);
});

test('treats whitespace as missing and explains why each core field matters', () => {
  const report = getProfileReadiness({
    state: '   ',
    grade: '12',
    graduationYear: '',
  });

  assert.equal(report.core.completedCount, 1);
  assert.deepEqual(report.core.missing.map((field) => field.key), ['state', 'graduationYear']);
  assert.ok(report.core.missing.every((field) => field.reason.trim().length > 0));
});

test('optional academic and experience details do not change core readiness', () => {
  const empty = getProfileReadiness({});
  const detailed = getProfileReadiness({
    gpa: '3.8',
    gpaType: 'Weighted',
    classRank: 'Top 10%',
    plannedMajor: 'Environmental science',
    activities: 'NHS and community service',
  });

  assert.equal(detailed.core.percent, empty.core.percent);
  assert.equal(detailed.supporting.completedCount, 5);
  assert.ok(detailed.supporting.completedCount > empty.supporting.completedCount);
});

test('sensitive or unconfirmed fields do not count as core profile completion', () => {
  const report = getProfileReadiness({
    citizenship: 'U.S. citizen',
    financialNeed: 'Yes',
    firstGeneration: 'Yes',
  });

  assert.equal(report.core.completedCount, 0);
  assert.equal(report.core.percent, 0);
});
