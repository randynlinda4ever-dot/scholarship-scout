import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchJobs,
  calculateReciprocalRankFusion,
  normalizeAndRankResults,
  runAdaptiveSearches,
  scoreCandidateQuality,
} from "../supabase/functions/_shared/scholarship-discovery.mjs";
import { rankAndDeduplicateLiveResults } from "../src/lib/discoveryPipeline.js";

const response = (results) => new Response(JSON.stringify({ results }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

test("query planner emits three genuinely distinct retrieval intents per category within a 24-request ceiling", () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "humanities", "community_service", "state"]);
  assert.equal(jobs.length, 24);
  assert.deepEqual(new Set(jobs.map((job) => job.variation)), new Set([1, 2, 3]));
  for (const category of ["local", "humanities", "community_service", "state"]) {
    const variants = [...new Set(jobs.filter((job) => job.category === category).map((job) => job.query))];
    assert.equal(variants.length, 3, category);
  }
  assert.ok(jobs.every((job) => job.query.includes("Texas") && job.query.includes("2027")));
});

test("candidate quality distinguishes scholarship opportunities from generic educational pages", () => {
  const strong = scoreCandidateQuality({
    title: "Texas Class of 2027 Community Scholarship",
    excerpt: "Eligible graduating high-school students can apply before the deadline.",
    domain: "foundation.example",
    state: "Texas",
    year: 2027,
  });
  const weak = scoreCandidateQuality({
    title: "College news and student events",
    excerpt: "Read our latest campus updates and financial aid announcements.",
    domain: "university.example",
    state: "Texas",
    year: 2027,
  });
  assert.equal(strong.isUseful, true);
  assert.equal(weak.isUseful, false);
  assert.ok(strong.score > weak.score);
});

test("adaptive search continues after eight unique but low-quality pages", async () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local"]);
  const calls = [];
  const outcomes = await runAdaptiveSearches("https://gateway.example", "token", jobs, {
    minimumQualityResults: 5,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const query = parsed.searchParams.get("q");
      const page = Number(parsed.searchParams.get("pageno"));
      calls.push({ query, page });
      const results = page === 1 && calls.length === 1
        ? Array.from({ length: 8 }, (_, index) => ({
            title: `Campus update ${index}`,
            url: `https://university.example/news/${index}`,
            content: "General campus and financial aid news.",
          }))
        : [];
      return response(results);
    },
  });
  assert.ok(calls.length > 1, "low-quality URL volume must not stop query expansion");
  assert.ok(outcomes.length > 1);
});

test("adaptive search stops after enough distinct high-quality leads", async () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "state"]);
  const calls = [];
  const outcomes = await runAdaptiveSearches("https://gateway.example", "token", jobs, {
    minimumQualityResults: 5,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      calls.push({ query: parsed.searchParams.get("q"), page: Number(parsed.searchParams.get("pageno")) });
      return response(Array.from({ length: 5 }, (_, index) => ({
        title: `Texas Student Scholarship ${calls.length}-${index}`,
        url: `https://foundation.example/${calls.length}/${index}`,
        content: "Eligible Texas graduating high-school students may apply for this scholarship award.",
      })));
    },
  });
  assert.equal(outcomes.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.page === 1));
});

test("RRF rewards agreement across query variants while preserving rank order", () => {
  const fused = calculateReciprocalRankFusion([
    [
      { title: "Community Service Scholarship", url: "https://fund.example/community", rank: 1 },
      { title: "General Student Award", url: "https://fund.example/general", rank: 2 },
    ],
    [
      { title: "Community Service Scholarship", url: "https://fund.example/community", rank: 3 },
      { title: "Other Scholarship", url: "https://fund.example/other", rank: 1 },
    ],
  ]);
  const consensus = fused.find((item) => item.url === "https://fund.example/community");
  const singleList = fused.find((item) => item.url === "https://fund.example/other");
  assert.equal(consensus.appearances, 2);
  assert.equal(singleList.appearances, 1);
  assert.ok(consensus.score > singleList.score);
  assert.ok(consensus.consensusScore > singleList.consensusScore);
});

test("server result normalization carries RRF consensus without upgrading verification", () => {
  const outcomes = [
    {
      ok: true,
      job: { category: "community_service", query: "volunteer scholarships", variation: 1, page: 1 },
      results: [{ title: "Community Service Scholarship", url: "https://fund.example/community", content: "For student volunteers." }],
    },
    {
      ok: true,
      job: { category: "community_service", query: "civic engagement awards", variation: 2, page: 1 },
      results: [{ title: "Community Service Scholarship", url: "https://fund.example/community", content: "Eligible student volunteers may apply." }],
    },
  ];
  const { results } = normalizeAndRankResults(outcomes, "2026-11-27T12:00:00.000Z", "Texas", 2027, {
    randomUUID: () => "fixed-id",
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].search_consensus_count, 2);
  assert.ok(results[0].search_consensus_score > 0);
  assert.equal(results[0].verification_state, "unverified_lead");
  assert.equal(results[0].source_authority, "unverified-lead");
});

test("local profile matching expands service concepts without transmitting profile details", () => {
  const results = rankAndDeduplicateLiveResults([
    {
      id: "service-award",
      title: "Civic Engagement Scholarship",
      source_url: "https://foundation.example/civic-award",
      excerpt: "Recognizes student volunteering and public service.",
    },
    {
      id: "unrelated",
      title: "General STEM Scholarship",
      source_url: "https://foundation.example/stem",
      excerpt: "For students interested in engineering.",
    },
  ], { interests: "community service" });

  assert.equal(results[0].id, "service-award");
  assert.ok(results[0].relevance_reasons.some((reason) => /related concepts|community service/i.test(reason)));
  assert.equal(results[0].search_consensus_score ?? 0, 0);
});

test("adaptive search counts retries against the shared gateway request budget", async () => {
  const jobs = buildSearchJobs("Texas", 2027, ["local", "state", "humanities", "community_service"]);
  let calls = 0;
  const outcomes = await runAdaptiveSearches("https://gateway.example", "token", jobs, {
    minimumQualityResults: 15,
    maxSearchRequests: 24,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls <= 4 || calls % 2 === 1
        ? new Response("busy", { status: 429, headers: { "Retry-After": "0" } })
        : response([]);
    },
  });
  const retries = outcomes.reduce((total, outcome) => total + (outcome.retryAttempts || 0), 0);
  assert.ok(calls <= 24, `gateway calls ${calls} exceeded the 24-call budget`);
  assert.equal(outcomes.length + retries, calls);
  assert.ok(calls >= 20);
  assert.ok(outcomes.length <= 24);
});
