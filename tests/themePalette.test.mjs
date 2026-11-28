import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const tokens = await read('public/brand-theme.css');
const appHtml = await read('index.html');
const app = await read('src/App.tsx');
const appCss = await read('src/App.css');
const brandSystem = await read('src/brand-system.css');
const guide = await read('public/scholarship-guides/guide.css');
const legalGate = await read('src/components/LegalAcceptanceGate.css');
const vaultGate = await read('src/lib/localVaultGate.css');
const bootstrap = await read('src/bootstrap.ts');
const stylePaths = [...appCss.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)]
  .map((match) => 'src/' + match[1].replace(/^\.\//, ''));
const activeStyles = await Promise.all(stylePaths.map(read));
const activeCss = [activeStyles.join('\n'), brandSystem, legalGate, vaultGate, guide].join('\n');

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
  '--muted: #6B6053',
  '--accent: #925334',
  '--accent-strong: #7C442A',
];

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrastRatio(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
function assertTextContrast(theme, foreground, backgrounds, minimum = 4.5) {
  for (const background of backgrounds) {
    const ratio = contrastRatio(theme[foreground], theme[background]);
    assert.ok(ratio >= minimum,
      `${foreground} on ${background} must meet ${minimum}:1 contrast (got ${ratio.toFixed(2)}:1)`);
  }
}
const palettes = {
  dark: {
    bg: '#0E1210', surface: '#1B231E', raised: '#242F28', soft: '#303B32',
    text: '#F2EFE7', textSoft: '#D9D0C2', muted: '#A7AA9B',
    accent: '#B8734F', strong: '#D69A75', warning: '#E5BD79', ink: '#21150F',
  },
  light: {
    bg: '#F3F0E9', surface: '#FFFFFF', raised: '#FCFAF5', soft: '#F4EFE5',
    text: '#2B241E', textSoft: '#55483C', muted: '#766B5D',
    accent: '#925334', strong: '#7C442A', warning: '#875C27', ink: '#FFFFFF',
  },
};

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

test('all shared semantic text colors meet WCAG AA on every application surface', () => {
  const surfaces = ['bg', 'surface', 'raised', 'soft'];
  for (const palette of Object.values(palettes)) {
    for (const foreground of ['text', 'textSoft', 'muted', 'strong', 'warning']) {
      assertTextContrast(palette, foreground, surfaces);
    }
    assert.ok(contrastRatio(palette.ink, palette.accent) >= 4.5,
      'primary action text must contrast with the copper action surface');
  }
});

test('the active component styles consume shared tokens rather than shadow palettes', () => {
  assert.doesNotMatch(brandSystem, /(^|\n):root\s*\{|--bg:\s*#|--accent:\s*#/);
  assert.match(activeCss, /\.status-likely-eligible/);
  assert.match(activeCss, /var\(--surface\)/);
  assert.doesNotMatch(activeCss, /(?:^|[;{])\s*color\s*:\s*var\(--accent\)\s*;/,
    'small foreground text must use the contrast-safe accent-strong token');
  assert.equal(stylePaths.length, 11, 'all ordered application stylesheets must be included in this test');
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

test('obsolete navy and violet surfaces are absent from every active application stylesheet', () => {
  const active = [tokens, activeCss, brandSystem, legalGate, vaultGate, guide].join('\n').toLowerCase();
  for (const obsolete of [
    '#080918', '#131a36', '#0d1128', '#a99fff', '#d2caff',
    '#080e1f', '#0c1630', '#121f3e', '#9c91ff', '#c6bdff',
    '#302d59', '#1d4ed8', '#3a2a55', '#4a3444', '#222d52',
  ]) {
    assert.equal(active.includes(obsolete), false, 'obsolete active theme color ' + obsolete);
  }
});

test('active app styles do not contain malformed nine-digit hexadecimal colors', () => {
  assert.doesNotMatch(activeCss, /#[0-9a-fA-F]{9}\b/);
  assert.doesNotMatch(guide, /#[0-9a-fA-F]{9}\b/);
});
