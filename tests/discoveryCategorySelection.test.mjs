import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALLOWED_CATEGORIES,
  buildSearchJobs,
  createScholarshipDiscoveryHandler,
} from "../supabase/functions/_shared/scholarship-discovery.mjs";

const response = (body) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
});
const dependencies = (fetchImpl) => ({
  getEnv: (key) => key === "SEARXNG_GATEWAY_URL"
    ? "https://gateway.example"
    : "x".repeat(64),
  now: () => new Date("2026-11-27T12:00:00.000Z"),
  fetchImpl,
});

test("all fourteen allowed categories produce search jobs without truncation", () => {
  const jobs = buildSearchJobs("Texas", 2027, ALLOWED_CATEGORIES);
  assert.equal(ALLOWED_CATEGORIES.length, 14);
  assert.equal(jobs.length, 14 * 3 * 2);
  assert.deepEqual(new Set(jobs.map((job) => job.category)), new Set(ALLOWED_CATEGORIES));
});

test("a full-category request searches every selected category within the shared request budget", async () => {
  const sentQueries = [];
  const handler = createScholarshipDiscoveryHandler(dependencies(async (url) => {
    sentQueries.push(new URL(url).searchParams.get("q"));
    return response({ results: [] });
  }));
  const request = new Request("https://edge.test/discover", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.2" },
    body: JSON.stringify({
      profile: {
        state: "Texas",
        graduationYear: "2027",
      },
      categories: ALLOWED_CATEGORIES,
    }),
  });

  const result = await handler(request);
  assert.equal(result.status, 200);
  assert.ok(sentQueries.length >= ALLOWED_CATEGORIES.length && sentQueries.length <= 24);
  const firstVariationPhrases = [
    "local and county scholarships",
    "high school counselor scholarship lists",
    "regional student scholarship programs",
    "statewide scholarship programs",
    "academic merit scholarships",
    "humanities, history",
    "student leadership",
    "volunteer service",
    "world language learning",
    "employer sponsored scholarships",
    "visual art, design",
    "incoming college student scholarships",
    "national scholarships open",
    "general student scholarships",
  ];
  for (const phrase of firstVariationPhrases) {
    assert.ok(sentQueries.some((query) => query.includes(phrase)), `missing category query: ${phrase}`);
  }
  assert.ok(sentQueries.every((query) =>
    !/PRIVATE-SCHOOL-SENTINEL|PRIVATE-GPA-SENTINEL|PRIVATE-EMAIL-SENTINEL/.test(query)
  ));
});

test("the live search selector exposes all available categories and no four-item limit", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const cloudSearch = app.slice(app.indexOf("{tab === 'Cloud Search'"), app.indexOf("{tab === 'Scholarships'"));
  assert.match(cloudSearch, /Choose any combination of the available search categories/);
  assert.match(cloudSearch, /\{selectedDiscoveryCategories\.length\}\/\{DISCOVERY_CATEGORY_OPTIONS\.length\} selected/);
  assert.doesNotMatch(cloudSearch, /selectedDiscoveryCategories\.length\s*>=\s*4|current\.length\s*<\s*4/);
});
