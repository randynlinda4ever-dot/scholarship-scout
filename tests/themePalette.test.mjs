import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const themeStyles = css.split('/* Scholarship Scout — Midnight Violet design system */')[1] ?? '';

test('dark theme uses midnight navy surfaces and a violet accent system', () => {
  for (const token of [
    '--bg: #080e1f',
    '--surface: #121f3e',
    '--sidebar: #0c1630',
    '--text: #f5f4ff',
    '--accent: #9c91ff',
    '--accent-strong: #c6bdff',
  ]) assert.ok(themeStyles.includes(token), `missing dark theme token ${token}`);
  assert.match(themeStyles, /\.shell:not\(\[data-theme="light"\]\)/);
});

test('light theme remains available with cool blue and lavender surfaces', () => {
  for (const token of [
    '--bg: #f2f4fc',
    '--surface: #ffffff',
    '--sidebar: #e8ebf8',
    '--text: #20253d',
    '--accent: #6556c8',
    '--accent-strong: #5143a8',
  ]) assert.ok(themeStyles.includes(token), `missing light theme token ${token}`);
  assert.match(themeStyles, /\.shell\[data-theme="light"\]/);
});

test('legacy implicit light preferences migrate to dark while deliberate theme choices persist', () => {
  assert.match(app, /localStorage\.getItem\('scout-theme-choice'\) === 'true'/);
  assert.match(app, /return hasExplicitPreference && savedTheme === 'light' \? 'light' : 'dark'/);
  assert.match(app, /const chooseTheme = \(nextTheme: 'dark' \| 'light'\) =>/);
  assert.match(app, /localStorage\.setItem\('scout-theme-choice', 'true'\)/);
  assert.match(app, /catch \{ return 'dark'; \}/);
});

test('status semantics remain text-labelled and use coordinated non-green tones', () => {
  assert.match(themeStyles, /\.status-likely-eligible, \.status-eligible, \.source-status-verified/);
  assert.match(themeStyles, /\.status-needs-information, \.source-status-needs-review/);
  assert.match(themeStyles, /\.status-not-eligible, \.source-status-expired/);
  assert.match(css, /\.application-status-submitted, \.application-status-awarded/);
  assert.doesNotMatch(css, /#(?:365b49|b7c69a|dce5d8|344a3a|9bb59a|4c806e|8bd3b4)/i);
});
