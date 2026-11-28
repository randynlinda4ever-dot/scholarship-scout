import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/lib/browserStorage.js", import.meta.url), "utf8");

function functionSource(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "could not locate " + startMarker);
  return app.slice(start, end);
}

test("tracker and dependent workspace records persist as one batch before UI state changes", () => {
  const source = functionSource("const saveItems =", "const persistLocalJsonState =");
  assert.match(source, /writeJsonStorageBatch\(/);
  assert.ok(source.indexOf("if (!storageResult.ok)") < source.indexOf("setItems(normalized)"));
  assert.ok(source.indexOf("if (!storageResult.ok)") < source.indexOf("setApplicationProgress(retainedProgress)"));
  assert.ok(source.indexOf("if (!storageResult.ok)") < source.indexOf("setApplicationWorkspace(retainedWorkspace)"));
  assert.match(source, /void flushLocalVault\(\)\.catch/);
});

test("checklist and workspace state share a write-before-update-before-flush persistence contract", () => {
  const task = functionSource("const saveApplicationTask =", "const saveApplicationWorkspaceEntry =");
  const workspace = functionSource("const saveApplicationWorkspaceEntry =", "const saveResourceWorkspace =");
  const persistence = functionSource("const persistLocalJsonState =", "const saveApplicationTask =");

  assert.match(task, /persistLocalJsonState\(\s*'scout-application-progress'/);
  assert.match(workspace, /persistLocalJsonState\(\s*'scout-application-workspace'/);
  assert.match(persistence, /writeAndFlushJsonState/);
  assert.match(persistence, /if \(!ok\) setAlert\(writeError\)/);
  assert.match(persistence, /else if \(!durable\) setAlert\(flushError\)/);
  assert.ok(storage.indexOf("if (!writeJsonStorage(key, value, resolveStorage))") < storage.indexOf("updateState(value)"));
  assert.ok(storage.indexOf("updateState(value)") < storage.indexOf("await flush()"));
});
