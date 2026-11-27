import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");

test("desktop sidebar begins collapsed and opens after a visible hover delay", () => {
  assert.match(app, /className="sidebar-hover-indicator"/);
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*?\.sidebar\s*\{[^}]*width:\s*76px/);
  assert.match(styles, /\.sidebar:hover\s*,\s*\.sidebar:focus-within/);
  assert.match(styles, /transition:\s*(?:flex-basis|width)[^;]*650ms/);
  assert.match(styles, /sidebar-hover-indicator::after/);
  assert.match(styles, /\.sidebar:hover \.nav-copy[\s\S]*?transition-delay:\s*910ms/);
  assert.match(styles, /\.sidebar \.logo \{[^}]*gap:\s*0/);
  assert.match(styles, /\.sidebar:not\(:hover\):not\(:focus-within\) \.nav-item \{[^}]*justify-content:\s*center/);
  assert.match(styles, /\.sidebar:not\(:hover\):not\(:focus-within\) \.nav-icon \{[^}]*margin-inline:\s*auto/);
});

test("sidebar destinations remain accessible when their visual labels are collapsed", () => {
  assert.match(app, /aria-label=\{item\.label\}[^>]*title=\{item\.label\}/);
  assert.match(styles, /\.sidebar:focus-within/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.sidebar-hover-indicator\s*\{[^}]*display:\s*none/);
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
