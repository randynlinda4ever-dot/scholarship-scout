import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateGoldenQuery, aggregateSearchEvaluations } from "../supabase/functions/_shared/search-evaluation.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/search/golden-queries.json", import.meta.url), "utf8"));

test("golden query fixture contains public, source-linked, non-personal search cases", () => {
  assert.equal(fixture.version, 1);
  assert.equal(fixture.asOf, "2026-11-25");
  assert.ok(fixture.queries.length >= 5);
  for (const query of fixture.queries) {
    assert.ok(query.query.length > 20);
    assert.ok(query.expectedSources.length > 0);
    assert.ok(query.expectedSources.every((source) => source.url.startsWith("https://")));
    assert.ok(query.expectedSources.every((source) => Array.isArray(source.supportedClaims) && source.supportedClaims.length > 0));
  }
  assert.match(fixture.curationNote, /not a publication\/update date/i);
});

test("evaluation computes supporting-source recall, citation accuracy, freshness, and duplicates", () => {
  const query = {
    id: "synthetic-eval",
    asOf: "2026-11-25",
    maxAgeDays: 90,
    expectedSources: [
      { url: "https://official.example/program", supportedClaims: ["eligibility"], maxAgeDays: 90 },
      { url: "https://official.example/deadline", supportedClaims: ["deadline"], maxAgeDays: 30 },
    ],
  };
  const response = {
    status: "success",
    results: [
      { title: "Program", url: "https://official.example/program", provenance: [{ publishedAt: "2026-10-01" }] },
      { title: "Program", url: "https://official.example/program?utm_source=duplicate", provenance: [{ publishedAt: "2026-10-01" }] },
      { title: "Deadline", url: "https://official.example/deadline", provenance: [{ updatedAt: "2026-11-20" }] },
    ],
  };
  const result = evaluateGoldenQuery(query, response, {
    citations: [
      { url: "https://official.example/program", claimId: "eligibility" },
      { url: "https://official.example/deadline", claimId: "eligibility" },
      { url: "https://other.example/claim", claimId: "deadline" },
    ],
  });
  assert.deepEqual(result.supportingSourceRecall, { value: 1, numerator: 2, denominator: 2 });
  assert.deepEqual(result.citationAccuracy, { value: 1 / 3, numerator: 1, denominator: 3 });
  assert.deepEqual(result.freshnessCompliance, { value: 1, numerator: 3, denominator: 3 });
  assert.equal(result.freshnessUnknown, 0);
  assert.deepEqual(result.duplicateRate, { value: 1 / 3, numerator: 1, denominator: 3 });
});

test("unknown publication dates do not count as fresh and unavailable citations are N/A", () => {
  const query = {
    id: "unknown-date",
    asOf: "2026-11-25",
    maxAgeDays: 30,
    expectedSources: [{ url: "https://official.example/page", supportedClaims: ["claim"], maxAgeDays: 30 }],
  };
  const result = evaluateGoldenQuery(query, {
    status: "success",
    results: [{ title: "Undated source", url: "https://official.example/page", provenance: [{ retrievedAt: "2026-11-25T12:00:00.000Z" }] }],
  });
  assert.deepEqual(result.freshnessCompliance, { value: 0, numerator: 0, denominator: 1 });
  assert.equal(result.freshnessUnknown, 1);
  assert.deepEqual(result.citationAccuracy, { value: null, numerator: 0, denominator: 0 });
});

test("future publication dates and stale pages fail freshness compliance", () => {
  const query = {
    id: "stale-future",
    asOf: "2026-11-25",
    maxAgeDays: 30,
    expectedSources: [
      { url: "https://official.example/stale", supportedClaims: ["claim"], maxAgeDays: 30 },
      { url: "https://official.example/future", supportedClaims: ["claim"], maxAgeDays: 30 },
    ],
  };
  const result = evaluateGoldenQuery(query, {
    status: "success",
    results: [
      { title: "Stale", url: "https://official.example/stale", provenance: [{ publishedAt: "2026-01-01" }] },
      { title: "Future", url: "https://official.example/future", provenance: [{ publishedAt: "2027-01-01" }] },
    ],
  });
  assert.deepEqual(result.freshnessCompliance, { value: 0, numerator: 0, denominator: 2 });
});

test("aggregate evaluation weights by evaluated items rather than averaging query percentages", () => {
  const aggregate = aggregateSearchEvaluations([
    { supportingSourceRecall: { numerator: 1, denominator: 2 }, citationAccuracy: { numerator: 1, denominator: 1 }, freshnessCompliance: { numerator: 1, denominator: 1 }, duplicateRate: { numerator: 0, denominator: 2 } },
    { supportingSourceRecall: { numerator: 8, denominator: 8 }, citationAccuracy: { numerator: 0, denominator: 3 }, freshnessCompliance: { numerator: 0, denominator: 0 }, duplicateRate: { numerator: 1, denominator: 8 } },
  ]);
  assert.equal(aggregate.queryCount, 2);
  assert.equal(aggregate.metrics.supportingSourceRecall.value, 9 / 10);
  assert.equal(aggregate.metrics.citationAccuracy.value, 1 / 4);
  assert.equal(aggregate.metrics.freshnessCompliance.value, 1);
  assert.equal(aggregate.metrics.duplicateRate.value, 1 / 10);
});
