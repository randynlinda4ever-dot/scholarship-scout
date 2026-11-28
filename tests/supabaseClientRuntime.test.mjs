import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');

test('Supabase client configuration does not require import.meta at runtime', () => {
  assert.doesNotMatch(source, /import\.meta/);
  assert.match(source, /globalThis\.__SCHOLARSHIP_SCOUT_ENV__/);
});

test('Supabase configuration keeps only the browser-safe publishable key', () => {
  assert.match(source, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /SUPABASE_PUBLISHABLE_KEY_FALLBACK/);
  assert.match(source, /supabaseConfigured = Boolean\(supabaseUrl && publishableKey\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role/i);
});

test('Supabase SDK is loaded only inside the cached client initializer', () => {
  assert.match(source, /import type \{ SupabaseClient \} from ["']@supabase\/supabase-js["']/);
  assert.doesNotMatch(source, /^import \{\s*createClient\s*\} from ["']@supabase\/supabase-js["']/m);
  const start = source.indexOf('export function getSupabaseClient()');
  assert.ok(start >= 0, 'client initializer must be exported');
  const initializer = source.slice(start);
  assert.match(initializer, /import\(["']@supabase\/supabase-js["']\)/);
  assert.match(initializer, /if \(!supabaseClientPromise\)/);
  assert.match(initializer, /supabaseClientPromise = null/);
  assert.match(initializer, /return supabaseClientPromise/);
});

test('lazy client preserves browser session persistence and callback restoration', () => {
  assert.match(source, /autoRefreshToken:\s*true/);
  assert.match(source, /persistSession:\s*true/);
  assert.match(source, /detectSessionInUrl:\s*true/);
  assert.match(source, /storage:\s*secureAuthStorage/);
});
