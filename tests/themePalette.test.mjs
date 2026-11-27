import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readWorkspaceStyles } from './helpers/styles.mjs';

const css = await readWorkspaceStyles();
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const fieldNotes = css.split('/* Scholarship Scout — Field Notes design system */')[1] ?? '';

test('Field Notes defines the paper-and-evergreen light palette', () => {
  for (const token of [
    '--bg: #f4f1e8',
    '--surface: #fffdf7',
    '--sidebar: #e9e6da',
    '--text: #202b24',
    '--accent: #365b49',
    '--accent-strong: #795b2e',
  ]) assert.ok(fieldNotes.includes(token), `missing light design token ${token}`);
});

test('dark theme has a coordinated forest-and-sage palette', () => {
  for (const token of [
    '--bg: #151e19',
    '--surface: #202e25',
    '--sidebar: #1b2921',
    '--text: #f0eee5',
    '--accent: #b7c69a',
    '--accent-strong: #e0c27f',
  ]) assert.ok(fieldNotes.includes(token), `missing dark design token ${token}`);
  assert.match(fieldNotes, /\.shell:not\(\[data-theme="light"\]\)/);
  assert.match(fieldNotes, /\.shell\[data-theme="light"\]/);
});

test('new users receive the light theme while saved dark preferences remain intact', () => {
  assert.match(app, /localStorage\.getItem\('scout-theme'\) === 'dark' \? 'dark' : 'light'/);
  assert.match(app, /catch \{ return 'light'; \}/);
});

test('status semantics remain text-labelled and receive distinct tones', () => {
  assert.match(fieldNotes, /\.status-likely-eligible, \.status-eligible, \.source-status-verified/);
  assert.match(fieldNotes, /\.status-needs-information, \.source-status-needs-review/);
  assert.match(fieldNotes, /\.status-not-eligible, \.source-status-expired/);
});
