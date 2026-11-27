import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("scholarship editor, detail, and backup overlays expose labeled modal dialogs", () => {
  const dialogs = app.match(/role="dialog" aria-modal="true"/g) || [];
  assert.ok(dialogs.length >= 3, "expected Add, scholarship detail, and backup dialogs");
  assert.match(app, /aria-labelledby="add-dialog-title"/);
  assert.match(app, /aria-labelledby="selected-dialog-title"/);
  assert.match(app, /aria-labelledby="backup-dialog-title"/);
});

test("modal keyboard handling traps focus, closes on Escape, and restores prior focus", () => {
  assert.match(app, /event\.key !== 'Tab'/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /previousActive\?\.focus\(\)/);
  assert.match(app, /const current = getFocusable\(\)/);
  assert.match(app, /current\[0\]/);
  assert.match(app, /current\[current\.length - 1\]/);
});

test("close icon buttons have explicit accessible names", () => {
  assert.match(app, /aria-label="Close scholarship form"/);
  assert.match(app, /aria-label="Close scholarship details"/);
  assert.match(app, /aria-label="Close backup dialog"/);
});
