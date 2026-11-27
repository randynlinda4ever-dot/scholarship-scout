import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const indexCss = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const design = css.split('/* Scholarship Scout — Field Notes design system */')[1] ?? '';

test('desktop navigation labels remain stacked and readable', () => {
  assert.match(design, /\.sidebar \.nav-copy \{ display: grid !important/);
  assert.match(design, /\.sidebar \.nav-copy b, \.sidebar \.nav-copy small/);
  assert.match(design, /display: block !important; max-width: 100%; white-space: normal/);
});

test('320px viewport can shrink below classic scrollbar width without horizontal page overflow', () => {
  assert.match(indexCss, /@media \(max-width: 380px\) \{[\s\S]*?html, body, #root \{ min-width: 0; width: 100%; \}/);
  assert.match(design, /\.shell, \.sidebar, \.main, \.page \{ width: 100%; min-width: 0; \}/);
});
