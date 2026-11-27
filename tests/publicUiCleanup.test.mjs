import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const errorBoundary = await readFile(new URL('../src/components/AppErrorBoundary.tsx', import.meta.url), 'utf8');

test('public footer does not expose local diagnostic history', () => {
  assert.doesNotMatch(app, /Local diagnostics active|Clear local diagnostics|Diagnostic history stays on this device/);
  assert.doesNotMatch(errorBoundary, /local diagnostics|generic error category was saved/i);
});

test('user-facing error messages do not render raw exception messages', () => {
  assert.doesNotMatch(app, /setCloudMessage\(error instanceof Error \? error\.message/);
  assert.doesNotMatch(app, /setNotice\(error instanceof Error \? error\.message/);
});

test('live search UI does not expose operational query and page telemetry', () => {
  assert.doesNotMatch(app, /Research run summary|Search requests|Raw results|Search pages checked:|query variation\(s\)/);
  assert.doesNotMatch(app, /discoverySummary\.failedQueries|discoverySummary\.successfulQueries|discoverySummary\.requestedQueries|discoverySummary\.pagesChecked|discoverySummary\.rawResultCount/);
});

test('public UI does not expose internal search and backend provider names', () => {
  assert.doesNotMatch(app, /SearXNG/);
  assert.doesNotMatch(app, /Supabase is temporarily limiting/);
  assert.doesNotMatch(app, /public Supabase browser configuration|public publishable key/);
});

test('public UI does not expose deployment implementation status', () => {
  assert.doesNotMatch(app, /Verification not deployed|Edge Function is not deployed|Not available in the deployed search|current expanded search implementation|Discovery beta/);
});
