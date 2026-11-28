import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AUTH_EMAIL_COOLDOWN_SECONDS,
  getAuthCooldownRemainingSeconds,
  isAuthRateLimitError,
  isExpiredAuthLinkError,
} from "../src/lib/authCooldown.js";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [app, home, api, client, bootstrap, accountGate] = await Promise.all([
  read("src/App.tsx"),
  read("src/features/home/StartHomePage.tsx"),
  read("src/lib/scholarshipApi.ts"),
  read("src/lib/supabaseClient.ts"),
  read("src/bootstrap.ts"),
  read("src/features/home/AccountStartGate.tsx"),
]);

test("email cooldown counts down and never becomes negative", () => {
  assert.equal(AUTH_EMAIL_COOLDOWN_SECONDS, 60);
  assert.equal(getAuthCooldownRemainingSeconds(70_000, 10_000), 60);
  assert.equal(getAuthCooldownRemainingSeconds(10_500, 10_000), 1);
  assert.equal(getAuthCooldownRemainingSeconds(9_000, 10_000), 0);
});

test("Supabase email rate-limit errors are recognized", () => {
  assert.equal(isAuthRateLimitError({ status: 429, code: "over_email_send_rate_limit" }), true);
  assert.equal(isAuthRateLimitError({ message: "email rate limit exceeded" }), true);
  assert.equal(isAuthRateLimitError({ status: 401, message: "invalid credentials" }), false);
});

test("expired or consumed one-time links receive a distinct explanation", () => {
  assert.equal(isExpiredAuthLinkError("otp_expired", ""), true);
  assert.equal(isExpiredAuthLinkError("", "Email link is invalid or has expired"), true);
  assert.equal(isExpiredAuthLinkError("", "network unavailable"), false);
});

test("sign-in and account creation live on Start/Home, not in Settings", () => {
  assert.ok(app.includes("<StartHomePage"));
  assert.ok(home.includes("Continue with email"));
  assert.ok(home.includes("Continue with Google"));
  assert.ok(home.includes("New to Scholarship Scout?"));
  assert.ok(app.includes("Connected account"));
  assert.ok(!app.includes("settings-auth-form"));
  assert.ok(!app.includes('id="cloud-email"'));
  assert.ok(app.includes("authCooldownSeconds"));
});

test("workspace requires a real account unless the visitor explicitly chooses guest mode", () => {
  assert.ok(app.includes("if (!cloudAuthReady)"));
  assert.ok(app.includes("if ((!cloudUser && !guestMode) || cloudUser?.is_anonymous)"));
  assert.ok(app.includes("setCloudAuthReady(true)"));
  assert.ok(app.includes("setTab('Overview')"));
  assert.ok(bootstrap.includes("onAuthenticated"));
  assert.ok(bootstrap.includes("onContinueGuest"));
});

test("expired callback state is surfaced on Start/Home", () => {
  assert.ok(app.includes("isExpiredAuthLinkError"));
  assert.ok(app.includes("That sign-in link was already used or expired"));
  assert.ok(app.includes("setTab('Overview')"));
});

test("sign-in uses the app frame origin and isolated encrypted auth storage", () => {
  assert.ok(api.includes("getMagicLinkRedirectUrl()"));
  assert.ok(!api.includes("SCHOLARSHIP_SCOUT_AUTH_REDIRECT_URL"));
  assert.ok(client.includes("detectSessionInUrl: true"));
  assert.ok(client.includes("storage: secureAuthStorage"));
});


test("account sign-in is not rendered until the stored session lookup completes", () => {
  const gateRender = accountGate.slice(accountGate.indexOf("if (!authReady)"));
  assert.ok(gateRender.indexOf("if (!authReady)") >= 0);
  assert.ok(gateRender.indexOf("if (!authReady)") < gateRender.indexOf("<StartHomePage"));
  assert.match(gateRender, /account-session-loading/);
  const appAuthGate = app.slice(app.indexOf("if (!cloudAuthReady)"), app.indexOf("if ((!cloudUser"));
  assert.match(appAuthGate, /account-session-loading/);
  assert.doesNotMatch(appAuthGate, /StartHomePage/);
});
