import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_CATEGORIES, buildSearchJobs, canonicalizeUrl, createDiscoveryResultCache,
  createPublicRateLimiter, createUpstashRateLimiter, createScholarshipDiscoveryHandler, fetchSearchPage,
  isSafeHttpsUrl, normalizeAndRankResults, runAdaptiveSearches, runBoundedSearches,
} from "../supabase/functions/_shared/scholarship-discovery.mjs";

const categories = [...ALLOWED_CATEGORIES];
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const request = (body, headers = {}) => new Request("https://edge.test/discover", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1", ...headers }, body: JSON.stringify(body) });
const baseBody = { profile: { state: "Texas", graduationYear: "2027" }, categories: ["local"] };
const deps = (overrides = {}) => ({ getEnv: (key) => key === "SEARXNG_GATEWAY_URL" ? "https://gateway.example" : "x".repeat(64), now: () => new Date("2026-11-13T12:00:00.000Z"), randomUUID: (() => { let n = 0; return () => `uuid-${++n}`; })(), fetchImpl: async () => response({ results: [] }), ...overrides });

test("the public category allowlist contains exactly fourteen categories", () => assert.equal(categories.length, 14));
test("search job generation creates three distinct variations and two pages per selected category", () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "arts"]);
  assert.equal(jobs.length, 12);
  assert.deepEqual(jobs.map((job) => job.page), [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2]);
  assert.ok(jobs.every((job) => job.query.includes("Texas") && job.query.includes("2027")));
});
test("progressive search stops expanding categories once they yield eight distinct leads", async () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "arts"]);
  const calls = [];
  const outcomes = await runAdaptiveSearches("https://gateway.example", "token", jobs, {
    minimumUniqueResults: 8,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      calls.push({ query: parsed.searchParams.get("q"), page: Number(parsed.searchParams.get("pageno")) });
      return response({ results: Array.from({ length: 8 }, (_, index) => ({
        title: `Student Scholarship ${calls.length} ${index}`,
        url: `https://results-${calls.length}-${index}.example/award`,
        content: "Eligible students may apply for this scholarship award."
      })) });
    },
  });

  assert.equal(outcomes.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.page === 1));
  assert.deepEqual(new Set(outcomes.map((outcome) => outcome.job.category)), new Set(["local", "arts"]));
});

test("progressive search expands only underfilled categories and preserves full fallback coverage", async () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "state"]);
  const calls = [];
  const outcomes = await runAdaptiveSearches("https://gateway.example", "token", jobs, {
    minimumUniqueResults: 8,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const query = parsed.searchParams.get("q");
      const category = query.includes("local and county") ? "local" : "state";
      const page = Number(parsed.searchParams.get("pageno"));
      calls.push({ category, page, query });
      const results = category === "local" && page === 1
        ? Array.from({ length: 8 }, (_, index) => ({ title: `Local Student Scholarship ${index}`, url: `https://local-${index}.example/a`, content: "Eligible local students may apply for this scholarship before the deadline." }))
        : [];
      return response({ results });
    },
  });

  assert.equal(outcomes.length, 7);
  assert.equal(calls.length, 7);
  assert.equal(calls.filter((call) => call.category === "local").length, 1);
  assert.equal(calls.filter((call) => call.category === "state").length, 6);
  assert.deepEqual(calls.filter((call) => call.category === "state").map((call) => [call.page, call.query.includes("statewide")]), [
    [1, true], [2, true], [1, false], [2, false], [1, false], [2, false],
  ]);
});

test("cache expires entries and evicts the least recently used key", () => {
  let time = 0;
  const cache = createDiscoveryResultCache({ now: () => time, ttlMs: 50, maxEntries: 2 });
  cache.set("a", { results: [1] });
  cache.set("b", { results: [2] });
  assert.deepEqual(cache.get("a").value, { results: [1] });
  cache.set("c", { results: [3] });
  assert.equal(cache.get("b"), null);
  assert.deepEqual(cache.get("a").value, { results: [1] });
  time = 50;
  assert.equal(cache.get("a"), null);
  assert.equal(cache.size, 0);
});

