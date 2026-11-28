import test from "node:test";
import assert from "node:assert/strict";
import { buildScholarshipQueries, DISCOVERY_CATEGORY_OPTIONS } from "../src/lib/discovery.js";
import { rankAndDeduplicateLiveResults } from "../src/lib/discoveryPipeline.js";

test("frontend rejects impossible calendar dates instead of normalizing them", () => {
  const [result] = rankAndDeduplicateLiveResults([{
    title: "Niche Student Scholarship",
    source_url: "https://niche.example/scholarship",
    excerpt: "Niche Student Scholarship deadline is February 30, 2026.",
    evidence_excerpt: "Niche Student Scholarship deadline is February 30, 2026.",
    deadline_text: "Niche Student Scholarship deadline is February 30, 2026.",
    deadline: "2026-02-30",
  }]);
  assert.equal(result.deadline, null);
  assert.equal(result.deadline_text, null);
});

test("frontend rejects award and deadline clues from unrelated neighboring snippets", () => {
  const [result] = rankAndDeduplicateLiveResults([{
    title: "Niche Student Scholarship",
    source_url: "https://niche.example/scholarship",
    excerpt: "Niche Student Scholarship offers a $5,000 award. The Texas History Essay Contest deadline is December 1, 2026.",
    evidence_excerpt: "Niche Student Scholarship. Niche Student Scholarship offers a $5,000 award. The Texas History Essay Contest deadline is December 1, 2026.",
    award_text: "$5,000 award",
    deadline_text: "The Texas History Essay Contest deadline is December 1, 2026.",
    deadline: "2026-12-01",
  }]);

  assert.match(result.award_text, /\$5,000/);
  assert.equal(result.deadline, null);
  assert.equal(result.deadline_text, null);
});

test("offers distinct discovery categories for leadership, language, employment, and broad awards", () => {
  const ids = new Set(DISCOVERY_CATEGORY_OPTIONS.map((item) => item.id));
  for (const id of ["local", "academic", "humanities", "leadership", "community_service", "language", "employment", "national", "general"]) {
    assert.ok(ids.has(id), `missing category: ${id}`);
  }
});

test("builds multiple independent query variations without leaking private profile fields", () => {
  const queries = buildScholarshipQueries({
    state: "Texas",
    county: "Example County",
    graduationYear: "2027",
    plannedMajor: "Environmental science",
    interests: "history",
    email: "private@example.com",
    phone: "2545550100",
    familyIncome: "$90,000",
  }, ["humanities", "employment", "language"]);

  assert.equal(queries.length, 3);
  for (const plan of queries) {
    assert.ok(plan.queryVariants.length >= 2);
    assert.ok(plan.queryVariants.every((query) => query.length > 20));
    assert.ok(plan.queryVariants.every((query) => !query.includes("private@example.com")));
    assert.ok(plan.queryVariants.every((query) => !query.includes("2545550100")));
    assert.ok(plan.queryVariants.every((query) => !query.includes("$90,000")));
  }
});

test("does not inherit authority labels or verification fields from search-result metadata", () => {
  const [result] = rankAndDeduplicateLiveResults([{
    id: "synthetic-untrusted-metadata",
    title: "Synthetic Scholarship A",
    source_url: "https://example.org/award-a",
    source_authority: "official-sponsor",
    sourceAuthority: "official-sponsor",
    source_label: "Official sponsor website",
    sourceLabel: "Official sponsor website",
    authorityLabel: "Verified official source",
    verification_state: "verified",
    sourceVerified: true,
    provider: "Unrelated Foundation",
    award_text: "$50,000",
    deadline: "2027-05-01",
    discovery_category: "local",
  }]);

  assert.equal(result.source_authority, "unverified-lead");
  assert.equal(result.verification_state, "unverified_lead");
  assert.equal(result.provider, null);
  assert.equal(result.award_text, null);
  assert.equal(result.deadline, null);
  for (const field of ["sourceAuthority", "source_label", "sourceLabel", "authorityLabel", "sourceVerified"]) {
    assert.equal(Object.hasOwn(result, field), false, `unexpected inherited field: ${field}`);
  }
});

test("keeps source labels and category provenance isolated between neighboring results", () => {
  const results = rankAndDeduplicateLiveResults([
    {
      id: "first",
      title: "First Synthetic Award",
      source_url: "https://example.org/first",
      discovery_category: "local",
      source_label: "Official sponsor website",
      source_authority: "official-sponsor",
    },
    {
      id: "second",
      title: "Second Synthetic Award",
      source_url: "https://example.org/second",
      discovery_category: "academic",
      source_label: "Official government website",
      source_authority: "official-government",
    },
  ]);

  const first = results.find((item) => item.id === "first");
  const second = results.find((item) => item.id === "second");
  assert.equal(first.discovery_category, "local");
  assert.deepEqual(first.discovery_categories, ["local"]);
  assert.equal(second.discovery_category, "academic");
  assert.deepEqual(second.discovery_categories, ["academic"]);
  assert.equal(first.source_authority, "unverified-lead");
  assert.equal(second.source_authority, "unverified-lead");
  assert.equal(Object.hasOwn(first, "source_label"), false);
  assert.equal(Object.hasOwn(second, "source_label"), false);
});

