import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const client = await read('src/lib/supabaseClient.ts');
const api = await read('src/lib/scholarshipApi.ts');
const migration = await read('supabase/migrations/202611100001_restrict_anon_privileges.sql');

test('personal academic values are not shipped in the app source', () => {
  assert.doesNotMatch(app, /3\.82609|15 of 178|ACT 31\s*\/\s*SAT 1350|710 Evidence-Based Reading/);
  const start = app.indexOf('const initialProfile: Profile = {');
  const end = app.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'initial profile must remain defined');
  const defaults = app.slice(start, end);
  for (const field of ['state', 'county', 'school', 'graduationYear', 'gpa', 'classRank', 'act', 'sat', 'activities']) {
    assert.match(defaults, new RegExp(`\\b${field}: ''`), `${field} must not contain a shipped personal default`);
  }
});

test('an existing browser profile remains locally stored and loadable', () => {
  assert.match(app, /const readLocalJson = \(key: string\): unknown =>/);
  assert.match(app, /mergeProfile\(readLocalJson\('scout-profile'\)\)/);
});

test('Supabase sessions persist and refresh automatically in the browser', () => {
  assert.match(client, /autoRefreshToken:\s*true/);
  assert.match(client, /persistSession:\s*true/);
  assert.match(client, /detectSessionInUrl:\s*true/);
  assert.match(app, /client\.auth\.onAuthStateChange/);
  assert.match(app, /if \(tab !== 'Settings' && tab !== 'Cloud Search'\) return;/);
  assert.match(app, /getSupabaseClient\(\)\.then\(\(client\) =>/);
});

test('browser application code never embeds a privileged Supabase key', () => {
  assert.doesNotMatch(`${client}\n${api}\n${app}`, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role/i);
});

test('database hardening removes anonymous table access and non-row-scoped authenticated privileges', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon/i);
  assert.match(migration, /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON ALL TABLES IN SCHEMA public FROM authenticated/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated/i);
  assert.doesNotMatch(migration, /ALTER DEFAULT PRIVILEGES/i);
});