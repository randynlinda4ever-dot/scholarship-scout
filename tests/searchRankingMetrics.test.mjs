
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGoldenQuery, aggregateSearchEvaluations } from "../supabase/functions/_shared/search-evaluation.mjs";

const query = {
  id: "graded-ranking",
  asOf: "2026-11-27",
  maxAgeDays: 365,
  expectedSources: [],
  relevanceJudgments: [
    { url: "https://official.example/strong", grade: 3 },
    { url: "https://official.example/relevant", grade: 2 },
    { url: "https://official.example/tangential", grade: 1 },
    { url: "https://official.example/irrelevant", grade: 0 },
  ],
};

const result = (slug) => ({
  title: slug,
  url: `https://official.example/${slug}`,
});

test("ranking evaluation calculates P@10, nDCG@10, MRR@10, Recall@50 and judgment coverage", () => {
  const evaluation = evaluateGoldenQuery(query, {
    status: "success",
    results: [
      result("tangential"),
      result("relevant"),
      result("strong"),
      result("irrelevant"),
      result("unjudged"),
    ],
  });

  assert.deepEqual(evaluation.precisionAt10, { value: 0.2, numerator: 2, denominator: 10 });
  assert.equal(evaluation.ndcgAt10.value > 0 && evaluation.ndcgAt10.value < 1, true);
  assert.equal(evaluation.mrrAt10.value, 0.5);
  assert.deepEqual(evaluation.recallAt50, { value: 1, numerator: 2, denominator: 2 });
  assert.deepEqual(evaluation.judgedCoverageAt10, { value: 0.8, numerator: 4, denominator: 5 });
});

test("ranking evaluation gives perfect nDCG and MRR to correctly ordered judged results", () => {
  const evaluation = evaluateGoldenQuery(query, {
    status: "success",
    results: [
      result("strong"),
      result("relevant"),
      result("tangential"),
      result("irrelevant"),
    ],
  });
  assert.equal(evaluation.ndcgAt10.value, 1);
  assert.equal(evaluation.mrrAt10.value, 1);
  assert.equal(evaluation.precisionAt10.value, 0.2);
});

test("ranking metrics stay unavailable without relevance judgments", () => {
  const evaluation = evaluateGoldenQuery({ ...query, relevanceJudgments: [] }, {
    status: "success",
    results: [result("strong")],
  });
  assert.equal(evaluation.precisionAt10.value, null);
  assert.equal(evaluation.ndcgAt10.value, null);
  assert.equal(evaluation.mrrAt10.value, null);
  assert.equal(evaluation.recallAt50.value, null);
  assert.equal(evaluation.judgedCoverageAt10.value, null);
});

test("aggregate ranking metrics use query-level macro averages", () => {
  const aggregate = aggregateSearchEvaluations([
    {
      supportingSourceRecall: { numerator: 1, denominator: 2 },
      citationAccuracy: { numerator: 1, denominator: 1 },
      freshnessCompliance: { numerator: 1, denominator: 1 },
      duplicateRate: { numerator: 0, denominator: 2 },
      precisionAt10: { value: 0.2 },
      ndcgAt10: { value: 0.5 },
      mrrAt10: { value: 1 },
      recallAt50: { value: 0.5 },
      judgedCoverageAt10: { value: 0.8 },
    },
    {
      supportingSourceRecall: { numerator: 8, denominator: 8 },
      citationAccuracy: { numerator: 0, denominator: 3 },
      freshnessCompliance: { numerator: 0, denominator: 0 },
      duplicateRate: { numerator: 1, denominator: 8 },
      precisionAt10: { value: 0.6 },
      ndcgAt10: { value: 1 },
      mrrAt10: { value: 0.5 },
      recallAt50: { value: 1 },
      judgedCoverageAt10: { value: 1 },
    },
  ]);
  assert.equal(aggregate.metrics.precisionAt10.value, 0.4);
  assert.equal(aggregate.metrics.ndcgAt10.value, 0.75);
  assert.equal(aggregate.metrics.mrrAt10.value, 0.75);
  assert.equal(aggregate.metrics.recallAt50.value, 0.75);
  assert.equal(aggregate.metrics.judgedCoverageAt10.value, 0.9);
});