test("handler serves a fresh cache hit without another provider request and reports saved calls", async () => {
  let fetchCount = 0;
  const handler = createScholarshipDiscoveryHandler(deps({ fetchImpl: async () => {
    fetchCount++;
    return response({ results: Array.from({ length: 8 }, (_, index) => ({
      title: `Synthetic Scholarship ${index}`,
      url: `https://fund-${index}.example/award`,
      content: "Scholarship for Texas graduating high-school students, class of 2027. Eligible applicants can apply before the deadline.",
    })) });
  } }));

  const first = await handler(request(baseBody));
  const second = await handler(request(baseBody));
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(fetchCount, 1);
  assert.equal(firstBody.summary.cacheHit, false);
  assert.equal(secondBody.summary.cacheHit, true);
  assert.equal(secondBody.summary.requestedQueries, 0);
  assert.equal(secondBody.summary.queriesAvoided, firstBody.summary.requestedQueries);
  assert.equal(secondBody.summary.uniqueResults, firstBody.results.length);
  assert.ok(secondBody.summary.cacheAgeMs >= 0);
});

test("canonical URL removes tracking, personal and credential query parameters", () => {
  assert.equal(canonicalizeUrl("https://example.org/award?page=2&email=student%40example.test&studentId=123&access_token=secret&utm_source=mail#top"), "https://example.org/award?page=2");
});

test("returned source URLs must be safe HTTPS hostnames", () => {
  for (const url of [
    "http://example.org", "https://localhost", "https://127.0.0.1", "https://[::1]",
    "https://user:pass@example.org", "https://metadata.google.internal",
    "https://router.home.arpa", "https://nas.lan", "https://service.intranet",
  ]) assert.equal(isSafeHttpsUrl(url), false, url);
  assert.equal(isSafeHttpsUrl("https://foundation.example/scholarships"), true);
});
test("canonical URL removes tracking and fragments and sorts remaining query parameters", () => {
  assert.equal(canonicalizeUrl("https://example.org/path/?z=2&utm_source=mail&a=1#top"), "https://example.org/path?a=1&z=2");});test("normalization deduplicates canonical URL/title records and merges provenance", () => {
  const jobA = { category: "local", query: "local search", page: 1 };
  const jobB = { category: "state", query: "state search", page: 2 };
  const outcomes = [{ ok: true, job: jobA, results: [{ title: "Texas Student Scholarship", url: "https://www.example.org/award?utm_source=a", content: "short" }] }, { ok: true, job: jobB, results: [{ title: "Texas Student Scholarship", url: "https://example.org/award#details", content: "A longer description for the same scholarship." }] }];
  const { results, rawResultCount } = normalizeAndRankResults(outcomes, "2026-11-13T12:00:00.000Z", "Texas", 2027, { randomUUID: () => "fixed-id" });
  assert.equal(rawResultCount, 2);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "fixed-id");
  assert.deepEqual(results[0].discovery_categories, ["local", "state"]);
  assert.deepEqual(results[0].discovery_pages, [1, 2]);
  assert.match(results[0].excerpt, /longer description/);
});
test("retries one transient rate-limit response with a bounded wait", async () => {
  let attempts = 0;
  const waits = [];
  const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1, variation: 1 }, {
    sleepImpl: async (milliseconds) => waits.push(milliseconds),
    fetchImpl: async () => {
      attempts++;
      return attempts === 1
        ? new Response("rate limited", { status: 429, headers: { "Retry-After": "0.2" } })
        : response({ results: [{ title: "Recovered synthetic lead", url: "https://fund.example/recovered" }] });
    },
  });

  assert.equal(outcome.ok, true);
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [200]);
  assert.equal(outcome.retryAttempts, 1);
});

