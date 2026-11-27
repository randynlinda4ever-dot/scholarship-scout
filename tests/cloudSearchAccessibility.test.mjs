import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cloudSearchPage = await readFile(
  new URL("../src/features/workspace/pages/CloudSearchPage.tsx", import.meta.url),
  "utf8",
);

test("live search exposes one polite status region instead of announcing the same message twice", () => {
  const message = cloudSearchPage.match(/\{cloudMessage && (<p className="cloud-message"[^>]*>\{cloudMessage\}<\/p>)\}/)?.[1] ?? "";
  const loading = cloudSearchPage.match(/\{discoveryState === 'loading' && (<div className="cloud-loading"[^>]*>[^<]*<\/div>)\}/)?.[1] ?? "";

  assert.match(message, /role="status" aria-live="polite"/);
  assert.match(loading, /className="cloud-loading"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(loading, /role="status"|aria-live=/);
  assert.equal((cloudSearchPage.match(/className="cloud-message"/g) || []).length, 1);
});
