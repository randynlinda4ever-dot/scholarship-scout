
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchJobs,
  calculateReciprocalRankFusion,
  extractScholarshipSearchSignals,
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

test("extracts exact award and dated deadline clues without inventing missing details", () => {
  const signals = extractScholarshipSearchSignals(
    "The Texas Future Leaders Scholarship awards $2,500 per year to graduating seniors. Applications must be submitted by March 15, 2027. Awards are competitive."
  );
  assert.equal(signals.awardText, "The Texas Future Leaders Scholarship awards $2,500 per year to graduating seniors.");
  assert.equal(signals.deadline, "2027-03-15");
  assert.equal(signals.deadlineText, "Applications must be submitted by March 15, 2027.");
  assert.equal(signals.deadlineNotPublished, false);

  const vague = extractScholarshipSearchSignals("Scholarship applications are open now. Contact the sponsor for details.");
  assert.equal(vague.awardText, null);
  assert.equal(vague.deadline, null);
  assert.equal(vague.deadlineText, null);
  assert.equal(vague.deadlineNotPublished, false);
});

test("does not mistake application fees, income limits, or ambiguous dates for award and deadline data", () => {
  const signals = extractScholarshipSearchSignals(
    "A $35 application fee is required. Applicants must have family income below $40,000. Apply by 04/05/2027."
  );
  assert.equal(signals.awardText, null);
  assert.equal(signals.deadline, null);
  assert.equal(signals.deadlineText, null);
});

test("search ranking rewards explicit award and deadline details while preserving unverified status", () => {
  const { results } = normalizeAndRankResults([{
    ok: true,
    job: { category: "local", query: "Texas local scholarship", variation: 1, page: 1 },
    results: [{
      title: "Texas Community Scholarship",
      url: "https://foundation.example/scholarship",
      content: "The Texas Community Scholarship awards $1,000 to seniors. Apply by April 30, 2027.",
    }],
  }], "2026-11-27T12:00:00.000Z", "Texas", 2027, { randomUUID: () => "award-deadline" });

  assert.equal(results[0].award_text, "The Texas Community Scholarship awards $1,000 to seniors.");
  assert.equal(results[0].deadline, "2027-04-30");
  assert.equal(results[0].deadline_text, "Apply by April 30, 2027.");
  assert.equal(results[0].award_evidence_url, "https://foundation.example/scholarship");
  assert.equal(results[0].award_evidence_text, results[0].award_text);
  assert.equal(results[0].verification_state, "unverified_lead");
});


test("client normalization preserves snippet clues but never trusts incoming verification claims", () => {
  const excerpt = "The Future Scholars Award grants $3,000 to seniors. Apply by May 1, 2027.";
  const [result] = rankAndDeduplicateLiveResults([{
    id: "snippet-lead",
    title: "Future Scholars Award",
    source_url: "https://foundation.example/future",
    excerpt,
    award_text: "The Future Scholars Award grants $3,000 to seniors.",
    deadline: "2027-05-01",
    deadline_text: "Apply by May 1, 2027.",
    source_authority: "government",
    verification_state: "human_verified",
  }]);

  assert.equal(result.award_text, "The Future Scholars Award grants $3,000 to seniors.");
  assert.equal(result.award_evidence_text, result.award_text);
  assert.equal(result.award_evidence_url, result.source_url);
  assert.equal(result.deadline, "2027-05-01");
  assert.equal(result.deadline_text, "Apply by May 1, 2027.");
  assert.equal(result.source_authority, "unverified-lead");
  assert.equal(result.verification_state, "unverified_lead");
});

test("client normalization drops award or deadline clues not supported by the displayed snippet", () => {
  const [result] = rankAndDeduplicateLiveResults([{
    title: "Unsupported lead",
    source_url: "https://foundation.example/unsupported",
    excerpt: "A scholarship for graduating seniors.",
    award_text: "$9,999 guaranteed",
    deadline: "2027-05-01",
    deadline_text: "Apply by May 1, 2027.",
  }]);

  assert.equal(result.award_text, null);
  assert.equal(result.deadline, null);
  assert.equal(result.deadline_text, null);
});


test("relevance score is bounded to 0-100 and separates search agreement from fit signals", () => {
  const { results } = normalizeAndRankResults([{
    ok: true,
    job: { category: "local", query: "Texas local scholarship", variation: 1, page: 1 },
    results: [{
      title: "Texas Class of 2027 Community Scholarship for Graduating Seniors",
      url: "https://foundation.example/scholarship",
      content: "Eligible graduating high-school students can apply for this scholarship.",
    }],
  }], "2026-11-27T12:00:00.000Z", "Texas", 2027, { randomUUID: () => "bounded-score" });

  assert.ok(results[0].relevance_score >= 0);
  assert.ok(results[0].relevance_score <= 100);
  assert.ok(Number.isInteger(results[0].relevance_score));
  assert.ok(results[0].relevance_score <= 100, "profile fit is normalized to a 0-100 scale");
});


