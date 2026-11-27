import test from "node:test";
import assert from "node:assert/strict";
import { getMagicLinkRedirectUrl } from "../src/lib/authRedirect.js";

test("magic link returns to the same embedded app origin that initiated sign-in", () => {
  const location = {
    href: "https://bundler.sandbox.animaapp.ai/?preview=abc#old-auth-state",
    origin: "https://bundler.sandbox.animaapp.ai",
    pathname: "/",
  };
  assert.equal(getMagicLinkRedirectUrl(location), "https://bundler.sandbox.animaapp.ai/");
});

test("magic link callback keeps the app path but removes stale query and hash state", () => {
  const location = {
    href: "https://preview.example.test/scout?session=temporary#access_token=old",
    origin: "https://preview.example.test",
    pathname: "/scout",
  };
  assert.equal(getMagicLinkRedirectUrl(location), "https://preview.example.test/scout");
});

test("rejects insecure non-local callback origins", () => {
  assert.throws(() => getMagicLinkRedirectUrl({
    origin: "http://preview.example.test",
    pathname: "/",
  }), /HTTPS/);
});
