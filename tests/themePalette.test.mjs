import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const themeStyles = await readFile(new URL('../src/brand-system.css', import.meta.url), 'utf8');
test('dark theme uses midnight navy surfaces and violet accents', () => { for (const token of ['--bg: #080918','--surface: #131A36','--sidebar: #0D1128','--text: #F7F5FF','--accent: #A99FFF','--accent-strong: #D2CAFF']) assert.ok(themeStyles.includes(token), 'missing dark token ' + token); assert.match(themeStyles, /:root\s*\{/); });
test('light theme remains available with cool blue and lavender surfaces', () => { for (const token of ['--bg: #F5F3FB','--surface: #FFFFFF','--sidebar: #EFECF8','--text: #201B35','--accent: #6955C8','--accent-strong: #5141A5']) assert.ok(themeStyles.includes(token), 'missing light token ' + token); assert.match(themeStyles, /\.shell\[data-theme="light"\]/); });
test('explicit theme choices persist locally', () => { assert.match(app, /localStorage\.getItem\('scout-theme-choice'\) === 'true'/); assert.match(app, /const chooseTheme = \(nextTheme: 'dark' \| 'light'\) =>/); assert.match(app, /localStorage\.setItem\('scout-theme-choice', 'true'\)/); });
test('status semantics remain text-labelled and use coordinated tones', () => { assert.match(themeStyles, /\.status-likely-eligible, \.status-eligible, \.source-status-verified/); assert.match(themeStyles, /\.status-needs-information/); assert.match(themeStyles, /\.source-status-needs-review/); assert.match(themeStyles, /\.status-not-eligible, \.status-ineligible/); });
