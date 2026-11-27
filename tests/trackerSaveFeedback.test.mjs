import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("tracker persistence reports success or failure explicitly", () => {
  const match = source.match(/const saveItems = \(next: Scholarship\[\]\): boolean => \{[\s\S]*?\n  \};/);
  assert.ok(match, "saveItems must expose a boolean persistence result");
  assert.match(match[0], /return false;/);
  assert.match(match[0], /return true;/);
  assert.match(match[0], /next\.length > MAX_TRACKER_RECORDS/);
});

test("every tracker save caller gates success UI on the persistence result", () => {
  const calls = [...source.matchAll(/saveItems\(/g)];
  assert.ok(calls.length >= 6, "expected tracker save call sites to remain covered");
  for (const call of calls) {
    const prefix = source.slice(Math.max(0, call.index - 24), call.index);
    assert.match(prefix, /if\s*\(!\s*$/, "a save caller must stop when persistence fails");
  }
});

test("live search clears stale results before validating the next request", () => {
  const match = source.match(/const handleCloudSearch = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(match);
  assert.ok(match[0].indexOf("setExaResults([])") < match[0].indexOf("if (!profile.state"));
  assert.match(match[0], /getDiscoveryErrorMessage\(error\)/);
});