test("retries a valid HTTP-date Retry-After within the remaining total budget", async () => {
  const initialTime = Date.parse("2026-11-25T23:00:00.000Z");
  let currentTime = initialTime;
  let attempts = 0;
  const waits = [];
  const retryAfter = new Date(initialTime + 1_000).toUTCString();
  const outcome = await fetchSearchPage("https://gateway.example", "token", {
    category: "local", query: "date retry", page: 1, variation: 1,
  }, {
    deadlineAt: initialTime + 5_000,
    clock: () => currentTime,
    sleepImpl: async (milliseconds) => {
      waits.push(milliseconds);
      currentTime += milliseconds;
    },
    fetchImpl: async () => ++attempts === 1
      ? new Response("rate limited", { status: 429, headers: { "Retry-After": retryAfter } })
      : response({ results: [{ title: "Recovered date retry", url: "https://fund.example/date-retry" }] }),
  });

  assert.equal(outcome.ok, true);
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [1_000]);
  assert.equal(outcome.retryAttempts, 1);
});

test("does not retry permanent client errors or excessive Retry-After delays", async () => {
  let attempts = 0;
  const permanent = await fetchSearchPage("https://gateway.example", "token", { category: "local", query: "bad request", page: 1, variation: 1 }, {
    fetchImpl: async () => { attempts++; return response({}, 400); },
  });
  assert.equal(permanent.ok, false);
  assert.equal(attempts, 1);

  const tooLong = await fetchSearchPage("https://gateway.example", "token", { category: "local", query: "slow retry", page: 1, variation: 1 }, {
    fetchImpl: async () => { attempts++; return new Response("busy", { status: 503, headers: { "Retry-After": "30" } }); },
  });
  assert.equal(tooLong.ok, false);
  assert.equal(attempts, 2);
});

test("each upstream page is capped at fifteen results", async () => {
  const job = { category: "local", query: "synthetic", page: 1 };
  const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", job, { fetchImpl: async () => response({ results: Array.from({ length: 30 }, (_, i) => ({ title: String(i) })) }) });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.results.length, 15);
});

test("does not follow gateway redirects and reports the redirect status", async () => {
  let fetchOptions;
  const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1 }, {
    fetchImpl: async (_url, options) => {
      fetchOptions = options;
      return new Response("", { status: 302, headers: { Location: "https://challenge.example/" } });
    },
  });
  assert.equal(fetchOptions.redirect, "manual");
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 302);
  assert.equal(outcome.failureCode, "http_redirect");
});

test("rejects redirected gateway responses even when the destination is a private IP", async () => {
  let requestOptions;
  const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1 }, {
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return { ok: true, status: 200, redirected: true, url: "https://10.0.0.7/search", json: async () => ({ results: [] }) };
    },
  });
  assert.equal(requestOptions.redirect, "manual");
  assert.equal(outcome.ok, false);
});

test("rejects a final gateway response URL that points to a local host", async () => {
  const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1 }, {
    fetchImpl: async () => ({ ok: true, status: 200, redirected: false, url: "https://localhost/search", json: async () => ({ results: [] }) }),
  });
  assert.equal(outcome.ok, false);
});

test("rejects final gateway response URLs containing credentials or using non-HTTPS", async () => {
  for (const destination of ["https://user:pass@gateway.example/search", "http://gateway.example/search"]) {
    const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1 }, {
      fetchImpl: async () => ({ ok: true, status: 200, redirected: false, url: destination, json: async () => ({ results: [] }) }),
    });
    assert.equal(outcome.ok, false, destination);
  }
});
test("same-title awards on distinct sponsor paths remain separate leads", () => {
  const outcome = { ok: true, job: { category: "general", query: "synthetic", page: 1, variation: 1 }, results: [
    { title: "Community Leadership Scholarship", url: "https://foundation.example/awards/community" },
    { title: "Community Leadership Scholarship", url: "https://foundation.example/awards/regional-community" },
  ] };
  const { results } = normalizeAndRankResults([outcome], "2026-11-25T00:00:00.000Z", "Texas", 2027, { randomUUID: () => "fixed" });

  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.verification_state === "unverified_lead"));
});

