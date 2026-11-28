import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const appCss = await readActiveAppStyles();
const brand = await read('src/brand-system.css');
const tokens = await read('public/brand-theme.css');
const foundation = await read('src/styles/app/foundation.css');
const design = await read('src/styles/app/design-system.css');
const responsive = await read('src/styles/app/responsive.css');

test('the active brand system uses editorial display and interface typography', () => {
  assert.match(appCss, /Source Serif 4/);
  assert.match(appCss, /DM Sans/);
  assert.match(tokens, /--editorial-display:\s*'Source Serif 4'/);
  assert.match(tokens, /--interface-font:\s*'DM Sans'/);
  assert.match(brand, /h1,\s*h2\s*\{[^}]*Source Serif 4/);
});

test('desktop navigation remains persistent and readable', () => {
  assert.match(foundation, /\.sidebar\s*\{[^}]*position:\s*sticky/);
  assert.match(brand, /\.sidebar \.nav-copy b/);
  assert.match(brand, /@media \(min-width: 821px\)/);
});

test('the active brand system retains compact controls and mobile breakpoints', () => {
  assert.match(foundation, /\.sidebar-collapse-toggle\s*\{[^}]*min-height:\s*44px/);
  assert.match(design, /min-height:\s*44px/);
  assert.match(brand, /@media \(max-width: 820px\)/);
  assert.match(brand, /@media \(max-width: 620px\)/);
  assert.match(brand, /@media \(max-width: 380px\)/);
  assert.ok(responsive.includes('@media'));
});

test('interactive surfaces retain visible keyboard focus and minimum touch targets', () => {
  assert.match(foundation, /button:focus-visible, a:focus-visible, input:focus-visible/);
  assert.match(design, /outline-color:\s*var\(--accent-strong\)/);
  assert.match(brand, /\.sidebar \.nav-item/);
  assert.match(brand, /min-height:\s*47px/);
});
