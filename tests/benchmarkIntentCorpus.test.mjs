import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const corpus = JSON.parse(await readFile(new URL("./fixtures/search/benchmark-intents.json", import.meta.url), "utf8"));

test("search intent corpus contains one hundred public, non-personal, unjudged cases", () => {
  assert.equal(corpus.queryCount, 100);
  assert.equal(corpus.queries.length, 100);
  assert.equal(new Set(corpus.queries.map((item) => item.id)).size, 100);
  assert.equal(new Set(corpus.queries.flatMap((item) => item.categories)).size, 14);
  assert.ok(corpus.queries.every((item) =>
    item.filters &&
    typeof item.filters.state === "string" &&
    Number.isInteger(item.filters.graduationYear) &&
    item.asOf === "2026-11-27" &&
    Array.isArray(item.expectedSources) &&
    item.expectedSources.length === 0 &&
    Array.isArray(item.relevanceJudgments) &&
    item.relevanceJudgments.length === 0 &&
    item.judgmentStatus === "pending"
  ));
  assert.match(corpus.note, /not a measured quality benchmark/i);
});
