import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWorkspaceStyles } from './helpers/styles.mjs';
import { readWorkspaceSource } from './helpers/workspaceSource.mjs';

const app = await readWorkspaceSource();
const styles = await readWorkspaceStyles();

test("provides a skip link and a named main landmark for keyboard users", () => {
  assert.match(app, /href="#main-content"[^>]*>Skip to main content/);
  assert.match(app, /<main className="main" id="main-content" tabIndex={-1}>/);
});

test("mobile navigation keeps labeled groups visible without horizontal-only scrolling", () => {
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.primary-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.nav-group\s*\{[^}]*display:\s*grid/);
  assert.doesNotMatch(styles, /\.primary-nav\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(app, /role="group" aria-label=\{group\.title\}/);
});

test("tracker opportunity names are individually keyboard-operable controls", () => {
  assert.match(app, /className="tracker-open"[^>]*aria-label=\{["']Review ["'] \+ item\.name\}/);
  assert.match(styles, /\.tracker-open:focus-visible/);
});

test("tracker table becomes labeled cards on small screens", () => {
  for (const label of ["Award amount / basis", "Deadline", "Urgency", "Application", "Priority", "Eligibility", "Source review"]) {
    assert.ok(app.includes(`data-label="${label}"`), `missing mobile card label ${label}`);
  }
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.table-wrap table/);
  assert.match(styles, /td\[data-label\]::before/);
});

test("compact layout preference persists locally and is exposed as an accessible toggle", () => {
  assert.match(app, /localStorage\.getItem\('scout-compact-view'\)/);
  assert.match(app, /localStorage\.setItem\('scout-compact-view'/);
  assert.match(app, /data-compact=\{compactView \? 'true' : 'false'\}/);
  assert.match(app, /aria-pressed=\{compactView\}/);
  assert.match(styles, /\.shell\[data-compact="true"\]/);
});

test("offline state is announced while local workflows remain available", () => {
  assert.match(app, /addEventListener\('offline'/);
  assert.match(app, /addEventListener\('online'/);
  assert.match(app, /You are offline[\s\S]*Local changes still work/);
  assert.match(app, /disabled=\{cloudBusy \|\| !isOnline/);
});

test("cloud live-search updates are announced once and the duplicate visual loading line is hidden", () => {
  assert.match(app, /className="cloud-message" role="status" aria-live="polite"/);
  assert.match(app, /discoveryState === 'loading' && <div className="cloud-loading" aria-hidden="true">/);
  assert.doesNotMatch(app, /className="cloud-loading"[^>]*role="status"|className="cloud-loading"[^>]*aria-live=/);
  assert.match(app, /No scholarship matches were found for this search/);
});

test("filtered tracker empty state offers clear-filters recovery without replacing the truly empty state", () => {
  assert.match(app, /items\.length > 0 && filtered\.length === 0/);
  assert.match(app, /Clear filters/);
  assert.match(app, /setQuery\(''\)[\s\S]*setFilter\('All'\)[\s\S]*setApplicationStatusFilter\('All'\)[\s\S]*setArchiveFilter\('active'\)[\s\S]*setTrackerSortBy\('deadline'\)/);
  assert.match(app, /filtered\.length\s*===\s*0\s*&&\s*items\.length\s*===\s*0/);
});

test("reduced-motion and visible focus styles remain present", () => {
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\.skip-link:focus/);
});

test("provides an on-device CSV tracker report without mixing eligibility and application status", () => {
  assert.match(app, /className="secondary" onClick=\{exportTrackerReport\}>↓ Export CSV report/);
  assert.match(app, /buildTrackerCsvReport\(items, assessments/);
});
