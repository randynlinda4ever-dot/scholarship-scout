import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

test('mobile brand subtitle remains readable', () => {
  assert.match(styles, /\.sidebar \.logo small\s*\{[^}]*font-size:\s*10px/);
});

test('mobile navigation count remains readable', () => {
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.nav-count\s*\{[^}]*font-size:\s*10px/);
});

test('mobile theme toggle labels remain readable', () => {
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.theme-toggle\s*\{[^}]*font-size:\s*11px/);
});

test('scholarship table headings use readable text', () => {
  assert.match(styles, /th\s*\{[^}]*font-size:\s*11px/);
});

test('scholarship table secondary details use readable text', () => {
  assert.match(styles, /td small\s*\{[^}]*font-size:\s*11px/);
});

test('eligibility status pills use readable text', () => {
  assert.match(styles, /\.status\s*\{[^}]*font-size:\s*10px/);
});

test('source verification pills use readable text', () => {
  assert.match(styles, /\.source-status\s*\{[^}]*font-size:\s*10px/);
});

test('profile readiness explanation uses readable text', () => {
  assert.match(styles, /\.profile-readiness-note\s*\{[^}]*font-size:\s*11px/);
});

test('discovery category descriptions use readable text', () => {
  assert.match(styles, /\.discovery-category-option small\s*\{[^}]*font-size:\s*10px/);
});

test('live search metric labels use readable text', () => {
  assert.match(styles, /\.search-metrics-grid small\s*\{[^}]*font-size:\s*10px/);
});
