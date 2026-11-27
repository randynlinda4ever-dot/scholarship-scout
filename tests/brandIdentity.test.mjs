import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const gate = await readFile(new URL('../src/components/LegalAcceptanceGate.tsx', import.meta.url), 'utf8');
const appStyles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const gateStyles = await readFile(new URL('../src/components/LegalAcceptanceGate.css', import.meta.url), 'utf8');
const brandStyles = await readFile(new URL('../src/brand-system.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../src/bootstrap.ts', import.meta.url), 'utf8');

const mark = await readFile(new URL('../src/components/BrandMark.tsx', import.meta.url), 'utf8');

test('Scholarship Scout uses a simple blue S placeholder mark', () => {
  assert.match(mark, /export function BrandMark/);
  assert.match(mark, /data-brand-symbol="placeholder-s"/);
  assert.match(mark, /aria-hidden="true"/);
  assert.match(mark, />\s*S\s*<\/span>/);
  assert.doesNotMatch(mark, /<svg\b|linearGradient|book-compass/i);
});

test('workspace and legal gate share the reusable placeholder mark', () => {
  assert.match(app, /import \{ BrandMark \} from '\.\/components\/BrandMark'/);
  assert.match(gate, /import \{ BrandMark \} from [\"']\.\/BrandMark[\"']/);
  assert.match(app, /<BrandMark className="logo-mark"\s*\/>/);
  assert.match(gate, /<BrandMark className="legal-gate-mark"\s*\/>/);
  assert.match(app, /<BrandMark className="logo-mark avatar-mark"\s*\/>/);
  assert.match(bootstrap, /setAttribute\("src",\s*"\/favicon\.svg"\)/);
});

test('workspace navigation uses consistent inline SVG icons rather than Unicode pictograms', () => {
  assert.match(app, /function NavGlyph\(/);
  assert.match(app, /<NavGlyph name=\{item\.icon\}\s*\/>/);
  assert.doesNotMatch(app, /icon:\s*'[^']*[⌂⌕☁▤☑♙⚙][^']*'/);
});

test('brand styles apply the blue placeholder consistently at every logo size', () => {
  assert.match(app, /import '\.\/App\.css';\s*import '\.\/brand-system\.css';/);
  assert.match(appStyles, /\.logo-mark\s*\{[^}]*background:\s*#1D4ED8[^}]*color:\s*#000000/i);
  assert.match(gateStyles, /\.legal-gate-mark\s*\{[^}]*background:\s*#1D4ED8[^}]*color:\s*#000000/i);
  assert.match(brandStyles, /--accent:\s*#A99FFF/i);
  assert.match(brandStyles, /--muted:\s*#A6A2C3/i);
  assert.match(brandStyles, /\.sidebar,\s*\.sidebar:hover,\s*\.sidebar:focus-within/);
  assert.match(brandStyles, /transition:\s*none/);
});

test('browser favicon points to the placeholder brand asset', () => {
  assert.match(index, /href="\/favicon\.svg"/);
  assert.match(index, /name="theme-color" content="#080918"/);
});
