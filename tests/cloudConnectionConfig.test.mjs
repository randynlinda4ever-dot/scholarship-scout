import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/lib/scholarshipApi.ts', import.meta.url), 'utf8');
const redirect = await readFile(new URL('../src/lib/authRedirect.js', import.meta.url), 'utf8');

test('Supabase initializes in preview runtimes without Vite define injection', () => {
  assert.match(client, /SUPABASE_PUBLISHABLE_KEY_FALLBACK/);
  assert.match(client, /runtimeConfig\.VITE_SUPABASE_PUBLISHABLE_KEY\s*\|\|\s*SUPABASE_PUBLISHABLE_KEY_FALLBACK/);
  assert.match(client, /supabaseConfigured = Boolean\(supabaseUrl && publishableKey\)/);
});

test('magic-link callback returns to the current embedded app origin', () => {
  assert.match(api, /getMagicLinkRedirectUrl\(\)/);
  assert.match(redirect, /locationLike\.origin/);
  assert.match(redirect, /callback\.search = ""/);
  assert.match(redirect, /callback\.hash = ""/);
  assert.doesNotMatch(api, /SCHOLARSHIP_SCOUT_AUTH_REDIRECT_URL|app\.agentgrid\.io\/artifacts/);
});
