import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account deletion derives the account from a verified caller, never a browser-supplied user id", async () => {
  const source = await read("supabase/functions/account-delete/index.ts");
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /auth\.admin\.deleteUser\(user\.id/);
  assert.doesNotMatch(source, /body\.(?:userId|user_id|accountId|account_id)/i);
  assert.match(source, /confirmation\s*!==\s*["']DELETE_MY_ACCOUNT["']/);
});

test("account deletion requires the authenticated edge-function gateway and a server-only key", async () => {
  const source = await read("supabase/functions/account-delete/index.ts");
  assert.match(source, /Deno\.env\.get\(["']SUPABASE_SECRET_KEYS["']\)/);
  assert.match(source, /Deno\.env\.get\(["']SUPABASE_SERVICE_ROLE_KEY["']\)/);
  assert.match(source, /Deno\.env\.get\(["']SUPABASE_SECRET_KEY["']\)/);
  assert.doesNotMatch(source, /import\.meta\.env|VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE)/i);
  assert.match(source, /createClient\(/);
  assert.match(source, /Authorization/);
  assert.match(source, /readBoundedJsonBody\(request,\s*2048\)/);
  assert.doesNotMatch(source, /request\.json\(\)/);
  const tree = await read("supabase/config.toml");
  assert.match(tree, /\[functions\.account-delete\][\s\S]*?verify_jwt\s*=\s*true/);
});

test("account deletion UI requires deliberate confirmation and warns about other devices", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /DELETE MY ACCOUNT/);
  assert.match(app, /other devices/i);
  assert.match(app, /deleteCloudAccount/);
  assert.match(app, /destroyLocalVault/);
  assert.match(app, /all devices/i);
  assert.match(app, /access tokens may remain valid until their scheduled expiry/i);
});

test("account deletion revokes every refresh-token session before deleting the verified user", async () => {
  const source = await read("supabase/functions/account-delete/index.ts");
  const revokeIndex = source.indexOf('adminClient.auth.admin.signOut(token, "global")');
  const deleteIndex = source.indexOf("adminClient.auth.admin.deleteUser(user.id)");

  assert.ok(revokeIndex >= 0, "global refresh-session revocation must be present");
  assert.ok(deleteIndex > revokeIndex, "refresh sessions must be revoked before deleting the Auth user");
  assert.match(source, /access-token JWTs already issued to devices can remain valid until their\s*\/\/\s*expiry/i);
});

test("deletion disclosures cover cloud cascade, token expiry, and the local-device boundary", async () => {
  const docs = await read("docs/privacy-and-security.md");
  assert.match(docs, /ON DELETE CASCADE/);
  assert.match(docs, /all current account-owned rows/i);
  assert.match(docs, /no file-upload path.*no Storage buckets/is);
  assert.match(docs, /cannot erase another browser profile or device/i);
});

test("privacy request and deletion UI do not expose internal service names or implementation settings", async () => {
  const terms = await read("src/legal/terms.ts");
  assert.doesNotMatch(terms, /SearXNG|Edge Function|verify_jwt|Upstash|service_role|project_ref|table_name|functions\/v1/i);
  assert.match(terms, /Automated live discovery currently supports U\.S\. state targeting only/i);
  assert.match(terms, /selected U\.S\. state, expected graduation year, and selected scholarship category IDs/i);
  assert.match(terms, /permanent cloud-account deletion workflow/i);
  assert.match(terms, /privacy-request form in Settings/i);
});
