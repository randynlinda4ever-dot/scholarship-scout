import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, page] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/features/workspace/pages/ApplicationPrepPage.tsx", import.meta.url), "utf8"),
]);

test("application preparation does not repeat essay-writing guidance in a separate panel", () => {
  assert.doesNotMatch(page, /<h3>Writing principles<\/h3>/);
  assert.match(page, /Draft — keep your own voice and experiences/);
});

test("public footer does not expose the internal alpha release label", () => {
  assert.doesNotMatch(app, /Alpha 0\.8/);
});

test("application preparation uses visitor-facing page language", () => {
  assert.match(page, /<div className="eyebrow">APPLICATION PREPARATION<\/div>/);
  assert.doesNotMatch(page, /APPLICATION WORKBENCH/);
});