test("final ranked results are capped at forty", () => {
  const outcome = { ok: true, job: { category: "general", query: "synthetic", page: 1 }, results: Array.from({ length: 45 }, (_, i) => ({ title: `Scholarship ${i}`, url: `https://fund-${i}.example/award`, content: "student award" })) };
  const { results, rawResultCount } = normalizeAndRankResults([outcome], "2026-11-13T12:00:00.000Z", "Texas", 2027, { randomUUID: () => "fixed" });
  assert.equal(rawResultCount, 45);
  assert.equal(results.length, 40);
});
test("bounded searches never exceed four active upstream requests", async () => {
  let active = 0, peak = 0;
  const jobs = Array.from({ length: 20 }, (_, i) => ({ category: "local", query: String(i), page: 1 }));
  const outcomes = await runBoundedSearches("https://gateway.example", "token", jobs, { fetchImpl: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--; return response({ results: [] });
  } });
  assert.equal(outcomes.length, 20);
  assert.ok(peak <= 4);
  assert.equal(peak, 4);
});
test("handler accepts four categories at most and ignores arbitrary profile fields", async () => {
  const sent = [];
  const handler = createScholarshipDiscoveryHandler(deps({ fetchImpl: async (url) => { sent.push(new URL(url).searchParams.get("q")); return response({ results: [] }); } }));
  const body = { profile: { state: "Texas", graduationYear: "2027", school: "PRIVATE-SCHOOL-SENTINEL", gpa: "PRIVATE-GPA-SENTINEL", email: "PRIVATE-EMAIL-SENTINEL" }, categories: [...categories, "invalid"] };
  const result = await handler(request(body));
  assert.equal(result.status, 200);
  assert.equal(sent.length, 24);
  assert.ok(sent.every((query) => !/PRIVATE-SCHOOL-SENTINEL|PRIVATE-GPA-SENTINEL|PRIVATE-EMAIL-SENTINEL/.test(query)));
});
test("gateway bearer secret is trimmed before constructing the Authorization header", async () => {
  const token = "x".repeat(64);
  let authorization = "";
  const handler = createScholarshipDiscoveryHandler(deps({
    getEnv: (key) => key === "SEARXNG_GATEWAY_URL" ? "https://gateway.example" : `  ${token}\r\n`,
    fetchImpl: async (_url, init) => {
      authorization = init.headers.Authorization;
      return response({ results: [] });
    },
  }));
  const result = await handler(request(baseBody));
  assert.equal(result.status, 200);
  assert.equal(authorization, `Bearer ${token}`);
});

test("handler validates method, content type, state, year, and category", async () => {  const makeHandler = () => createScholarshipDiscoveryHandler(deps());
  assert.equal((await makeHandler()(new Request("https://edge.test", { method: "GET" }))).status, 405);  assert.equal((await makeHandler()(new Request("https://edge.test", { method: "POST", headers: { "cf-connecting-ip": "192.0.2.9" }, body: "{}" }))).status, 415);
  assert.equal((await makeHandler()(request({ ...baseBody, profile: { state: "Texas123", graduationYear: "2027" } }))).status, 400);
  assert.equal((await makeHandler()(request({ ...baseBody, profile: { state: "Texas", graduationYear: "2040" } }))).status, 400);
  assert.equal((await makeHandler()(request({ ...baseBody, categories: ["invalid"] }))).status, 400);
});
test("handler enforces the 8192-byte body limit", async () => {
  const handler = createScholarshipDiscoveryHandler(deps());
  const body = " ".repeat(8193);
  const result = await handler(new Request("https://edge.test", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.9" }, body }));
  assert.equal(result.status, 413);
});
test("partial upstream failures return successful results with a warning", async () => {
  let calls = 0;
  const handler = createScholarshipDiscoveryHandler(deps({ fetchImpl: async () => ++calls === 1 ? response({ results: [{ title: "Texas Scholarship 2027", url: "https://fund.example/a", content: "award" }] }) : response({}, 503) }));
  const result = await handler(request(baseBody));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.summary.failedQueries, 5);
  assert.equal(body.results.length, 1);
  assert.equal(body.warnings.length, 1);
});
test("does not cache incomplete provider responses", async () => {
  let calls = 0;
  const handler = createScholarshipDiscoveryHandler(deps({
    fetchImpl: async () => {
      calls++;
      return (calls - 1) % 7 === 0
        ? response({ results: [{ title: "One incomplete synthetic lead", url: "https://fund.example/a", content: "scholarship" }] })
        : response({}, 503);
    },
  }));

  const first = await handler(request(baseBody));
  const second = await handler(request(baseBody));
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstBody.summary.cacheHit, false);
  assert.equal(secondBody.summary.cacheHit, false);
  assert.equal(calls, 21);
});

