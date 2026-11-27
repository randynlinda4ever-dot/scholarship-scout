import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const functionSource = await readFile(new URL("../supabase/functions/_shared/scholarship-discovery.mjs", import.meta.url), "utf8");
const entrypointSource = await readFile(new URL("../supabase/functions/scholarship-discover/index.ts", import.meta.url), "utf8");

test("scholarship discovery uses the public SearXNG gateway without database writes", () => {
  assert.match(entrypointSource, /createScholarshipDiscoveryHandler/);
  assert.doesNotMatch(functionSource, /withSupabase\(\{\s*auth:\s*"user"\s*\}/);
  assert.match(functionSource, /rateLimiter\(req\)/);
  assert.match(functionSource, /MAX_BODY_BYTES/);
  assert.match(functionSource, /getEnv\("SEARXNG_GATEWAY_URL"\)/);
  assert.match(functionSource, /getEnv\("SEARXNG_GATEWAY_TOKEN"\)/);
  assert.match(functionSource, /gatewayToken/);
  assert.match(functionSource, /new URL\("\/search",\s*gatewayBase\)/);
  assert.match(functionSource, /method:\s*"GET"/);
  assert.match(functionSource, /provider:\s*"searxng"/);
  assert.doesNotMatch(functionSource, /EXA_API_KEY|api\.exa\.ai/i);
  assert.doesNotMatch(functionSource, /\.from\(["'](?:student_profiles|scholarships|eligibility_checks)["']\)\s*\.(?:insert|update|upsert|delete)/);
  assert.doesNotMatch(functionSource, /student_profiles|eligibility_checks/);
});

test("live discovery allows only generic reusable categories", () => {
  assert.match(functionSource, /ALLOWED_CATEGORIES/);
  for (const forbidden of ["example_district_id", "shh", "nse_npe", "texas_4h"]) assert.equal(functionSource.includes(forbidden), false);
  for (const required of ["local", "school_resources", "regional", "state", "academic", "humanities", "leadership", "community_service", "language", "employment", "arts", "incoming_college", "national", "general"]) {
    assert.ok(functionSource.includes('"' + required + '"') || functionSource.includes(required + ":"), "missing generic category: " + required);
  }
  assert.match(functionSource, /graduationYear/);
  assert.match(functionSource, /MAX_CATEGORIES\s*=\s*4/);
  assert.match(functionSource, /Array\.isArray/);
  assert.match(functionSource, /isSafeHttpsUrl/);
});

test("SearXNG results remain unverified leads until sponsor evidence is reviewed", () => {
  assert.match(functionSource, /award_text:\s*null/);
  assert.match(functionSource, /deadline:\s*null/);
  assert.match(functionSource, /source_authority:\s*"unverified-lead"/);
  assert.match(functionSource, /verification_state:\s*"unverified_lead"/);
  assert.match(functionSource, /provider:\s*null/);
  assert.match(functionSource, /last_checked_date:\s*null/);
  assert.match(functionSource, /source_checked_at:\s*null/);
});

test("discovery searches independent category variations over two bounded pages", () => {
  assert.match(functionSource, /CATEGORY_VARIATIONS/);
  assert.match(functionSource, /MAX_SEARCH_PAGE\s*=\s*2/);
  assert.match(functionSource, /searchUrl\.searchParams\.set\("pageno",\s*String\(job\.page\)\)/);
  assert.match(functionSource, /SEARCH_CONCURRENCY\s*=\s*4/);
  assert.match(functionSource, /runBoundedSearches/);
});

test("discovery reports partial search failures and keeps source provenance", () => {
  assert.match(functionSource, /failedQueries/);
  assert.match(functionSource, /rawResultCount/);
  assert.match(functionSource, /discovery_categories/);
  assert.match(functionSource, /discovery_queries/);
  assert.match(functionSource, /discovery_pages/);
  assert.match(functionSource, /Some category or page searches did not complete/);
});

test("live search does not write scholarship or personal profile rows", () => {
  assert.doesNotMatch(functionSource, /\.from\(["'](?:student_profiles|scholarships|eligibility_checks)["']\)/);
});
