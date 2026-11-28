import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));

test('cloud search has one clear page heading without a redundant live badge', () => {
  assert.match(cloudSearch, /<h1>Find scholarships<\/h1>/);
  assert.doesNotMatch(cloudSearch, /<span className="status status-likely-eligible">Live search<\/span>/);
});

test('search action row avoids repeating the page title', () => {
  assert.doesNotMatch(cloudSearch, /<b>Live scholarship research<\/b>/);
});

test('public access and privacy explanation appears only once', () => {
  assert.match(cloudSearch, /Public search works without signing in or creating an account/);
  assert.doesNotMatch(cloudSearch, /Public search �?" no account required/);
  assert.doesNotMatch(cloudSearch, /Search requests are rate-limited and contain only state/);
});

test('all supported search categories can be selected without an arbitrary four-category cap', () => {
  assert.match(cloudSearch, /Choose any combination of the available search categories/);
  assert.match(cloudSearch, /\{selectedDiscoveryCategories\.length\}\/\{DISCOVERY_CATEGORY_OPTIONS\.length\} selected/);
  assert.doesNotMatch(cloudSearch, /selectedDiscoveryCategories\.length\s*>=\s*4|current\.length\s*<\s*4/);
});

test('connected account panel does not duplicate persistent Settings navigation', () => {
  assert.match(cloudSearch, /Sign in to save sponsor records to your account/);
  assert.doesNotMatch(cloudSearch, />Manage account<\/button>/);
});

test('result verification guidance remains visible', () => {
  assert.match(cloudSearch, /Verify eligibility, award details, and deadlines on each official sponsor page/);
});
