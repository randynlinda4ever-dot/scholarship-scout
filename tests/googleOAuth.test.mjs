import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasPendingAuthCallback, hasPendingAuthCallbackError, getMagicLinkRedirectUrl } from "../src/lib/authRedirect.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [app, api, client, terms, acceptance] = await Promise.all([
  read("src/App.tsx"),
  read("src/lib/scholarshipApi.ts"),
  read("src/lib/supabaseClient.ts"),
  read("src/legal/terms.ts"),
  read("src/legal/acceptance.js"),
]);

test("Google sign-in uses the same validated app callback and limited identity scopes", () => {
  assert.match(api, /signInWithOAuth\(\{\s*provider:\s*[\"']google[\"']/);
  assert.match(api, /redirectTo:\s*getMagicLinkRedirectUrl\(\)/);
  assert.match(api, /scopes:\s*[\"']openid email profile[\"']/);
  assert.match(api, /queryParams:\s*\{\s*prompt:\s*[\"']select_account[\"']/);
});

test("anonymous cloud accounts link Google instead of switching to a different user id", () => {
  assert.match(api, /linkIdentity\(\{\s*provider:\s*[\"']google[\"']/);
  assert.match(api, /!data\.user\?\.is_anonymous/);
  assert.match(app, /cloudUser\?\.is_anonymous/);
  assert.match(app, /Link Google account/);
  assert.match(app, /identity_already_exists/);
});

test("PKCE callbacks initialize Auth even when the app initially opens on Overview", () => {
  assert.match(client, /flowType:\s*[\"']pkce[\"']/);
  assert.match(client, /detectSessionInUrl:\s*true/);
  assert.match(client, /storage:\s*vaultStorage/);
  assert.match(app, /hasPendingAuthCallback\(\)/);
  assert.match(app, /hasAuthCallback && event === 'INITIAL_SESSION'/);
});

test("callback detection recognizes PKCE, provider errors, and legacy hash sessions", () => {
  assert.equal(hasPendingAuthCallback({ search: "?code=oauth-code" }), true);
  assert.equal(hasPendingAuthCallback({ search: "?error=access_denied" }), true);
  assert.equal(hasPendingAuthCallback({ hash: "#access_token=token" }), true);
  assert.equal(hasPendingAuthCallback({ search: "?tab=home" }), false);
  assert.equal(hasPendingAuthCallbackError({ search: "?error=access_denied" }), true);
  assert.equal(hasPendingAuthCallbackError({ hash: "#error=access_denied" }), true);
  assert.equal(hasPendingAuthCallbackError({ search: "?code=oauth-code" }), false);
  assert.equal(getMagicLinkRedirectUrl({ origin: "https://scholarship-scout.org", pathname: "/" }), "https://scholarship-scout.org/");
});

test("Settings exposes Google sign-in when signed out and identity linking for anonymous users", () => {
  assert.match(app, /Continue with Google/);
  assert.match(app, /Link Google account/);
  assert.match(app, /handleGoogleSignIn/);
  assert.match(app, /Google sign-in is not enabled for this project yet/);
});

test("Google authentication is disclosed and requires a fresh legal acceptance", () => {
  assert.match(terms, /Google and Supabase Auth process the account identifier/);
  assert.match(terms, /does not request access to Gmail, Drive/);
  assert.match(acceptance, /2026-11-27\.4/);
});
