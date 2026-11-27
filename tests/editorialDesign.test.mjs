import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const fieldNotes = css.split('/* Scholarship Scout — Field Notes design system */')[1] ?? '';

test('page headings use editorial serif typography with sans-serif interface text', () => {
  assert.match(css.split('\n')[0], /family=Source\+Serif\+4/);
  assert.match(fieldNotes, /h1, h2 \{ font-family: 'Source Serif 4', Georgia, serif/);
  assert.match(fieldNotes, /h3, h4, strong, b \{ font-family: 'DM Sans'/);
});

test('desktop navigation is persistent and fully labelled', () => {
  assert.match(fieldNotes, /flex: 0 0 258px/);
  assert.match(fieldNotes, /\.sidebar \.nav-copy/);
  assert.match(fieldNotes, /\.sidebar \.nav-copy, \.sidebar \.nav-count/);
  assert.match(fieldNotes, /max-width: none; max-height: none; opacity: 1; overflow: visible/);
  assert.match(fieldNotes, /@media \(min-width: 821px\)/);
});

test('core surfaces use a consistent compact geometry and clear controls', () => {
  assert.match(fieldNotes, /border-radius: 9px/);
  assert.match(fieldNotes, /min-height: 44px/);
  assert.match(fieldNotes, /background: var\(--surface\)/);
  assert.match(fieldNotes, /outline: 2px solid var\(--accent-strong\)/);
});

test('responsive breakpoints preserve the existing mobile layout', () => {
  assert.match(fieldNotes, /@media \(max-width: 820px\)/);
  assert.match(fieldNotes, /@media \(max-width: 620px\)/);
  assert.match(fieldNotes, /@media \(max-width: 380px\)/);
});