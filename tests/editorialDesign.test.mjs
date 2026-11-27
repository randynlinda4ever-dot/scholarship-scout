import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const appCss = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const brand = await readFile(new URL('../src/brand-system.css', import.meta.url), 'utf8');
test('active brand system uses editorial display and interface typography', () => { assert.match(appCss, /Source Serif 4/); assert.match(appCss, /DM Sans/); assert.match(brand, /--accent:\s*#A99FFF/i); });
test('desktop navigation remains persistent and readable', () => { assert.match(appCss, /\.sidebar \.nav-copy/); assert.match(brand, /\.sidebar \.nav-copy b/); assert.match(brand, /@media \(min-width: 821px\)/); });
test('active brand system retains compact controls and mobile breakpoints', () => { assert.match(appCss, /min-height:\s*44px/); assert.match(brand, /@media \(max-width: 820px\)/); assert.match(brand, /@media \(max-width: 620px\)/); assert.match(brand, /@media \(max-width: 380px\)/); });
