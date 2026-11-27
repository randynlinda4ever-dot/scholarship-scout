import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AUTH_EMAIL_COOLDOWN_SECONDS, getAuthCooldownRemainingSeconds, isAuthRateLimitError, isExpiredAuthLinkError } from "../src/lib/authCooldown.js";
import { readWorkspaceSource } from './helpers/workspaceSource.mjs';
const app = await readWorkspaceSource();
const api = await readFile(new URL("../src/lib/scholarshipApi.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../src/lib/supabaseClient.ts", import.meta.url), "utf8");

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

test("account access and appearance preferences are grouped in Settings", () => {
  assert.match(app, /Account & cloud access/);
  assert.match(app, /Send sign-in link/);
  assert.match(app, /Check session status/);
  assert.match(app, /Optional cloud account/);
  assert.match(app, /authCooldownSeconds/);
  assert.match(app, /signed in successfully/i);
});

test("expired callback state is surfaced inside the Settings section", () => {
  assert.match(app, /isExpiredAuthLinkError/);
  assert.match(app, /That sign-in link was already used or expired/);
});

test("sign-in uses the app frame origin so the session returns to the same browser storage", () => {
  assert.match(api, /getMagicLinkRedirectUrl\(\)/);
  assert.doesNotMatch(api, /SCHOLARSHIP_SCOUT_AUTH_REDIRECT_URL|https:\/\/app\.agentgrid\.io\/artifacts/);
  assert.match(client, /detectSessionInUrl:\s*true/);
});
