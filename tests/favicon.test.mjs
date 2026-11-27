import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../src/bootstrap.ts", import.meta.url), "utf8");

test("the site favicon uses the blue square S placeholder", () => {
  assert.match(html, /rel="icon"[^>]*href="\/favicon\.svg"/);
  assert.match(favicon, /<svg[^>]*viewBox="0 0 48 48"/);
  assert.match(favicon, /<rect[^>]*fill="#1D4ED8"/i);
  assert.match(favicon, /<text[^>]*fill="#000000"[^>]*>S<\/text>/);
  assert.doesNotMatch(favicon, /linearGradient|E8BD79|M8\.5 16\.1/i);
  assert.doesNotMatch(html, /data:image\/svg\+xml/);
});

test("the pre-React legal preflight displays the same favicon asset as its brand mark", () => {
  assert.match(bootstrap, /element\("img",\s*"legal-preflight-mark"\)/);
  assert.match(bootstrap, /setAttribute\("src",\s*"\/favicon\.svg"\)/);
  assert.doesNotMatch(bootstrap, /legal-preflight-mark",\s*"S"/);
});
