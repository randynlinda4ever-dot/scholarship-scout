import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWorkspaceStyles } from './helpers/styles.mjs';

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = await readWorkspaceStyles();

test("mobile navigation is explicitly toggled and announces its expanded state", () => {
  assert.match(app, /className="mobile-nav-toggle"/);
  assert.match(app, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(app, /aria-controls="primary-navigation"/);
  assert.match(app, /id="primary-navigation"/);
  assert.match(app, /setMobileNavOpen\(false\)/);
});

test("mobile navigation is collapsed by default and expands without hiding desktop navigation", () => {
  assert.match(app, /const \[mobileNavOpen, setMobileNavOpen\] = useState\(false\)/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.primary-nav\[data-open="false"\]\s*\{[^}]*display:\s*none/);
  assert.match(styles, /\.primary-nav\[data-open="true"\]\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /\.mobile-nav-toggle\s*\{[^}]*display:\s*none/);
});

test("mobile layouts preserve touch target sizes and prevent horizontal page overflow", () => {
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*?\.primary-nav \.nav-item\s*\{[^}]*min-height:\s*44px/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.field input[^}]*font-size:\s*16px/);
  assert.match(styles, /\.shell\s*\{[^}]*overflow-x:\s*clip/);
  assert.match(styles, /\.modal\s*\{[^}]*max-height:\s*calc\(100dvh/);
});
