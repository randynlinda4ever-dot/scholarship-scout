import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const navigation = await read('src/styles/app/navigation.css');
const responsive = await read('src/styles/app/responsive.css');
const accessibility = await read('src/styles/app/accessibility.css');
const foundation = await read('src/styles/app/foundation.css');

test('mobile navigation exposes its disclosure state and controlled navigation landmark', () => {
  assert.match(app, /className="mobile-nav-toggle"[\s\S]{0,180}aria-expanded=\{mobileNavOpen\}/);
  assert.match(app, /aria-controls="primary-navigation"/);
  assert.match(app, /<nav id="primary-navigation"[^>]*aria-label="Main navigation"/);
  assert.match(app, /aria-current=\{activeNavTab === item\.tab \? 'page' : undefined\}/);
  assert.match(navigation, /\.primary-nav\[data-open="false"\]\s*\{\s*display:\s*none;/);
});

test('Escape closes the open mobile menu and returns focus to its toggle', () => {
  assert.match(app, /const mobileNavToggleRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(app, /if \(!mobileNavOpen\) return;[\s\S]*?event\.key !== 'Escape'[\s\S]*?setMobileNavOpen\(false\)[\s\S]*?mobileNavToggleRef\.current\?\.focus\(\)/);
  assert.match(app, /window\.addEventListener\('keydown', closeOnEscape\)/);
  assert.match(app, /window\.removeEventListener\('keydown', closeOnEscape\)/);
});

test('choosing a mobile navigation item closes the menu and moves focus to the main landmark', () => {
  assert.match(app, /setTab\(item\.tab\); setMobileNavOpen\(false\); window\.requestAnimationFrame\(\(\) => document\.getElementById\('main-content'\)\?\.focus\(\)\)/);
  assert.match(app, /<main className="main" id="main-content" tabIndex=\{-1\}>/);
  assert.match(app, /<a className="skip-link" href="#main-content">/);
});

test('mobile navigation controls and links retain touch-friendly target sizes', () => {
  assert.match(navigation, /@media \(max-width: 820px\)[\s\S]*?\.mobile-nav-toggle\s*\{[^}]*min-height:\s*44px/);
  assert.match(navigation, /\.primary-nav \.nav-item\s*\{[^}]*min-height:\s*44px/);
  assert.match(foundation, /\.sidebar-collapse-toggle\s*\{[^}]*min-height:\s*44px/);
});

test('responsive layout covers tablet, small-phone, and narrow-phone widths', () => {
  assert.match(responsive, /@media \(max-width: 760px\)/);
  assert.match(responsive, /@media \(max-width: 820px\)/);
  assert.match(navigation, /@media \(max-width: 620px\)/);
  assert.match(navigation, /@media \(max-width: 380px\)[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(foundation, /min-width:\s*320px/);
});

test('mobile tracker cards preserve the final details action instead of hiding it', () => {
  assert.doesNotMatch(accessibility, /\.table-wrap td:last-child\s*\{\s*display:\s*none;/);
  assert.match(accessibility, /\.table-wrap td:last-child\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*justify-self:\s*end;/);
});
