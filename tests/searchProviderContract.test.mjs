import test from "node:test";
import assert from "node:assert/strict";
import { createSearchProvider, createSearchResponseCache, searchWithFallback } from "../supabase/functions/_shared/search-provider-contract.mjs";

const today = "2026-11-25T12:00:00.000Z";
const url = "https://foundation.example/scholarships/award";
const response = (status, results = [], extra = {}) => ({ status, results, ...extra });

function providerFixtures() {
  const searxng = createSearchProvider("searxng-fixture", async () => {
    const payload = { results: [{ title: "Synthetic award", url, content: "SearXNG description", publishedDate: "2026-11-01" }] };
    return response("success", payload.results.map((item) => ({ title: item.title, url: item.url, snippet: item.content, publishedAt: item.publishedDate })), { providerRequestId: "sx-1" });
  });
  const brave = createSearchProvider("brave-shaped-fixture", async () => {
    const payload = { web: { results: [{ title: "Synthetic award", url, description: "Brave-shaped description", page_age: "2026-11-02" }] } };
    return response("success", payload.web.results.map((item) => ({ title: item.title, url: item.url, snippet: item.description, publishedAt: item.page_age })), { providerRequestId: "br-1" });
  });
  const tavily = createSearchProvider("tavily-shaped-fixture", async () => {
    const payload = { results: [{ title: "Another synthetic award", url: "https://other.example/grant", content: "Tavily-shaped description", published_date: "2026-10-30" }] };
    return response("success", payload.results.map((item) => ({ title: item.title, url: item.url, snippet: item.content, publishedAt: item.published_date })), { providerRequestId: "tv-1" });
  });
  return [searxng, brave, tavily];
}

for (const provider of providerFixtures()) {
  test("shared provider contract normalizes " + provider.name + " results and provenance", async () => {
    const result = await searchWithFallback({
      providers: [provider],
      request: { query: "synthetic scholarship", limit: 10, maxAgeDays: 60, asOf: today },
      now: () => new Date(today),
      minResults: 1,
    });
    assert.equal(result.status, "success");
    assert.equal(result.results.length, 1);
    const expectedUrl = provider.name === "tavily-shaped-fixture"
      ? "https://other.example/grant"
      : url;
    assert.equal(result.results[0].url, expectedUrl);
    assert.equal(result.results[0].provenance[0].provider, provider.name);
    assert.equal(result.results[0].provenance[0].retrievedAt, today);
    assert.equal(result.results[0].provenance[0].freshness, "fresh");
  });
}

test("partial and empty responses fall back and merge unique results with provider provenance", async () => {
  const providers = [
    createSearchProvider("first", async () => response("partial", [{ title: "Award A", url }])),
    createSearchProvider("second", async () => response("success", [
      { title: "Award A", url: url + "?utm_source=second" },
      { title: "Award B", url: "https://foundation.example/award-b" },
    ])),
  ];
  const result = await searchWithFallback({ providers, request: { query: "awards" }, minResults: 2, now: () => new Date(today) });
  assert.equal(result.status, "success");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.results.length, 2);
  assert.equal(result.results.find((item) => item.title === "Award A").provenance.length, 2);
});

test("empty first provider falls through to the next provider", async () => {
  const providers = [
    createSearchProvider("empty", async () => response("empty", [])),
    createSearchProvider("available", async () => response("success", [{ title: "Award", url }])),
  ];
  const result = await searchWithFallback({ providers, request: { query: "awards" }, minResults: 1 });
  assert.equal(result.status, "success");
  assert.equal(result.attempts.length, 2);
});

test("rate limits and outages trigger bounded fallback but do not exceed the provider cap", async () => {
  const called = [];
  const providers = [
    createSearchProvider("limited", async () => { called.push("limited"); return response("rate_limited", [], { error: { code: "429", retryable: true } }); }),
    createSearchProvider("offline", async () => { called.push("offline"); return response("unavailable", [], { error: { code: "OFFLINE", retryable: true } }); }),
    createSearchProvider("unused", async () => { called.push("unused"); return response("success", [{ title: "Award", url }]); }),
  ];
  const result = await searchWithFallback({ providers, request: { query: "awards" }, maxProvidersToTry: 2 });
  assert.deepEqual(called, ["limited", "offline"]);
  assert.equal(result.status, "unavailable");
  assert.equal(result.attempts.length, 2);
});

test("non-retryable provider errors stop fallback", async () => {
  let fallbackCalls = 0;
  const providers = [
    createSearchProvider("bad-request", async () => response("error", [], { error: { code: "INVALID_QUERY", retryable: false } })),
    createSearchProvider("must-not-run", async () => { fallbackCalls++; return response("success", [{ title: "Award", url }]); }),
  ];
  const result = await searchWithFallback({ providers, request: { query: "awards" } });
  assert.equal(result.status, "error");
  assert.equal(fallbackCalls, 0);
});

test("provider timeout is surfaced and permits a bounded next-provider attempt", async () => {
  const providers = [
    createSearchProvider("slow", async () => new Promise(() => {})),
    createSearchProvider("fast", async () => response("success", [{ title: "Award", url }])),
  ];
  const result = await searchWithFallback({
    providers, request: { query: "awards" }, minResults: 1, providerTimeoutMs: 10, totalTimeoutMs: 100,
  });
  assert.equal(result.status, "success");
  assert.equal(result.attempts[0].status, "timeout");
  assert.equal(result.attempts[1].provider, "fast");
});

