import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cloudApi = await readFile(new URL('../src/lib/scholarshipApi.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../src/bootstrap.ts', import.meta.url), 'utf8');
const vaultGate = await readFile(new URL('../src/lib/localVaultGate.js', import.meta.url), 'utf8');
const emailGate = await readFile(new URL('../src/lib/emailAuthGate.js', import.meta.url), 'utf8');

test('email authentication is the primary bootstrap gate before any local workspace is loaded', () => {
  assert.match(bootstrap, /renderEmailAuthGate/);
  assert.match(bootstrap, /renderAuthenticatedVaultGate/);
  assert.ok(bootstrap.indexOf('await renderEmailAuthGate') < bootstrap.indexOf('await renderAuthenticatedVaultGate'));
  assert.doesNotMatch(bootstrap, /renderLocalVaultGate\(root/);
  assert.match(bootstrap, /await import\("\.\/main"\)/);
  assert.match(vaultGate, /createDeviceVault\(user\.id\)/);
  assert.match(vaultGate, /unlockDeviceVault\(user\.id\)/);
  assert.match(vaultGate, /migrateLocalVaultToDevice\(input\.value, user\.id\)/);
});

test('returning email sessions restore from encrypted auth storage before workspace unlock', () => {
  assert.match(emailGate, /client\.auth\.getSession\(\)/);
  assert.match(emailGate, /client\.auth\.getUser\(\)/);
  assert.match(emailGate, /onAuthStateChange/);
  assert.ok(emailGate.indexOf('await onAuthenticated(data.user)') < emailGate.indexOf('authenticated = true'));
  assert.match(emailGate, /signOut\(\{ scope: "local" \}\)/);
});

test('account UI treats verified email as required and supports full sign-out', () => {
  const settings = app.slice(app.indexOf("{tab === 'Settings'"), app.indexOf("{tab === 'Discovery'"));
  assert.match(settings, /Email account and sign-in/);
  assert.match(settings, /A verified email account is required/);
  assert.match(settings, /Sign out and lock workspace/);
  assert.match(settings, /Export encrypted backup/);
  assert.match(settings, /Import backup/);
  assert.doesNotMatch(settings, /Optional cloud account|Email sign-in is only needed/);
});

test('live search uses more than four research categories from the deployed allowlist', () => {
  const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));
  assert.match(cloudSearch, /selectableDiscoveryCategories\.length/);
  assert.match(cloudSearch, /toggleDiscoveryCategory\(current, category\.id, event\.target\.checked\)/);
  assert.match(cloudSearch, /All currently deployed categories can be combined/);
  assert.doesNotMatch(cloudSearch, /current\.length < 4|length >= 4|\/4 selected|up to four/);
});

test('transcript upload extracts suggestions that users explicitly review before profile changes', () => {
  const academicStart = app.indexOf('<h3>Academic record</h3>');
  const academicEnd = app.indexOf('<h3>Activities, service and reference notes</h3>', academicStart);
  const academic = app.slice(academicStart, academicEnd);
  assert.match(academic, /type="file"/);
  assert.match(academic, /Choose transcript/);
  assert.match(academic, /transcriptSuggestions\.map/);
  assert.match(academic, /Apply selected values to profile/);
  assert.match(app, /extractDocumentText\(file\)/);
  assert.match(app, /extractTranscriptSuggestions\(text\)/);
  assert.match(app, /No document is uploaded to the server/);
});

test('essay documents import to the selected scholarship workspace without remote upload', () => {
  assert.match(app, /Import an existing essay draft/);
  assert.match(app, /Upload essay/);
  assert.match(app, /createEssayDraftFromDocument\(file\.name, text\)/);
  assert.match(app, /savePrepWorkspace\(\{ \.\.\.prepWorkspace, essays: \[\.\.\.prepWorkspace\.essays, essay\] \}\)/);
  assert.match(app, /not sent to the sponsor or search service/);
});

test('theme preference remains persisted and accessible', () => {
  assert.match(app, /localStorage\.getItem\('scout-theme'\)/);
  assert.match(app, /localStorage\.setItem\('scout-theme', theme\)/);
  assert.match(app, /aria-pressed=\{theme === 'light'\}/);
  assert.match(styles, /\.theme-toggle/);
});

test('profile and essay document text are not sent in scholarship discovery requests', () => {
  const searchHandler = app.slice(app.indexOf('const handleCloudSearch'), app.indexOf('const handleCloudSave'));
  assert.match(searchHandler, /runLiveScholarshipDiscovery\(/);
  assert.match(searchHandler, /selectedDiscoveryCategories/);
  assert.doesNotMatch(searchHandler, /transcript|essay|documentText|profileDraft/);
  assert.match(cloudApi, /runLiveScholarshipDiscovery/);
});
