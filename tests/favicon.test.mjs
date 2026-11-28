import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url));
const html = await read("index.html");
const brand = await read("src/components/BrandMark.tsx");
const bootstrap = await read("src/bootstrap.ts");
const logo = await read("public/brand/scholarship-scout-logo.png");

const htmlText = html.toString("utf8");
const brandText = brand.toString("utf8");
const bootstrapText = bootstrap.toString("utf8");

test("root favicon, Apple touch icon, and social preview use the supplied logo", () => {
  assert.match(htmlText, /rel="icon"[^>]*href="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(htmlText, /rel="apple-touch-icon"[^>]*href="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(htmlText, /property="og:image"[^>]*scholarship-scout-logo\.png/);
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(logo.length > 20_000, "the full supplied PNG must be committed");
});

test("the React brand mark and pre-access legal gate use the same logo", () => {
  assert.match(brandText, /src="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(brandText, /data-brand-symbol="graduation-hands"/);
  assert.match(bootstrapText, /setAttribute\("src",\s*"\/brand\/scholarship-scout-logo\.png"\)/);
  assert.doesNotMatch(bootstrapText, /setAttribute\("src",\s*"\/favicon\.svg"\)/);
});

test("public guide headers and favicons use the same logo", async () => {
  for (const path of [
    "public/scholarship-guides/index.html",
    "public/scholarship-guides/high-school-juniors.html",
    "public/scholarship-guides/scholarships-by-gpa.html",
    "public/scholarship-guides/scholarships-by-major.html",
    "public/scholarship-guides/texas-scholarships.html",
  ]) {
    const page = (await read(path)).toString("utf8");
    assert.match(page, /rel="icon"[^>]*href="\/brand\/scholarship-scout-logo\.png"/, path);
    assert.match(page, /<img class="brand-mark" src="\/brand\/scholarship-scout-logo\.png"/, path);
    assert.doesNotMatch(page, /<span class="brand-mark"[^>]*>S<\/span>/, path);
  }
});