test("deduplicated records merge only recognized categories and never inherit authority metadata", () => {
  const [result] = rankAndDeduplicateLiveResults([
    {
      id: "first",
      title: "Shared Synthetic Award",
      source_url: "https://example.org/shared?utm_source=one",      excerpt: "Short source excerpt.",
      discovery_category: "local",
      source_authority: "official-sponsor",
    },
    {
      id: "second",
      title: "Shared Synthetic Award",
      source_url: "https://example.org/shared",
      excerpt: "Longer source excerpt with useful synthetic scholarship context.",
      discovery_categories: ["academic", "unapproved-label"],
      authorityLabel: "Official sponsor",
      source_authority: "official-sponsor",
      verification_state: "verified",
    },
  ]);

  assert.deepEqual(result.discovery_categories.sort(), ["academic", "local"]);
  assert.equal(result.discovery_category, "academic");
  assert.equal(result.source_authority, "unverified-lead");
  assert.equal(result.verification_state, "unverified_lead");
  assert.equal(Object.hasOwn(result, "authorityLabel"), false);
});

test("deduplicates canonical URLs, merges search provenance, and keeps leads unverified", () => {
  const results = rankAndDeduplicateLiveResults([
    {
      id: "one",
      title: "Texas Senior Scholarship",
      source_url: "https://example.org/scholarships?utm_source=search#apply",
      source_domain: "example.org",
      excerpt: "A scholarship for graduating Texas seniors.",
      discovery_category: "local",
      discovery_query: "Texas scholarship seniors",
      discovery_page: 1,
    },
    {
      id: "two",
      title: "Texas Senior Scholarship",
      source_url: "https://example.org/scholarships",
      source_domain: "www.example.org",
      excerpt: "Longer sponsor-page summary with more context about the 2027 graduating class.",
      discovery_category: "academic",
      discovery_query: "2027 Texas senior scholarship awards",
      discovery_page: 2,
      verification_state: "verified",
      source_authority: "official-sponsor",
    },
  ], { state: "Texas", graduationYear: "2027" });

  assert.equal(results.length, 1);
  assert.equal(results[0].source_url, "https://example.org/scholarships");
  assert.match(results[0].excerpt, /Longer sponsor-page summary/);
  assert.deepEqual(results[0].discovery_categories.sort(), ["academic", "local"]);
  assert.deepEqual(results[0].discovery_pages.sort(), [1, 2]);
  assert.equal(results[0].verification_state, "unverified_lead");
  assert.equal(results[0].source_authority, "unverified-lead");
  assert.equal(results[0].provider, null);
  assert.equal(results[0].award_text, null);
  assert.equal(results[0].deadline, null);
  assert.ok(results[0].relevance_score > 0);
  assert.ok(results[0].relevance_reasons.length > 0);
});

test("ranks state and graduation-year matches above weakly related results", () => {
  const results = rankAndDeduplicateLiveResults([
    {
      id: "weak",
      title: "General student opportunities",
      source_url: "https://example.net/opportunities",
      excerpt: "Information about student events.",
      discovery_category: "general",
    },
    {
      id: "strong",
      title: "Texas Class of 2027 High School Senior Scholarship",
      source_url: "https://example.edu/scholarships/2027",
      excerpt: "Award for graduating Texas high school seniors.",
      discovery_category: "academic",
    },
  ], { state: "Texas", graduationYear: "2027" });

  assert.equal(results[0].id, "strong");
  assert.ok(results[0].relevance_score > results[1].relevance_score);
});

