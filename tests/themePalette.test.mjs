import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const tokens = await read('public/brand-theme.css');
const appHtml = await read('index.html');
const app = await read('src/App.tsx');
const brandSystem = await read('src/brand-system.css');
const appDesign = await read('src/styles/app/design-system.css');
const guide = await read('public/scholarship-guides/guide.css');
const legalGate = await read('src/components/LegalAcceptanceGate.css');
const vaultGate = await read('src/lib/localVaultGate.css');
const bootstrap = await read('src/bootstrap.ts');

const darkTokens = [
  '--bg: #0E1210',
  '--sidebar: #151B18',
  '--surface: #1B231E',
  '--surface-raised: #242F28',
  '--surface-soft: #303B32',
  '--line: #455247',
  '--line-strong: #667665',
  '--text: #F2EFE7',
  '--text-soft: #D9D0C2',
  '--muted: #A7AA9B',
  '--accent: #B8734F',
  '--accent-strong: #D69A75',
];
const lightTokens = [
  '--bg: #F3F0E9',
  '--sidebar: #E8E2D7',
  '--surface: #FFFFFF',
  '--surface-soft: #F4EFE5',
  '--line: #D8CBB9',
  '--text: #2B241E',
  '--text-soft: #55483C',
  '--muted: #766B5D',
  '--accent: #925334',
  '--accent-strong: #7C442A',
];

test('one shared token file defines the complete dark oxidized-copper palette', () => {
  for (const token of darkTokens) assert.ok(tokens.includes(token), 'missing shared dark token ' + token);
  assert.equal((tokens.match(/(^|\n):root\s*\{/g) || []).length, 1);
  assert.match(tokens, /color-scheme:\s*dark/);
  assert.match(appHtml, /href="\/brand-theme\.css"/);
});

test('the optional light theme uses warm neutrals and copper accents', () => {
  for (const token of lightTokens) assert.ok(tokens.includes(token), 'missing shared light token ' + token);
  assert.match(tokens, /\.shell\[data-theme="light"\]\s*\{/);
  assert.match(app, /localStorage\.getItem\('scout-theme-choice'\) === 'true'/);
  assert.match(app, /const chooseTheme = \(nextTheme: 'dark' \| 'light'\) =>/);
  assert.match(app, /localStorage\.setItem\('scout-theme-choice', 'true'\)/);
});

test('the active component styles consume the shared tokens instead of shadow palettes', () => {
  assert.doesNotMatch(brandSystem, /(^|\n):root\s*\{|--bg:\s*#|--accent:\s*#/);
  assert.doesNotMatch(appDesign, /(^|\n):root\s*\{|--bg:\s*#|--accent:\s*#/);
  assert.match(appDesign, /\.status-likely-eligible/);
  assert.match(appDesign, /color-mix\(in srgb, var\(--accent\)/);
});

test('the pre-access legal gate, vault gate, and public guides use the shared copper tokens', () => {
  for (const source of [legalGate, vaultGate, bootstrap, guide]) {
    assert.match(source, /var\(--bg\)/);
    assert.match(source, /var\(--surface\)/);
    assert.match(source, /var\(--accent/);
  }
  assert.match(guide, /^@import url\("\/brand-theme\.css"\);/);
  assert.match(guide, /color-scheme:dark/);
  assert.doesNotMatch(guide, /#[0-9a-fA-F]{9}\b/);
});

test('old navy and violet color tokens are absent from active theme layers', () => {
  const active = [tokens, brandSystem, appDesign, legalGate, vaultGate, bootstrap, guide].join('\n').toLowerCase();
  for (const obsolete of ['#080918','#131a36','#0d1128','#a99fff','#d2caff','#080e1f','#0c1630','#121f3e','#9c91ff','#c6bdff','#302d59','#1d4ed8']) {
    assert.equal(active.includes(obsolete), false, 'obsolete active theme color ' + obsolete);
  }
});
