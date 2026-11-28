import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settings = app.slice(app.indexOf("{tab === 'Settings'"), app.indexOf("{tab === 'Discovery'"));

test('settings does not repeat cloud access explanations and exposes one account status control', () => {
  assert.doesNotMatch(settings, /className="cloud-steps"/);
  assert.equal((settings.match(/>Refresh account status<\/button>/g) || []).length, 1);
});

test('settings explains required email access, local encryption, and backup recovery', () => {
  assert.match(settings, /A verified email account is required to open Scholarship Scout/);
  assert.match(settings, /encrypted local workspace/);
  assert.match(settings, /Only scholarship sponsor records you explicitly save/);
  assert.match(settings, /different device needs an encrypted backup restore/);
});
