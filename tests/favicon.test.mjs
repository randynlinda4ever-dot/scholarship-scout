import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("declares an inline SVG favicon so browsers do not request a missing default icon", () => {
  assert.match(html, /rel="icon"/);
  assert.match(html, /type="image\/svg\+xml"/);
  assert.match(html, /data:image\/svg\+xml,/);
});
