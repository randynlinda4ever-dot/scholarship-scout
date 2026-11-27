import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));

test('cloud search has one clear page heading without a redundant live badge', () => {
  assert.match(cloudSearch, /<h1>Live scholarship search<\/h1>/);
  assert.doesNotMatch(cloudSearch, /<span className="status status-likely-eligible">Live search<\/span>/);
});

test('search action row avoids repeating the page title', () => {
  assert.doesNotMatch(cloudSearch, /<b>Live scholarship research<\/b>/);
});

test('public access and privacy explanation appears only once', () => {
  assert.match(cloudSearch, /Public search works without signing in or creating an account/);
  assert.doesNotMatch(cloudSearch, /Public search — no account required/);
  assert.doesNotMatch(cloudSearch, /Search requests are rate-limited and contain only state/);
});

test('category instructions do not explain the obvious rerun workflow', () => {
  assert.match(cloudSearch, /Choose up to four categories for each search/);
  assert.doesNotMatch(cloudSearch, /You can run another search with a different selection/);
});

test('connected account panel does not duplicate persistent Settings navigation', () => {
  assert.match(cloudSearch, /Cloud sponsor records are private to this account/);
  assert.doesNotMatch(cloudSearch, />Manage account<\/button>/);
});

test('result verification guidance remains visible', () => {
  assert.match(cloudSearch, /Verify eligibility, award details, and deadlines on each official sponsor page/);
});
