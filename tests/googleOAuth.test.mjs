import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  hasPendingAuthCallback,
  hasPendingAuthCallbackError,
  getMagicLinkRedirectUrl,
} from "../src/lib/authRedirect.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [app, home, api, client, terms, acceptance, vault] = await Promise.all([
  read("src/App.tsx"),
  read("src/features/home/StartHomePage.tsx"),
  read("src/lib/scholarshipApi.ts"),
  read("src/lib/supabaseClient.ts"),
  read("src/legal/terms.ts"),
  read("src/legal/acceptance.js"),
  read("src/lib/localVault.js"),
]);

test("Google sign-in uses the same validated app callback and limited identity scopes", () => {
  assert.match(api, /signInWithOAuth\(\{\s*provider:\s*["']google["']/);
  assert.match(api, /redirectTo:\s*getMagicLinkRedirectUrl\(\)/);
  assert.match(api, /scopes:\s*["']openid email profile["']/);
  assert.match(api, /queryParams:\s*\{\s*prompt:\s*["']select_account["']/);
});

test("anonymous cloud accounts link Google instead of switching to a different user id", () => {
  assert.match(api, /linkIdentity\(\{\s*provider:\s*["']google["']/);
  assert.match(api, /!data\.user\?\.is_anonymous/);
  assert.match(app, /cloudUser\?\.is_anonymous/);
  assert.ok(home.includes("Connect Google account"));
  assert.ok(app.includes("identity_already_exists"));
});

test("PKCE callbacks initialize Auth before the local vault gate", () => {
  assert.match(client, /flowType:\s*["']pkce["']/);
  assert.match(client, /detectSessionInUrl:\s*true/);
  assert.match(client, /storage:\s*secureAuthStorage/);
  assert.ok(app.includes("hasPendingAuthCallback()"));
  assert.ok(app.includes("hasAuthCallback && event === 'INITIAL_SESSION'"));
});

test("callback detection recognizes PKCE, provider errors, and legacy hash sessions", () => {
  assert.equal(hasPendingAuthCallback({ search: "?code=oauth-code" }), true);
  assert.equal(hasPendingAuthCallback({ search: "?error=access_denied" }), true);
  assert.equal(hasPendingAuthCallback({ hash: "#access_token=token" }), true);
  assert.equal(hasPendingAuthCallback({ search: "?tab=home" }), false);
  assert.equal(hasPendingAuthCallbackError({ search: "?error=access_denied" }), true);
  assert.equal(hasPendingAuthCallbackError({ hash: "#error=access_denied" }), true);
  assert.equal(hasPendingAuthCallbackError({ search: "?code=oauth-code" }), false);
  assert.equal(
    getMagicLinkRedirectUrl({ origin: "https://scholarship-scout.org", pathname: "/" }),
    "https://scholarship-scout.org/",
  );
});

test("Google sign-in is visible on Start/Home while Settings manages an existing account", () => {
  assert.ok(home.includes("Continue with Google"));
  assert.ok(home.includes("Continue without an account"));
  assert.ok(app.includes("handleGoogleSignIn"));
  assert.ok(app.includes("Connected account"));
  assert.ok(!app.includes('id="cloud-email"'));
  assert.ok(!app.includes("settings-auth-form"));
});

test("Google authentication and remembered-device unlock are disclosed in the current legal version", () => {
  assert.ok(terms.includes("Google and Supabase Auth process the account identifier"));
  assert.ok(terms.includes("does not request access to Gmail, Drive"));
  assert.ok(terms.includes("non-exportable cryptographic key"));
  assert.ok(terms.includes("Permanent accounts can use a one-time email sign-in link or Google OAuth"));
  assert.ok(acceptance.includes("2026-11-28.8"));
  assert.ok(vault.includes("export async function unlockLocalVaultWithDeviceKey"));
});
