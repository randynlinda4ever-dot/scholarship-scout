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

test("Google is an alternate verified sign-in method and anonymous account linking is not exposed", async () => {
  const emailGate = await read("src/lib/emailAuthGate.js");
  assert.match(emailGate, /Continue with Google/);
  assert.match(emailGate, /signInWithGoogle/);
  assert.match(emailGate, /email_confirmed_at/);
  assert.doesNotMatch(api, /linkIdentity\(/);
  assert.doesNotMatch(app, /linkGoogleIdentity|Link Google account/);
});

test("PKCE callbacks initialize Auth even when the app initially opens on Overview", () => {
  assert.match(client, /flowType:\s*[\"']pkce[\"']/);
  assert.match(client, /detectSessionInUrl:\s*true/);
  assert.match(client, /storage:\s*encryptedAuthStorage/);
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

test("the email entry screen exposes Google sign-in without creating anonymous sessions", async () => {
  const emailGate = await read("src/lib/emailAuthGate.js");
  assert.match(emailGate, /Continue with Google/);
  assert.match(emailGate, /signInWithGoogle/);
  assert.match(emailGate, /email_confirmed_at/);
  assert.doesNotMatch(emailGate, /signInAnonymously/);
});

test("Google authentication is disclosed and requires a fresh legal acceptance", () => {
  assert.match(terms, /Google and Supabase Auth process the account identifier/);
  assert.match(terms, /does not request access to Gmail, Google Drive/);
  assert.match(acceptance, /2026-11-27\.7/);
});
