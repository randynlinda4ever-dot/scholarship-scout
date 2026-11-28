import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readActiveAppStyles } from "./helpers/readActiveAppStyles.mjs";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = await readActiveAppStyles();

test("desktop sidebar has an explicit, persistent collapse toggle with fixed hover geometry", () => {
  assert.match(app, /className="sidebar-collapse-toggle"/);
  assert.match(app, /aria-label=\{desktopSidebarCollapsed \? 'Expand sidebar' : 'Collapse sidebar'\}/);
  assert.match(app, /localStorage\.getItem\('scout-sidebar-collapsed'\) === 'true'/);
  assert.match(app, /localStorage\.setItem\('scout-sidebar-collapsed', String\(desktopSidebarCollapsed\)\)/);
  assert.match(styles, /\.sidebar,\s*\.sidebar:hover,\s*\.sidebar:focus-within\s*\{[\s\S]*?flex:\s*0 0 258px;[\s\S]*?transition:\s*none;/);
  assert.match(styles, /\.sidebar\.is-collapsed,\s*\.sidebar\.is-collapsed:hover,\s*\.sidebar\.is-collapsed:focus-within\s*\{[\s\S]*?flex:\s*0 0 76px;/);
  assert.doesNotMatch(styles, /transition:\s*(?:flex-basis|width)[^;]*650ms/);
  assert.doesNotMatch(app + styles, /sidebar-hover-indicator/);
});

test("sidebar destinations remain accessible and mobile navigation keeps an independent toggle", () => {
  assert.match(app, /aria-label=\{item\.label\}[^>]*title=\{item\.label\}/);
  assert.match(app, /className="mobile-nav-toggle"/);
  assert.match(app, /aria-label=\{mobileNavOpen \? 'Close navigation menu' : 'Open navigation menu'\}/);
  assert.match(styles, /\.sidebar-collapse-toggle\s*\{/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.primary-nav\[data-open="false"\]\s*\{\s*display:\s*none/);
});

test("settings owns appearance and density preferences instead of the top bar", () => {
  const topbar = app.match(/<header className="topbar">([\s\S]*?)<\/header>/)?.[1] ?? "";
  const settings = app.match(/\{tab === 'Settings' &&([\s\S]*?)\n      \{tab === 'Discovery'/)?.[1] ?? "";
  assert.ok(settings.includes("Appearance"));
  assert.ok(settings.includes("theme-toggle"));
  assert.ok(settings.includes("compact-toggle"));
  assert.doesNotMatch(topbar, /theme-toggle|compact-toggle/);
  assert.match(app, /tab: 'Settings', label: 'Settings'/);
});