test("removes private query parameters and fragments before exposing discovered source URLs", () => {
  const results = rankAndDeduplicateLiveResults([{
    id: "private-url",
    title: "Synthetic Scholarship",
    source_url: "https://example.org/award?page=2&email=student%40example.test&studentId=synthetic-123&token=secret-value&utm_source=fixture#access_token=fragment-secret",
  }]);

  assert.equal(results.length, 1);
  assert.equal(results[0].source_url, "https://example.org/award?page=2");
  assert.doesNotMatch(results[0].source_url, /student|email|token|secret|utm_|#/i);
});

test("drops unsafe URLs and empty titles before displaying search results", () => {
  const results = rankAndDeduplicateLiveResults([
    { id: "bad", title: "unsafe", source_url: "http://127.0.0.1/private" },    { id: "blank", title: " ", source_url: "https://example.org/blank" },
    { id: "good", title: "Valid lead", source_url: "https://example.org/valid" },
  ]);

  assert.deepEqual(results.map((item) => item.id), ["good"]);
});

test("ranks matching keywords and study interests above unrelated leads", () => {
  const results = rankAndDeduplicateLiveResults([
    { id: "other", title: "General Student Award", source_url: "https://example.org/other", excerpt: "Broad student funding." },
    { id: "match", title: "Environmental Science Scholarship", source_url: "https://example.org/match", excerpt: "Award for environmental science and ecology students." },
  ], { plannedMajor: "Environmental science", interests: "ecology" });

  assert.equal(results[0].id, "match");
  assert.ok(results[0].relevance_reasons.some((reason) => reason.toLowerCase().includes("environmental science")));
});

test("ranks county and state mentions as location signals", () => {
  const results = rankAndDeduplicateLiveResults([
    { id: "elsewhere", title: "Regional Student Award", source_url: "https://example.org/elsewhere", excerpt: "Open to students nationwide." },
    { id: "local", title: "Sample County Scholarship", source_url: "https://example.org/local", excerpt: "For Oregon students in Sample County." },
  ], { state: "Oregon", county: "Sample County" });

  assert.equal(results[0].id, "local");
  assert.ok(results[0].relevance_reasons.includes("Mentions your county"));
  assert.ok(results[0].relevance_reasons.includes("Matches your state"));
});

test("ranks study-level matches without treating absent level information as a mismatch", () => {
  const results = rankAndDeduplicateLiveResults([
    { id: "college", title: "Undergraduate Student Scholarship", source_url: "https://example.org/college", excerpt: "For enrolled college students." },
    { id: "school", title: "High School Senior Scholarship", source_url: "https://example.org/school", excerpt: "For graduating high school seniors." },
  ], { grade: "High school senior" });

  assert.equal(results[0].id, "school");
  assert.ok(results[0].relevance_reasons.includes("Matches your high-school study level"));
});

test("does not collapse distinct awards that share a title and sponsor domain", () => {
  const results = rankAndDeduplicateLiveResults([
    { id: "program-a", title: "Community Leadership Scholarship", source_url: "https://example.org/awards/community-leadership" },
    { id: "program-b", title: "Community Leadership Scholarship", source_url: "https://example.org/awards/community-leadership-regional" },
  ]);

  assert.equal(results.length, 2);
  assert.deepEqual(new Set(results.map((item) => item.source_url)), new Set([
    "https://example.org/awards/community-leadership",
    "https://example.org/awards/community-leadership-regional",
  ]));
  assert.ok(results.every((item) => item.verification_state === "unverified_lead"));
});

test("missing profile and result fields produce stable zero-signal ranking", () => {
  const input = [
    { id: "zeta", title: "Zeta Opportunity", source_url: "https://example.org/zeta" },
    { id: "alpha", title: "Alpha Opportunity", source_url: "https://example.org/alpha" },
  ];
  const first = rankAndDeduplicateLiveResults(input);
  const second = rankAndDeduplicateLiveResults(input, { state: "", county: "", grade: "", plannedMajor: "" });

  assert.deepEqual(first.map((item) => [item.id, item.relevance_score, item.relevance_reasons]), [
    ["alpha", 0, []],
    ["zeta", 0, []],
  ]);
  assert.deepEqual(second.map((item) => [item.id, item.relevance_score, item.relevance_reasons]), [
    ["alpha", 0, []],
    ["zeta", 0, []],
  ]);
});


test("state relevance uses token boundaries and full-name/abbreviation aliases", () => {
  const falsePositive = rankAndDeduplicateLiveResults([{
    id: "indiana-false-positive",
    title: "Scholarships within major information fields",
    source_url: "https://example.org/within",
    excerpt: "For a sponsor, the application is open to students.",
    discovery_category: "local",
  }], { state: "IN" })[0];
  assert.equal(falsePositive.relevance_reasons.includes("Matches your state"), false);

  const nameMatch = rankAndDeduplicateLiveResults([{
    id: "texas-name",
    title: "Texas resident opportunity",
    source_url: "https://example.org/texas",
  }], { state: "TX" })[0];
  assert.equal(nameMatch.relevance_reasons.includes("Matches your state"), true);
});

test("canonical URL sorting collapses equivalent query parameter order", () => {
  const first = rankAndDeduplicateLiveResults([{
    id: "one", title: "Same award", source_url: "https://example.org/award?b=2&a=1",
  }]);
  const second = rankAndDeduplicateLiveResults([{
    id: "two", title: "Same award", source_url: "https://example.org/award?a=1&b=2",
  }]);
  assert.equal(first[0].source_url, second[0].source_url);
});


test("profile fit does not confuse a deadline year with graduation year or match partial words", () => {
  const profile = { county: "Travis", graduationYear: "2027", interests: "art" };
  const results = rankAndDeduplicateLiveResults([
    {
      id: "deadline-year",
      title: "Texas Scholarship",
      source_url: "https://example.org/deadline",
      excerpt: "Applications close on May 1, 2027. Open to students from Travisville.",
    },
    {
      id: "profile-match",
      title: "Travis County Class of 2027 Art Scholarship",
      source_url: "https://example.org/profile-match",
      excerpt: "For Travis County students in the class of 2027 who study art.",
    },
  ], profile);

  const weak = results.find((item) => item.id === "deadline-year");
  const strong = results.find((item) => item.id === "profile-match");
  assert.ok(strong.relevance_score > weak.relevance_score);
  assert.ok(!weak.relevance_reasons.includes("Mentions your county"));
  assert.ok(!weak.relevance_reasons.some((reason) => /your interests/.test(reason)));
  assert.ok(!weak.relevance_reasons.some((reason) => /class of 2027/.test(reason)));
});
