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

test("keeps scheme-relative-looking callback paths on the initiating origin", () => {
  const callback = new URL(getMagicLinkRedirectUrl({
    origin: "https://scholarship-scout.org",
    pathname: "//attacker.example",
  }));
  assert.equal(callback.origin, "https://scholarship-scout.org");
});

test("allows only plain HTTP on the exact localhost development host", () => {
  assert.equal(getMagicLinkRedirectUrl({
    origin: "http://localhost:5173",
    pathname: "/scout",
  }), "http://localhost:5173/scout");
  assert.throws(() => getMagicLinkRedirectUrl({
    origin: "ftp://localhost",
    pathname: "/",
  }), /HTTPS/);
});
