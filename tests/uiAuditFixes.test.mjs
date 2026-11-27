import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const indexCss = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function token(block, name) {
  const value = block.match(new RegExp(name + ':\\s*(#[0-9a-f]{6})', 'i'))?.[1];
  assert.ok(value, 'missing theme token ' + name);
  return value;
}

test('light-theme muted copy meets WCAG AA on every base surface', () => {
  const lightTheme = css.match(/\.shell\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(lightTheme, 'light theme token block exists');
  const muted = token(lightTheme, '--muted');

  for (const name of ['--bg', '--sidebar', '--surface', '--surface-raised', '--surface-soft']) {
    assert.ok(
      contrastRatio(muted, token(lightTheme, name)) >= 4.5,
      'muted text must meet 4.5:1 on ' + name,
    );
  }
  const placeholder = css.match(/\.shell\[data-theme="light"\] input::placeholder,[\s\S]*?textarea::placeholder\s*\{\s*color:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(placeholder, 'light-theme placeholder color is explicitly set');
  assert.ok(contrastRatio(placeholder, '#FFFFFF') >= 4.5, 'placeholder text meets 4.5:1 on white inputs');
});

test('scholarship name and provider are required, field-associated, and validated inline', () => {
  assert.match(app, /<form id="scholarship-editor-form"[\s\S]*?onInvalidCapture=/);
  assert.match(app, /<Field id="scholarship-name" label="Scholarship name \*"[^>]*required/);
  assert.match(app, /<Field id="scholarship-provider" label="Provider \*"[^>]*required/);
  assert.match(app, /aria-required=\{required \|\| undefined\}/);
  assert.match(app, /aria-invalid=\{error \? 'true' : undefined\}/);
  assert.match(app, /aria-describedby=\{error \? errorId : undefined\}/);
  assert.match(app, /id=\{errorId\} className="field-error" role="alert"/);
  assert.match(app, /!draft\.name\.trim\(\) \|\| !draft\.provider\.trim\(\)/);
});

test('tracker details are a real keyboard-accessible action, not a decorative arrow', () => {
  assert.match(app, /className="secondary tracker-details"[^>]*aria-label=\{"Open details for " \+ item\.name\}[^>]*onClick=\{\(\) => setSelected\(item\)\}/);
  assert.doesNotMatch(app, /<span role="img" aria-label="Open scholarship details">/);
  assert.doesNotMatch(css, /tbody tr\s*\{[^}]*cursor:\s*pointer/);
  assert.doesNotMatch(css, /tbody tr:hover/);
  assert.match(css, /\.tracker-details\s*\{[^}]*min-height:\s*44px/);
});

test('notifications are event-driven, auto-dismiss, and keep critical storage errors persistent', () => {
  assert.match(app, /const \[notice, setNotice\] = useState\(''\)/);
  assert.match(app, /setTimeout\(\(\) => setNotice\(''\), 6000\)/);
  assert.match(app, /const \[alert, setAlert\] = useState\(''\)/);
  assert.match(app, /className="app-alert" role="alert"/);
  assert.match(app, /setAlert\('Your changes are active in this tab, but browser storage could not save them\./);
  assert.match(app, /setAlert\('Your profile could not be saved in this browser\./);
});

test('Midnight Violet CSS has one canonical token root and no duplicated motion or legacy font layers', () => {
  assert.equal((css.match(/:root\s*\{/g) || []).length, 1);
  assert.equal((css.match(/\.shell\[data-theme="light"\]\s*\{/g) || []).length, 1);
  assert.equal((css.match(/@media \(prefers-reduced-motion: reduce\)/g) || []).length, 1);
  assert.doesNotMatch(css, /Manrope|Newsreader/);
  assert.match(css, /--editorial-display:\s*'Source Serif 4', Georgia, serif/);
  assert.match(css, /@import url\('[^']*family=DM\+Sans[^']*family=Source\+Serif\+4/);
  assert.doesNotMatch(indexCss, /var\(--palette-7\)/);
});

test('desktop sidebar collapse is explicit, persistent, and independent of hover', () => {
  assert.match(app, /const \[desktopSidebarCollapsed, setDesktopSidebarCollapsed\] = useState\(\(\) =>/);
  assert.match(app, /localStorage\.getItem\('scout-sidebar-collapsed'\) === 'true'/);
  assert.match(app, /localStorage\.setItem\('scout-sidebar-collapsed', String\(desktopSidebarCollapsed\)\)/);
  assert.match(app, /aria-label=\{desktopSidebarCollapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/);
  assert.match(app, /data-collapsed=\{desktopSidebarCollapsed \? 'true' : 'false'\}/);
  assert.match(css, /\.sidebar,\s*\.sidebar:hover,\s*\.sidebar:focus-within\s*\{[\s\S]*?flex:\s*0 0 258px;[\s\S]*?transition:\s*none;/);
  assert.match(css, /\.sidebar\.is-collapsed,\s*\.sidebar\.is-collapsed:hover,\s*\.sidebar\.is-collapsed:focus-within\s*\{[\s\S]*?flex:\s*0 0 76px;/);
  assert.match(css, /\.sidebar\.is-collapsed \.nav-copy/);
  assert.match(css, /\.sidebar\.is-collapsed \.nav-count/);
  assert.doesNotMatch(app + css, /sidebar-hover-indicator/);
});