test("handler reports adaptive search savings and bounded retry attempts", async () => {
  let calls = 0;
  const handler = createScholarshipDiscoveryHandler(deps({
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return new Response("busy", { status: 429, headers: { "Retry-After": "0" } });
      return response({ results: Array.from({ length: 8 }, (_, index) => ({
        title: `Synthetic scholarship ${index}`,
        url: `https://fund-${index}.example/award`,
        content: "Scholarship for Texas high-school seniors, class of 2027.",
      })) });
    },
    sleepImpl: async () => {},
  }));
  const result = await handler(request(baseBody));
  const body = await result.json();

  assert.equal(result.status, 200);
  assert.equal(calls, 2);
  assert.equal(body.summary.requestedQueries, 1);
  assert.equal(body.summary.potentialQueries, 6);
  assert.equal(body.summary.queriesAvoided, 5);
  assert.equal(body.summary.retryAttempts, 1);
  assert.equal(body.summary.cacheHit, false);
});
test("total upstream failure returns 502 and no gateway secret in response", async () => {
  const token = "synthetic-secret-token-".padEnd(64, "x");
  const handler = createScholarshipDiscoveryHandler(deps({ getEnv: (key) => key === "SEARXNG_GATEWAY_URL" ? "https://gateway.example" : token, fetchImpl: async () => { throw new Error("offline"); } }));
  const result = await handler(request(baseBody));
  assert.equal(result.status, 502);
  assert.doesNotMatch(await result.text(), new RegExp(token));
});
test("rate limiter allows two requests, reports Retry-After, and resets after sixty seconds", () => {
  let time = 1000;
  const limiter = createPublicRateLimiter({ now: () => time });
  const req = () => new Request("https://edge.test", { headers: { "cf-connecting-ip": "198.51.100.2" } });
  assert.equal(limiter(req()).allowed, true);
  assert.equal(limiter(req()).allowed, true);
  assert.deepEqual(limiter(req()), { allowed: false, retryAfterSeconds: 60 });
  time += 60_000;
  assert.equal(limiter(req()).allowed, true);
});
test("rate-limit buckets are isolated by client address", () => {
  const limiter = createPublicRateLimiter({ now: () => 0 });
  const req = (ip) => new Request("https://edge.test", { headers: { "cf-connecting-ip": ip } });
  limiter(req("198.51.100.1")); limiter(req("198.51.100.1"));
  assert.equal(limiter(req("198.51.100.1")).allowed, false);
  assert.equal(limiter(req("198.51.100.2")).allowed, true);
});

test("network failures expose only safe error codes, never exception messages", async () => {
  const cause = Object.assign(new Error("private upstream URL and credentials"), { code: "ECONNRESET" });
  const failure = Object.assign(new TypeError("fetch failed"), { cause });
  const outcome = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1 }, {
    fetchImpl: async () => { throw failure; },
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failureCode, "network_econnreset");
  assert.equal(JSON.stringify(outcome).includes("private upstream URL"), false);
  const noCause = await fetchSearchPage("https://gateway.example", "synthetic-token", { category: "local", query: "synthetic", page: 1 }, {
    fetchImpl: async () => { throw new TypeError("error sending request for url (https://gateway.example/search?q=private-query)"); },
  });
  assert.equal(noCause.failureCode, "network_send_error");
  assert.equal(JSON.stringify(noCause).includes("private-query"), false);
});

test("total gateway authentication failure exposes safe status diagnostics without credentials", async () => {
  const token = "synthetic-secret-token-".padEnd(64, "x");
  const handler = createScholarshipDiscoveryHandler(deps({
    getEnv: (key) => key === "SEARXNG_GATEWAY_URL" ? "https://gateway.example" : token,
    fetchImpl: async () => response({ error: "unauthorized" }, 401),
  }));
  const result = await handler(request(baseBody));
  const body = await result.json();

  assert.equal(result.status, 502);
  assert.deepEqual(body.summary.failureReasons, [{ code: "http_401", count: 6 }]);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(token));
});

