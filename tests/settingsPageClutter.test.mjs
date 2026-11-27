import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settings = app.slice(app.indexOf("{tab === 'Settings'"), app.indexOf("{tab === 'Discovery'"));

test('settings does not repeat cloud access explanations and session controls', () => {
  assert.doesNotMatch(settings, /className="cloud-steps"/);
  assert.equal((settings.match(/>Check session status<\/button>/g) || []).length, 1);
});

test('settings retains the essential local-data and optional cloud account explanation', () => {
  assert.match(settings, /Your student profile, essays, and local tracker remain on this device/);
  assert.match(settings, /Public live search works without signing in/);
  assert.match(settings, /Email sign-in is only needed to save sponsor records/);
});
