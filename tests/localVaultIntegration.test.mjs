import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("student workspace reads and writes through the encrypted storage adapter", async () => {
  const app = await read("src/App.tsx");
  const storage = await read("src/lib/browserStorage.js");
  assert.match(app, /import \{[^}]*vaultStorage[^}]*lockLocalVault[^}]*\} from '\.\/lib\/localVault\.js'/);
  assert.match(app, /const localStorage = vaultStorage/);
  assert.match(storage, /import \{ vaultStorage \} from "\.\/localVault\.js"/);
  assert.match(storage, /resolveStorage = \(\) => vaultStorage/);
  assert.doesNotMatch(storage, /resolveStorage = \(\) => globalThis\.localStorage/);
});

test("Supabase authentication sessions use the encrypted storage adapter", async () => {
  const client = await read("src/lib/supabaseClient.ts");
  assert.match(client, /import \{ vaultStorage \} from "\.\/localVault\.js"/);
  assert.match(client, /storage:\s*vaultStorage/);
  assert.match(client, /persistSession:\s*true/);
  assert.match(client, /autoRefreshToken:\s*true/);
});

test("idle and manual vault locks stop an existing Supabase auto-refresh process", async () => {
  const app = await read("src/App.tsx");
  const client = await read("src/lib/supabaseClient.ts");
  assert.match(client, /export async function stopSupabaseAutoRefreshForVaultLock/);
  assert.match(client, /await client\.auth\.stopAutoRefresh\(\)/);
  assert.match(app, /stopSupabaseAutoRefreshForVaultLock\(\)[\s\S]*?lockLocalVault\(\)/);
});

test("the vault uses authenticated encryption and the browser's exclusive single-tab lock", async () => {
  const vault = await read("src/lib/localVault.js");
  const app = await read("src/App.tsx");
  assert.match(vault, /PBKDF2-SHA-256/);
  assert.match(vault, /iterations: LOCAL_VAULT_KDF_ITERATIONS/);
  assert.match(vault, /AES-256-GCM/);
  assert.match(vault, /600_000/);
  assert.match(vault, /new Uint8Array\(12\)/);
  assert.match(vault, /new Uint8Array\(16\)/);
  assert.match(vault, /navigator\?\.locks/);
  assert.match(vault, /mode: "exclusive", ifAvailable: true/);
  assert.match(vault, /VAULT_WEB_LOCK_NAME/);
  assert.match(vault, /activeVault\\.pendingWrites > 0 \\|\\| activeVault\\.lastError/);
  assert.doesNotMatch(vault, /BroadcastChannel/);
  assert.match(app, /15 \* 60 \* 1000/);
  assert.match(app, /Lock vault now/);
  assert.match(app, /scout:vault-persistence-error/);
  assert.doesNotMatch(app, /scout:vault-locked-elsewhere|scout:vault-lock-error/);
});

test("vault migration preserves unrelated origin storage and captures Supabase PKCE verifier", async () => {
  const vault = await read("src/lib/localVault.js");
  assert.match(vault, /key\.startsWith\("scout-"\)/);
  assert.match(vault, /SUPABASE_AUTH_STORAGE_KEY/);
  assert.match(vault, /SUPABASE_AUTH_CODE_VERIFIER_KEY/);
  assert.match(vault, /!isScoutRecord && !isCurrentSupabaseSession/);
});