test("personalized profile match is a bounded 0-100 score and rewards real profile alignment", () => {
  const profile = {
    state: "Texas",
    graduationYear: "2027",
    grade: "High School Senior",
    interests: "anthropology, community service",
  };
  const [strong] = rankAndDeduplicateLiveResults([{
    title: "Texas Class of 2027 Anthropology Scholarship",
    source_url: "https://foundation.example/texas-award",
    excerpt: "Texas graduating high-school seniors interested in anthropology may apply. The award is $2,000. Apply by May 1, 2027.",
    award_text: "The award is $2,000.",
    deadline: "2027-05-01",
    deadline_text: "Apply by May 1, 2027.",
    search_consensus_count: 3,
    search_consensus_score: 1,
  }], profile);
  const [weak] = rankAndDeduplicateLiveResults([{
    title: "National Engineering Scholarship",
    source_url: "https://foundation.example/engineering",
    excerpt: "College engineering students may apply for this scholarship. Award $2,000. Apply by May 1, 2027.",
    award_text: "Award $2,000.",
    deadline: "2027-05-01",
    deadline_text: "Apply by May 1, 2027.",
    search_consensus_count: 3,
    search_consensus_score: 1,
  }], profile);

  assert.ok(strong.relevance_score >= 70);
  assert.ok(strong.relevance_score <= 100);
  assert.ok(weak.relevance_score >= 0);
  assert.ok(weak.relevance_score <= 100);
  assert.ok(strong.relevance_score > weak.relevance_score);
  assert.ok(strong.relevance_reasons.some((reason) => /Matches your state/.test(reason)));
  assert.ok(strong.relevance_reasons.some((reason) => /Matches your interests/.test(reason)));
});


test("deduplication retains award and deadline evidence found in a second snippet for the same source", () => {
  const [result] = rankAndDeduplicateLiveResults([
    {
      title: "Regional Future Scholarship",
      source_url: "https://foundation.example/future",
      excerpt: "The Regional Future Scholarship supports graduating seniors with community involvement.",
      discovery_queries: ["regional scholarship"],
    },
    {
      title: "Regional Future Scholarship",
      source_url: "https://foundation.example/future",
      excerpt: "The Regional Future Scholarship awards $1,500. Apply by June 10, 2027.",
      award_text: "The Regional Future Scholarship awards $1,500.",
      deadline: "2027-06-10",
      deadline_text: "Apply by June 10, 2027.",
      evidence_excerpt: "Regional Future Scholarship. The Regional Future Scholarship awards $1,500. Apply by June 10, 2027.",
      discovery_queries: ["award amount deadline"],
    },
  ]);

  assert.equal(result.award_text, "The Regional Future Scholarship awards $1,500.");
  assert.equal(result.deadline, "2027-06-10");
  assert.ok(result.evidence_excerpt.includes(result.award_text));
  assert.ok(result.evidence_excerpt.includes(result.deadline_text));
  assert.ok(result.excerpt.includes("supports graduating seniors"));
});

test("scholarship directory landing pages are excluded as individual opportunities", () => {
  const { results } = normalizeAndRankResults([{
    ok: true,
    job: { category: "humanities", query: "senior scholarships", variation: 1, page: 1 },
    results: [{
      title: "High School Senior (Class of 2027) Scholarships",
      url: "https://www.scholarships.com/financial-aid/college-scholarships/scholarship-directory/school-year/high-school-senior",
      content: "Browse scholarships for high school seniors.",
    }],
  }], "2026-11-28T12:00:00.000Z", "Texas", 2027);
  assert.equal(results.length, 0);
});

test("duplicate search snippets are not concatenated into false award and deadline evidence", () => {
  const url = "https://directory.example/scholarship-directory/seniors";
  const outcomes = [
    {
      ok: true,
      job: { category: "humanities", query: "senior scholarships", variation: 1, page: 1 },
      results: [{ title: "High School Senior Scholarships", url, content: "Niche $50,000 No Essay Scholarship." }],
    },
    {
      ok: true,
      job: { category: "humanities", query: "history scholarships", variation: 2, page: 1 },
      results: [{ title: "High School Senior Scholarships", url, content: "Texas History Essay Contest, Amount: $4,000, Due Date: January 31, 2027." }],
    },
  ];
  const { results } = normalizeAndRankResults(outcomes, "2026-11-28T12:00:00.000Z", "Texas", 2027);
  assert.equal(results.length, 0, "directory result must be filtered before clue extraction");
});

test("duplicate result snippets stay source-local and cannot combine unrelated award and deadline clues", () => {
  const url = "https://foundation.example/awards/senior-program";
  const outcomes = [
    {
      ok: true,
      job: { category: "humanities", query: "senior scholarships", variation: 1, page: 1 },
      results: [{ title: "Texas Community Scholarship", url, content: "Niche $50,000 No Essay Scholarship." }],
    },
    {
      ok: true,
      job: { category: "humanities", query: "history scholarships", variation: 2, page: 1 },
      results: [{ title: "Texas Community Scholarship", url, content: "Texas History Essay Contest, Amount: $4,000, Due Date: January 31, 2027." }],
    },
  ];
  const { results } = normalizeAndRankResults(outcomes, "2026-11-28T12:00:00.000Z", "Texas", 2027);
  assert.equal(results.length, 1);
  assert.equal(results[0].award_text, null, "the unrelated Niche award must not be attached to this scholarship");
  assert.equal(results[0].deadline, null, "the unrelated essay-contest deadline must not be attached to this scholarship");
  assert.doesNotMatch(results[0].evidence_excerpt, /Niche|Texas History Essay Contest/);
});
