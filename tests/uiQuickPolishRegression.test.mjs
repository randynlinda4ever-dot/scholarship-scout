import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

test('overview explains when there are no recent discoveries', () => {
  assert.match(app, /candidateAssessments\.length\s*\?\s*<div className="candidate-grid"/);
  assert.match(app, /No recent discoveries yet/);
});

test('profile snapshot does not render empty values with dangling separators', () => {
  assert.doesNotMatch(app, /profile\.plannedMajor\} · GPA \{profile\.gpa\} · Rank \{profile\.classRank/);
  assert.match(app, /profileSnapshotDetails/);
});

test('tracker action column has a readable heading', () => {
  assert.match(app, /<th scope="col">DETAILS<\/th>/);
  assert.match(app, /role="img" aria-label="Open scholarship details"/);
});

test('offline notice uses readable colors in light theme', () => {
  assert.match(css, /\.shell\[data-theme="light"\] \.offline-notice\s*\{/);
});

test('skip-link destination retains a visible keyboard focus indicator', () => {
  assert.doesNotMatch(css, /\.main:focus\s*\{\s*outline:\s*none/);
  assert.match(css, /\.main:focus-visible\s*\{[^}]*outline:/);
});
