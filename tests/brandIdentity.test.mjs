import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const bootstrap = await read('src/bootstrap.ts');
const brandMark = await read('src/components/BrandMark.tsx');
const navGlyph = await read('src/components/NavGlyph.tsx');
const appStyles = await readActiveAppStyles();
const themeTokens = await read('public/brand-theme.css');
const brandStyles = await read('src/brand-system.css');
const guideStyles = await read('public/scholarship-guides/guide.css');
const index = await read('index.html');

test('the React brand mark uses the supplied graduation-and-hands PNG', async () => {
  assert.match(brandMark, /export function BrandMark/);
  assert.match(brandMark, /src="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(brandMark, /data-brand-symbol="graduation-hands"/);
  assert.match(brandMark, /alt=""/);
  assert.match(brandMark, /aria-hidden="true"/);
  const logo = await readFile(new URL('../public/brand/scholarship-scout-logo.png', import.meta.url));
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('workspace header and pre-access legal gate share the same logo asset', () => {
  assert.match(app, /import \{ BrandMark \} from '\.\/components\/BrandMark'/);
  assert.match(app, /<BrandMark className="logo-mark"\s*\/>/);
  assert.match(app, /<BrandMark className="logo-mark avatar-mark"\s*\/>/);
  assert.match(bootstrap, /element\("img",\s*"legal-preflight-mark"\)/);
  assert.match(bootstrap, /setAttribute\("src",\s*"\/brand\/scholarship-scout-logo\.png"\)/);
  assert.doesNotMatch(bootstrap, /setAttribute\("src",\s*"\/favicon\.svg"\)/);
});

test('workspace navigation glyphs remain isolated in their shared SVG component', () => {
  assert.match(app, /import \{ NavGlyph, type NavGlyphName \} from '\.\/components\/NavGlyph\.js'/);
  assert.match(app, /<NavGlyph name=\{item\.icon\}\s*\/>/);
  assert.match(navGlyph, /export type NavGlyphName/);
  assert.match(navGlyph, /export function NavGlyph/);
  assert.match(navGlyph, /aria-hidden="true"/);
  assert.doesNotMatch(app, /function NavGlyph\s*\(/);
});

test('app and public-guide logo images use contained image sizing and copper branding', () => {
  assert.match(appStyles, /@import '\.\/styles\/app\/branding\.css';/);
  assert.match(brandStyles, /\.logo-mark\s*\{[^}]*object-fit:\s*contain/);
  assert.match(brandStyles, /\.avatar \.avatar-mark\s*\{[^}]*object-fit:\s*contain/);
  assert.match(themeTokens, /--accent:\s*#B8734F/i);
  assert.match(guideStyles, /\.brand-mark\{[^}]*object-fit:contain/);
  assert.doesNotMatch(themeTokens, /#1D4ED8|#080918|#A99FFF/i);
});

test('site favicon and Apple touch icon use the official logo asset', () => {
  assert.match(index, /rel="icon"[^>]*href="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(index, /rel="apple-touch-icon"[^>]*href="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(index, /name="theme-color" content="#0E1210"/);
});