test("caller cancellation aborts the active provider and prevents fallback", async () => {
  const controller = new AbortController();
  let fallbackCalls = 0;
  let observedAbort = false;
  const providers = [
    createSearchProvider("cancelled", async ({ signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => { observedAbort = true; resolve(response("cancelled", [])); }, { once: true });
      controller.abort();
    })),
    createSearchProvider("fallback", async () => { fallbackCalls++; return response("success", [{ title: "Award", url }]); }),
  ];
  const result = await searchWithFallback({ providers, request: { query: "awards", signal: controller.signal } });
  assert.equal(result.status, "cancelled");
  assert.equal(observedAbort, true);
  assert.equal(fallbackCalls, 0);
});

test("successful responses are cached with age and expired entries trigger a fresh provider call", async () => {
  let time = Date.parse(today);
  let calls = 0;
  const cache = createSearchResponseCache({ now: () => time, ttlMs: 100, maxEntries: 2 });
  const provider = createSearchProvider("cached", async () => {
    calls++;
    return response("success", [{ title: "Award", url }]);
  });
  const options = { providers: [provider], request: { query: "awards" }, cache, now: () => time, minResults: 1 };
  const first = await searchWithFallback(options);
  const second = await searchWithFallback(options);
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.equal(second.cache.ageMs, 0);
  assert.equal(calls, 1);
  time += 100;
  const third = await searchWithFallback(options);
  assert.equal(third.cache.hit, false);
  assert.equal(calls, 2);
});

test("cache keys isolate different as-of dates so freshness is recalculated", async () => {
  let calls = 0;
  const cache = createSearchResponseCache();
  const provider = createSearchProvider("as-of-cache", async () => {
    calls++;
    return response("success", [{ title: "Award", url, publishedAt: "2026-11-20" }]);
  });
  const first = await searchWithFallback({
    providers: [provider], request: { query: "awards", asOf: "2026-11-25", maxAgeDays: 10 },
    cache, minResults: 1, now: () => new Date(today),
  });
  const second = await searchWithFallback({
    providers: [provider], request: { query: "awards", asOf: "2026-12-15", maxAgeDays: 10 },
    cache, minResults: 1, now: () => new Date(today),
  });
  assert.equal(first.results[0].provenance[0].freshness, "fresh");
  assert.equal(second.results[0].provenance[0].freshness, "stale");
  assert.equal(calls, 2);
});

test("invalid as-of dates are rejected before a provider is called", async () => {
  let calls = 0;
  const provider = createSearchProvider("date-validation", async () => {
    calls++;
    return response("success", [{ title: "Award", url }]);
  });
  await assert.rejects(
    searchWithFallback({ providers: [provider], request: { query: "awards", asOf: "not-a-date" } }),
    /asOf date is invalid/i,
  );
  assert.equal(calls, 0);
});

test("partial results are not cached", async () => {
  let calls = 0;
  const cache = createSearchResponseCache();
  const provider = createSearchProvider("partial", async () => {
    calls++;
    return response("partial", [{ title: "Award", url }]);
  });
  const options = { providers: [provider], request: { query: "awards" }, cache, minResults: 5 };
  await searchWithFallback(options);
  await searchWithFallback(options);
  assert.equal(calls, 2);
});

test("source publication freshness distinguishes stale, future, and unknown dates", async () => {
  const provider = createSearchProvider("dated", async () => response("success", [
    { title: "Old", url, publishedAt: "2024-01-01" },
    { title: "Future", url: "https://foundation.example/future", publishedAt: "2027-01-01" },
    { title: "Undated", url: "https://foundation.example/undated" },
  ]));
  const result = await searchWithFallback({
    providers: [provider], request: { query: "awards", maxAgeDays: 30, asOf: today }, minResults: 3, now: () => new Date(today),
  });
  assert.deepEqual(result.results.map((item) => item.provenance[0].freshness), ["stale", "future", "unknown"]);
});

test("unsafe URLs, missing titles, and malformed provider responses are not exposed as results", async () => {
  const provider = createSearchProvider("untrusted", async () => response("success", [
    { title: "Private host", url: "https://127.0.0.1/private" },
    { title: "", url: "https://foundation.example/no-title" },
    { title: "Safe", url: "https://foundation.example/safe" },
  ]));
  const result = await searchWithFallback({ providers: [provider], request: { query: "awards" }, minResults: 1 });
  assert.equal(result.status, "success");
  assert.deepEqual(result.results.map((item) => item.title), ["Safe"]);
  const malformed = createSearchProvider("malformed", async () => ({ status: "success", results: "not-an-array" }));
  const rejected = await searchWithFallback({ providers: [malformed], request: { query: "awards" } });
  assert.equal(rejected.status, "error");
  assert.equal(rejected.error.code, "INVALID_PROVIDER_RESPONSE");
});

test("provider names are validated", () => {
  assert.throws(() => createSearchProvider("", async () => response("empty", [])), /provider name/i);
  assert.throws(() => createSearchProvider("missing-search", null), /search function/i);
});