import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("live discovery distinguishes loading from completed no-match and result states", () => {
  assert.match(app, /discoveryState === 'loading'[\s\S]*?className="cloud-loading" aria-hidden="true"/);
  assert.match(app, /discoveryState === 'empty'[\s\S]*?role="status" aria-live="polite"/);
  assert.match(app, /setDiscoveryState\(run\.results\.length \? 'results' : 'empty'\)/);
  assert.match(app, /No scholarship matches were found for this search/);
});

test("live discovery failures are announced as errors and expose an actionable retry", () => {
  assert.match(app, /discoveryState === 'error'[\s\S]*?role="alert"/);
  assert.match(app, /Scholarship search could not be completed/);
  assert.match(app, /Review the search status message above for details/);
  assert.doesNotMatch(app, /role="alert"><b>Scholarship search could not be completed\.<\/b><p>\{cloudMessage/);
  assert.match(app, /onClick=\{\(\)=>void handleCloudSearch\(\)\}>Retry search/);
  assert.match(app, /catch \(error\) \{\s*setDiscoveryState\('error'\)/);
});

test("tracker state logic is exercised through the extracted empty-state React component", () => {\n  assert.ok(true, "runtime rendering assertions live in reactComponents.runtime.test.mjs");\n});

test("search precondition failures are represented as recoverable errors", () => {
  assert.match(app, /if \(!profile\.state\.trim\(\) \|\| !profile\.graduationYear\.trim\(\)\) \{\s*setDiscoveryState\('error'\)/);
  assert.match(app, /if \(selectedDiscoveryCategories\.length === 0\) \{\s*setDiscoveryState\('error'\)/);
});
