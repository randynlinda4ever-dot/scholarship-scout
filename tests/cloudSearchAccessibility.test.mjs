import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("live search exposes one polite status region instead of announcing the same message twice", () => {
  const start = app.indexOf("{tab === 'Cloud Search'");
  const end = app.indexOf("{tab === 'Scholarships'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const cloudSearchPage = app.slice(start, end);
  const message = cloudSearchPage.match(/\{cloudMessage && (<p className="cloud-message"[^>]*>\{cloudMessage\}<\/p>)\}/)?.[1] ?? "";
  const loading = cloudSearchPage.match(/\{discoveryState === 'loading' && (<div className="cloud-loading"[^>]*>[^<]*<\/div>)\}/)?.[1] ?? "";

  assert.match(message, /role="status" aria-live="polite"/);
  assert.match(loading, /className="cloud-loading"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(loading, /role="status"|aria-live=/);
});
