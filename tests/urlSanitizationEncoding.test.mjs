import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePublicHttpsUrl } from "../src/lib/evidence.js";

test("removes double-encoded private values from otherwise ordinary query parameters", () => {
  const sanitized = sanitizePublicHttpsUrl("https://example.org/award?id=student%2540example.com&category=academic");
  const parsed = new URL(sanitized);
  assert.equal(parsed.searchParams.has("id"), false);
  assert.equal(parsed.searchParams.get("category"), "academic");
});

test("removes double-encoded sensitive parameter names", () => {
  const sanitized = sanitizePublicHttpsUrl("https://example.org/award?%2570assword=secret&category=academic");
  const parsed = new URL(sanitized);
  assert.equal(parsed.searchParams.has("password"), false);
  assert.equal(parsed.searchParams.get("category"), "academic");
});

test("removes double-encoded credential fragments but preserves ordinary anchors", () => {
  assert.equal(
    new URL(sanitizePublicHttpsUrl("https://example.org/award#%2561ccess_token=secret")).hash,
    "",
  );
  assert.equal(
    new URL(sanitizePublicHttpsUrl("https://example.org/award#eligibility")).hash,
    "#eligibility",
  );
});
