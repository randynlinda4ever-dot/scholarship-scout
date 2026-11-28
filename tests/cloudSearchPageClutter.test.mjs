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

test('required email access and search privacy boundaries are clear', () => {
  assert.match(cloudSearch, /Your email account is required to use Scholarship Scout/);
  assert.match(cloudSearch, /Automated live research currently targets U\.S\. states and sends only your state, graduation year, and selected research categories/);
  assert.match(cloudSearch, /Transcript files, essay drafts, and the rest of your student profile are not sent to the search service/);
  assert.doesNotMatch(cloudSearch, /Public search works without signing in/);
});

test('research categories expose the full deployed selection set', () => {
  assert.match(cloudSearch, /All currently deployed categories can be combined in one run/);
  assert.match(cloudSearch, /selectableDiscoveryCategories\.length/);
  assert.doesNotMatch(cloudSearch, /up to four categories|length < 4/);
});

test('saved cloud records are available only inside the authenticated workspace', () => {
  assert.match(cloudSearch, /cloudUser && liveResults/);
  assert.match(cloudSearch, /Saved cloud records/);
  assert.doesNotMatch(cloudSearch, /id="cloud-email"|Manage account/);
});

test('result verification guidance remains visible', () => {
  assert.match(cloudSearch, /Verify eligibility, award details, and deadlines on each official sponsor page/);
});
