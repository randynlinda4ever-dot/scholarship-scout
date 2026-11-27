import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

function functionSource(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "could not locate " + startMarker);
  return app.slice(start, end);
}

test("tracker and dependent workspace records persist as one batch before UI state changes", () => {
  const source = functionSource("const saveItems =", "const saveApplicationTask =");
  assert.match(source, /writeJsonStorageBatch\(/);
  assert.ok(source.indexOf("if (!storageResult.ok)") < source.indexOf("setItems(normalized)"));
  assert.ok(source.indexOf("if (!storageResult.ok)") < source.indexOf("setApplicationProgress(retainedProgress)"));
  assert.ok(source.indexOf("if (!storageResult.ok)") < source.indexOf("setApplicationWorkspace(retainedWorkspace)"));
  assert.match(source, /void flushLocalVault\(\)\.catch/);
});

test("checklist and workspace state do not advance when their local write fails", () => {
  const task = functionSource("const saveApplicationTask =", "const saveApplicationWorkspaceEntry =");
  const workspace = functionSource("const saveApplicationWorkspaceEntry =", "const closeBackupDialog =");

  assert.ok(task.indexOf("if (!saveJson('scout-application-progress', next))") < task.indexOf("setApplicationProgress(next)"));
  assert.ok(workspace.indexOf("if (!saveJson('scout-application-workspace', next))") < workspace.indexOf("setApplicationWorkspace(next)"));
  assert.match(task, /void flushLocalVault\(\)\.catch/);
  assert.match(workspace, /void flushLocalVault\(\)\.catch/);
});
