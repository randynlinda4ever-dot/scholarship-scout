import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const supabaseBase = "https://wjrwvempgjvoxlioodse.supabase.co/functions/v1";

test("RFC 9727 catalog is a valid Linkset for the two deployed application APIs", async () => {
  const catalog = JSON.parse(await read("public/.well-known/api-catalog"));
  assert.ok(Array.isArray(catalog.linkset));
  assert.equal(catalog.linkset.length, 2);

  const expectedAnchors = [
    `${supabaseBase}/scholarship-discover`,
    `${supabaseBase}/account-delete`,
  ];
  assert.deepEqual(catalog.linkset.map((entry) => entry.anchor).sort(), expectedAnchors.sort());

  for (const entry of catalog.linkset) {
    assert.ok(Array.isArray(entry["service-desc"]), `${entry.anchor} must link to an API description`);
    assert.ok(Array.isArray(entry["service-doc"]), `${entry.anchor} must link to human-readable docs`);
    for (const link of [...entry["service-desc"], ...entry["service-doc"]]) {
      assert.equal(new URL(link.href).protocol, "https:");
      assert.equal(typeof link.type, "string");
    }
  }
});

test("each catalog entry points to the published OpenAPI specification and its API-specific docs", async () => {
  const catalog = JSON.parse(await read("public/.well-known/api-catalog"));
  const spec = JSON.parse(await read("public/api/openapi.json"));
  const docs = await read("public/api-docs.html");

  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/scholarship-discover"]?.post);
  assert.ok(spec.paths["/account-delete"]?.post);
  assert.equal(spec.paths["/scholarship-verify"], undefined);
  assert.match(docs, /id="scholarship-discovery"/);
  assert.match(docs, /id="account-deletion"/);

  for (const entry of catalog.linkset) {
    const description = entry["service-desc"].find((link) => link.href.endsWith("/api/openapi.json"));
    const documentation = entry["service-doc"].find((link) => link.href.includes("/api-docs.html#"));
    assert.ok(description, `${entry.anchor} must link to the OpenAPI description`);
    assert.ok(documentation, `${entry.anchor} must link to its API documentation`);
    assert.match(docs, new RegExp(`id="${documentation.href.split("#")[1]}"`));
  }
});

test("Vercel serves the exact well-known path with RFC 9727 media type and HEAD discovery Link", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const headerRule = config.headers?.find((entry) => entry.source === "/.well-known/api-catalog");
  assert.ok(headerRule, "catalog response headers must be configured on the exact well-known path");

  const headers = Object.fromEntries(headerRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.match(headers["content-type"], /^application\/linkset\+json\s*;/i);
  assert.match(headers["content-type"], /profile="https:\/\/www\.rfc-editor\.org\/info\/rfc9727"/);
  assert.match(headers.link, /<https:\/\/scholarship-scout\.org\/.well-known\/api-catalog>;\s*rel="?api-catalog"?/i);
  assert.match(headers["cache-control"], /public/i);

  const rootRule = config.headers?.find((entry) => entry.source === "/");
  assert.ok(rootRule?.headers.some((header) => header.key.toLowerCase() === "link" && header.value.includes('rel="api-catalog"')));

  const fallback = config.rewrites.find((entry) => entry.source.includes("(?!"));
  assert.ok(fallback, "the application SPA fallback must remain configured");
  assert.ok(fallback.source.includes("[.]well-known(?:/|$)"), "the extensionless catalog must bypass the SPA fallback");
  const fallbackMatcher = new RegExp("^" + fallback.source);
  assert.equal(fallbackMatcher.test("/.well-known/api-catalog"), false);
  assert.equal(fallbackMatcher.test("/resources"), true);
});

test("public API schemas expose only broad discovery filters and no secrets", async () => {
  const [catalogText, specText] = await Promise.all([
    read("public/.well-known/api-catalog"),
    read("public/api/openapi.json"),
  ]);
  const catalog = JSON.parse(catalogText);
  const spec = JSON.parse(specText);
  const profileProperties = Object.keys(spec.components.schemas.ScholarshipDiscoveryRequest.properties.profile.properties);
  assert.deepEqual(profileProperties.sort(), ["graduationYear", "state"]);
  assert.doesNotMatch(`${catalogText}\n${specText}`, /sb_(?:publishable|secret)_[A-Za-z0-9_-]{20,}/i);
  assert.doesNotMatch(specText, /service_role|SEARXNG_GATEWAY_TOKEN|SUPABASE_SECRET_KEY|student_profiles|classRank|testScores|essayDraft/i);
  assert.deepEqual(spec.paths["/account-delete"].post.security, [
    { supabasePublishableKey: [], supabaseUserAccessToken: [] },
  ]);
});
