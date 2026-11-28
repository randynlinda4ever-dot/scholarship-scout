import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/brand-system.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const responsive = styles.slice(styles.lastIndexOf('/* Responsive workspace navigation — final cascade. */'));

test('the mobile drawer preserves the six updated primary destinations', () => {
  const navStart = app.indexOf('const navGroups:');
  const navEnd = app.indexOf('const activeNavTab', navStart);
  const nav = app.slice(navStart, navEnd);

  assert.equal((nav.match(/tab: '/g) || []).length, 6);
  for (const label of ['Home', 'Find scholarships', 'My scholarships', 'My profile', 'Resources', 'Settings']) {
    assert.ok(nav.includes(`label: '${label}'`), `missing destination: ${label}`);
  }
});

test('mobile navigation is an explicit accessible drawer with an actual expanded state', () => {
  assert.match(app, /className="mobile-nav-toggle"/);
  assert.match(app, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(app, /data-open=\{mobileNavOpen \? 'true' : 'false'\}/);
  assert.match(responsive, /\.primary-nav\[data-open="false"\]\s*\{[^}]*display:\s*none/);
  assert.match(responsive, /\.primary-nav\[data-open="true"\]\s*\{[^}]*display:\s*grid/);
});

test('tablet and mobile navigation links have a full 44px touch target', () => {
  assert.match(responsive, /\.mobile-nav-toggle\s*\{[^}]*min-height:\s*44px/);
  assert.match(responsive, /\.primary-nav \.nav-item\s*\{[^}]*min-height:\s*44px/);
  assert.match(responsive, /\.workspace-subnav button\s*\{[^}]*min-height:\s*44px/);
});

test('the narrowest phones use a single-column drawer and avoid clipped labels', () => {
  assert.match(responsive, /@media \(max-width: 380px\)[\s\S]*?\.primary-nav\[data-open="true"\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(responsive, /overflow-wrap:\s*anywhere/);
  assert.match(responsive, /min-width:\s*0/);
});

test('mobile safe areas are enabled for notched devices', () => {
  assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(responsive, /env\(safe-area-inset-left\)/);
  assert.match(responsive, /env\(safe-area-inset-right\)/);
  assert.match(responsive, /env\(safe-area-inset-bottom\)/);
});