test("public rate limiter only trusts Cloudflare client identity and does not evict active buckets", () => {
  let now = 0;
  const limiter = createPublicRateLimiter({ now: () => now, maxBuckets: 1 });
  const first = request(baseBody);
  const second = request(baseBody, { "cf-connecting-ip": "192.0.2.2" });
  assert.equal(limiter(first).allowed, true);
  assert.equal(limiter(first).allowed, true);
  assert.equal(limiter(first).allowed, false);
  assert.equal(limiter(second).allowed, false);
  assert.equal(limiter(first).allowed, false);
  const spoofed = new Request("https://edge.test/discover", { method: "POST", headers: { "x-real-ip": "192.0.2.8" } });
  assert.equal(limiter(spoofed).unattributed, true);});

test("Upstash limiter uses one atomic shared admission script and hashes client addresses", async () => {
  let count = 0;
  const commands = [];
  const limiter = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: "synthetic-upstash-token-abcdefghijklmnopqrstuvwxyz0123456789",
    fetchImpl: async (_url, init) => {
      commands.push(JSON.parse(init.body));
      count += 1;
      return response({ result: count > 2 ? [0, 41, "client_minute"] : [1, 0, "allowed"] });
    },
  });
  assert.equal((await limiter(request(baseBody))).allowed, true);
  assert.equal((await limiter(request(baseBody))).allowed, true);
  const blocked = await limiter(request(baseBody));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 41);
  assert.equal(commands.length, 3);
  assert.equal(commands[0][0], "EVAL");
  assert.equal(commands[0][2], "6");
  assert.equal(commands[0][3].includes("192.0.2.1"), false);
  assert.match(commands[0][1], /redis\.call\('INCR'/);
  assert.match(commands[0][1], /redis\.call\('ZADD'/);
});

test("Upstash limiter fails closed for missing config, missing trusted address, and backend errors", async () => {
  assert.equal((await createUpstashRateLimiter({})(request(baseBody))).storageUnavailable, true);
  const noAddress = new Request("https://edge.test/discover", { method: "POST", headers: { "x-real-ip": "192.0.2.1" } });
  const configured = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: "synthetic-upstash-token-abcdefghijklmnopqrstuvwxyz0123456789",
    fetchImpl: async () => response({ result: [1, 0, "allowed"] }),
  });
  assert.equal((await configured(noAddress)).unattributed, true);
  const unavailable = createUpstashRateLimiter({
    url: "https://redis.example.upstash.io",
    token: "synthetic-upstash-token-abcdefghijklmnopqrstuvwxyz0123456789",
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal((await unavailable(request(baseBody))).storageUnavailable, true);
});

test("discovery validates real US states and a moving graduation-year window", async () => {
  const handler = createScholarshipDiscoveryHandler(deps());
  let requestIndex = 50;
  const submit = (profile) => handler(request(
    { ...baseBody, profile },
    { "cf-connecting-ip": `192.0.2.${requestIndex++}` },
  ));
  for (const state of [".", "---", "'", "Narnia"]) {
    const result = await submit({ ...baseBody.profile, state });
    assert.equal(result.status, 400, state);
  }
  assert.equal((await submit({ ...baseBody.profile, graduationYear: "2025" })).status, 400);
  assert.equal((await submit({ ...baseBody.profile, graduationYear: "2036" })).status, 400);
  for (const graduationYear of ["2027.5", "2027junk", " 2027 ", "202"]) {
    const result = await submit({ ...baseBody.profile, graduationYear });
    assert.equal(result.status, 400, graduationYear);
  }
  assert.equal((await submit({ ...baseBody.profile, state: "TX" })).status, 200);
});

test("progressive search stops launching new stages when the overall budget is exhausted", async () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "arts"]);
  let now = 0;
  let calls = 0;
  const outcomes = await runAdaptiveSearches("https://gateway.example", "token", jobs, {
    totalBudgetMs: 20,
    clock: () => now,
    fetchImpl: async () => {
      calls += 1;
      now += 21;
      return response({ results: [] });
    },
  });
  assert.equal(calls, 1);
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[1].failureCode, "search_budget_exhausted");
});