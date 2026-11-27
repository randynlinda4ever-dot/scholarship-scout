import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const app = await read('src/App.tsx');
const client = await read('src/lib/supabaseClient.ts');
const api = await read('src/lib/scholarshipApi.ts');
const migration = await read('supabase/migrations/202611100001_restrict_anon_privileges.sql');
const defaultPrivilegesMigration = await read('supabase/migrations/20261127052519_restrict_public_default_privileges_for_postgres.sql');
const ownerRelationsMigration = await read('supabase/migrations/20261127120000_enforce_owner_scoped_relations_and_fk_indexes.sql');
const discoveryEntrypoint = await read('supabase/functions/scholarship-discover/index.ts');
const workflow = await read('.github/workflows/ci.yml');

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
  assert.match(app, /const hasAuthCallback = hasPendingAuthCallback\(\);/);
  assert.match(app, /if \(tab !== 'Settings' && tab !== 'Cloud Search' && !hasAuthCallback\) return;/);
  assert.match(app, /getSupabaseClient\(\)\.then\(\(client\) =>/);
});

test('browser application code never embeds a privileged Supabase key', () => {
  assert.doesNotMatch(`${client}\n${api}\n${app}`, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role/i);
});

test('database hardening removes anonymous table access and non-row-scoped authenticated privileges', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon/i);
  assert.match(migration, /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON ALL TABLES IN SCHEMA public FROM authenticated/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated/i);
});

test('future postgres-owned public objects do not inherit anon or authenticated grants', () => {
  assert.match(defaultPrivilegesMigration, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
  assert.match(defaultPrivilegesMigration, /REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated/);
  assert.match(defaultPrivilegesMigration, /REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated/);
  assert.match(defaultPrivilegesMigration, /REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated/);
  assert.match(defaultPrivilegesMigration, /REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  assert.doesNotMatch(defaultPrivilegesMigration, /FOR ROLE supabase_admin/i);
});

test('the production discovery source never falls back to per-isolate rate limiting', () => {
  assert.match(discoveryEntrypoint, /createUpstashRateLimiter/);
  assert.match(discoveryEntrypoint, /getDiscoveryRateLimitConfig/);
  assert.match(discoveryEntrypoint, /UPSTASH_REDIS_REST_URL/);
  assert.match(discoveryEntrypoint, /UPSTASH_REDIS_REST_TOKEN/);
  assert.doesNotMatch(discoveryEntrypoint, /createPublicRateLimiter/);
});

test('cloud foreign-key relationships remain inside the authenticated owner boundary', () => {
  assert.match(ownerRelationsMigration, /source_id IS NULL[\s\S]*?FROM public\.scholarship_sources[\s\S]*?source\.owner_id = auth\.uid\(\)/);
  assert.match(ownerRelationsMigration, /FROM public\.scholarships AS scholarship[\s\S]*?scholarship\.owner_id = auth\.uid\(\)/);
});

test('cloud relationship foreign keys have supporting indexes for cascades', () => {
  assert.match(ownerRelationsMigration, /ON public\.scholarships \(source_id\)/);
  assert.match(ownerRelationsMigration, /ON public\.eligibility_checks \(scholarship_id\)/);
});

test('GitHub Actions are pinned to immutable commit SHAs and checkout credentials are not persisted', () => {
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(workflow, /actions\/dependency-review-action@bbc44d14a204704ccc493733616cd1e93a0321ec/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
});
