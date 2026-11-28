import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  APP_OWNED_LOCAL_STORAGE_KEYS,
  APP_OWNED_SESSION_STORAGE_KEYS,
  AUTH_STORAGE_KEY_MIGRATION,
  PRIVATE_VAULT_RECORD_KEYS,
  SESSION_ONLY_RECORD_KEYS,
  UI_PREFERENCE_RECORD_KEYS,
  isPrivateVaultRecordKey,
} from '../src/lib/vaultRecordPolicy.js';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('the private vault has an explicit allowlist with no preferences or auth records', () => {
  assert.deepEqual(PRIVATE_VAULT_RECORD_KEYS, [
    'scout-profile',
    'scout-profile-draft',
    'scout-scholarships',
    'scout-application-progress',
    'scout-application-workspace',
    'scout-resource-workspace',
  ]);
  for (const key of UI_PREFERENCE_RECORD_KEYS) assert.equal(isPrivateVaultRecordKey(key), false);
  for (const { sourceKey } of AUTH_STORAGE_KEY_MIGRATION) assert.equal(isPrivateVaultRecordKey(sourceKey), false);
  for (const key of SESSION_ONLY_RECORD_KEYS) assert.equal(isPrivateVaultRecordKey(key), false);
  assert.equal(isPrivateVaultRecordKey('scout-private-unknown'), false);
});

test('storage inventory classifies local preferences, session-only keys, and secure authentication separately', () => {
  assert.ok(UI_PREFERENCE_RECORD_KEYS.includes('scout-theme'));
  assert.ok(UI_PREFERENCE_RECORD_KEYS.includes('scout-compact-view'));
  assert.ok(SESSION_ONLY_RECORD_KEYS.includes('scout-auth-email-cooldown-until'));
  assert.ok(AUTH_STORAGE_KEY_MIGRATION.some(({ sourceKey, targetKey }) =>
    sourceKey === 'sb-wjrwvempgjvoxlioodse-auth-token' && targetKey === 'scholarship-scout-auth'));
  assert.ok(APP_OWNED_LOCAL_STORAGE_KEYS.includes('scholarship-scout.legal-acceptance'));
  assert.ok(APP_OWNED_LOCAL_STORAGE_KEYS.includes('scout-local-reliability'));
  assert.ok(APP_OWNED_SESSION_STORAGE_KEYS.includes('scholarship-scout-guest-session'));
  assert.equal(new Set(APP_OWNED_LOCAL_STORAGE_KEYS).size, APP_OWNED_LOCAL_STORAGE_KEYS.length);
});

test('Supabase uses a separate encrypted auth adapter rather than the private vault', async () => {
  const client = await read('src/lib/supabaseClient.ts');
  const authStorage = await read('src/lib/secureAuthStorage.js');
  const vault = await read('src/lib/localVault.js');
  assert.match(client, /storage:\s*secureAuthStorage/);
  assert.match(authStorage, /AES-GCM/);
  assert.match(vault, /filter\(\(\[key\]\) => isPrivateVaultRecordKey\(key\)\)/);
  assert.match(vault, /migrateLegacyAuthStorage/);
  assert.match(vault, /migrateLegacyVaultRecords/);
});

test('the server enforces one encrypted account vault row per account and owner-only access', async () => {
  const migration = await read('supabase/migrations/20261128040833_create_account_vault_backups.sql');
  const api = await read('src/lib/scholarshipApi.ts');
  assert.match(migration, /user_id uuid primary key references auth\.users/);
  assert.match(migration, /alter table public\.account_vault_backups enable row level security/);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(api, /\.insert\(\{/);
  assert.match(api, /error\?\.code === "23505"/);
  assert.match(api, /A single encrypted account vault already exists/);
});
