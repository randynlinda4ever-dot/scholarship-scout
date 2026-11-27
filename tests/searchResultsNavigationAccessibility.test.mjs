import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWorkspaceStyles } from './helpers/styles.mjs';
import { readWorkspaceSource } from './helpers/workspaceSource.mjs';

const app = await readWorkspaceSource();
const css = await readWorkspaceStyles();

test("live search categories are exposed as a named keyboard-operable group", () => {
  assert.match(app, /className="panel discovery-category-picker" role="group" aria-labelledby="research-categories-title"/);
  assert.match(app, /<h3 id="research-categories-title">Research categories<\/h3>/);
  assert.match(app, /className="discovery-category-option"/);
  assert.match(app, /<input type="checkbox" checked=\{selectedDiscoveryCategories\.includes\(category\.id\)\}/);
});

test("live and saved search results expose named sections and list semantics", () => {
  assert.match(app, /<section aria-labelledby="live-search-results-title">/);
  assert.match(app, /<h2 id="live-search-results-title">Live SearXNG results<\/h2>/);
  assert.match(app, /role="list" aria-label="Live scholarship search results"/);
  assert.match(app, /<section aria-labelledby="saved-cloud-results-title">/);
  assert.match(app, /role="list" aria-label="Saved scholarship records"/);
  assert.match(app, /<article className="cloud-result-card" role="listitem">/);
});

test("keyboard users can skip navigation and reach the main content", () => {
  assert.match(app, /<a className="skip-link" href="#main-content">Skip to main content<\/a>/);
  assert.match(app, /<main className="main" id="main-content" tabIndex=\{-1\}>/);
});

test("interactive search controls retain a visible focus indicator", () => {
  assert.match(css, /button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\);\s*outline-offset:\s*3px;/);
});
