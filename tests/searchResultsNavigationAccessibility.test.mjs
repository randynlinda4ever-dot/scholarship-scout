import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = await readActiveAppStyles();

test("live search categories are exposed as a named keyboard-operable group", () => {
  assert.match(app, /className="panel discovery-category-picker" role="group" aria-labelledby="research-categories-title"/);
  assert.match(app, /<h3 id="research-categories-title">Research categories<\/h3>/);
  assert.match(app, /className="discovery-category-option"/);
  assert.match(app, /<input type="checkbox" checked=\{selectedDiscoveryCategories\.includes\(category\.id\)\}/);
});


test("keyboard users can skip navigation and reach the main content", () => {
  assert.match(app, /<a className="skip-link" href="#main-content">Skip to main content<\/a>/);
  assert.match(app, /<main className="main" id="main-content" tabIndex=\{-1\}>/);
});

test("interactive search controls retain a visible focus indicator", () => {
  assert.match(css, /button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\);\s*outline-offset:\s*3px;/);
});
