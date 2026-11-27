import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const storage = await readFile(new URL("../src/lib/browserStorage.js", import.meta.url), "utf8");
const boundary = await readFile(new URL("../src/components/AppErrorBoundary.tsx", import.meta.url), "utf8");

test("installs local reliability monitoring before mounting the application", () => {
  assert.match(app, /installReliabilityMonitoring\(\)/);
  assert.match(main, /import\('\.\/components\/AppErrorBoundary'\)/);
  assert.match(main, /<ErrorBoundary><Workspace \/><\/ErrorBoundary>/);
});

test("reports only a local event count and offers a local clear action", () => {
  assert.match(app, /Local diagnostics active/);
  assert.match(app, /Clear local diagnostics/);
  assert.match(app, /No telemetry is sent/);
  assert.match(app, /readReliabilityEvents\(\)/);
});

test("browser storage failures are recorded as generic local reliability events", () => {
  assert.match(storage, /recordReliabilityEvent\("storage_write_failure"\)/);
  assert.doesNotMatch(storage, /JSON\.stringify\(.*message|stack|value.*error/i);
});

test("render failures use a recoverable alert instead of a blank screen", () => {
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /recordReliabilityEvent\("react_render_error"\)/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /Reload Scholarship Scout/);
  assert.doesNotMatch(boundary, /error\.stack|error\.message/);
});
