import test from "node:test";
import assert from "node:assert/strict";
import { invalidateSourceReviewIfChanged } from "../src/lib/sourceReview.js";

const verified = {
  name: "Example Award",
  provider: "Example Foundation",
  award: "$1,000",
  deadline: "2027-05-03",
  deadlineText: "May 3, 2027",
  deadlineTimezone: "Central",
  deadlineNotPublished: false,
  sourceUrl: "https://example.org/award",
  evidenceUrl: "https://example.org/rules",
  sourceAuthority: "official-sponsor",
  evidenceText: "Texas seniors may apply.",
  criteria: { state: "TX" },
  criteriaEvidence: { state: { excerpt: "Texas residents only." } },
  sourceVerified: true,
  lastCheckedDate: "2026-11-13",
};

test("invalidates a prior source review when any source-critical field changes", () => {
  for (const [field, value] of [
    ["sourceUrl", "https://example.org/new-award"],
    ["name", "Revised Award Name"],
    ["provider", "Different Foundation"],
    ["award", "$2,000"],
    ["deadline", "2027-06-01"],
    ["deadlineText", "June 1, 2027"],
    ["evidenceText", "Only graduating seniors may apply."],
    ["evidenceUrl", "https://example.org/new-rules"],
    ["sourceAuthority", "unverified-lead"],
    ["criteria", { state: "CA" }],
    ["criteriaEvidence", { state: { excerpt: "California residents only." } }],
  ]) {
    const updated = invalidateSourceReviewIfChanged(verified, { ...verified, [field]: value });
    assert.equal(updated.sourceVerified, false, field);
    assert.equal(updated.lastCheckedDate, "", field);
  }
});

test("preserves verification for unrelated notes and application-progress edits", () => {
  const updated = invalidateSourceReviewIfChanged(verified, {
    ...verified, notes: "Personal reminder", applicationStatus: "In progress",
  });
  assert.equal(updated.sourceVerified, true);
  assert.equal(updated.lastCheckedDate, "2026-11-13");
});

test("accepts a fresh explicit source review after source-critical edits", () => {
  const updated = invalidateSourceReviewIfChanged(verified, {
    ...verified,
    sourceUrl: "https://example.org/revised-award",
    sourceVerified: true,
    lastCheckedDate: "2026-11-13",
  }, true);
  assert.equal(updated.sourceVerified, true);
  assert.equal(updated.lastCheckedDate, "2026-11-13");
});

test("does not change an unchanged record or an already unverified record", () => {
  assert.deepEqual(invalidateSourceReviewIfChanged(verified, { ...verified }), { ...verified });
  const unverified = { ...verified, sourceVerified: false, lastCheckedDate: "" };
  assert.deepEqual(invalidateSourceReviewIfChanged(unverified, { ...unverified, notes: "Changed" }), { ...unverified, notes: "Changed" });
});

test("keeps a source review when equivalent nested evidence objects have different key order", () => {
  const reviewed = {
    ...verified,
    criteria: { state: "TX", majorKeywords: ["history", "arts"] },
    criteriaEvidence: {
      state: { excerpt: "Texas residents only.", sourceUrl: "https://example.org/rules" },
      majorKeywords: { excerpt: "History and arts applicants may apply.", sourceUrl: "https://example.org/rules" },
    },
  };
  const reordered = {
    ...reviewed,
    criteria: { majorKeywords: ["history", "arts"], state: "TX" },
    criteriaEvidence: {
      majorKeywords: { sourceUrl: "https://example.org/rules", excerpt: "History and arts applicants may apply." },
      state: { sourceUrl: "https://example.org/rules", excerpt: "Texas residents only." },
    },
  };

  const updated = invalidateSourceReviewIfChanged(reviewed, reordered);
  assert.equal(updated.sourceVerified, true);
  assert.equal(updated.lastCheckedDate, reviewed.lastCheckedDate);
});

test("preserves the previous sponsor and supporting evidence URLs when either URL changes", async () => {
  const { appendSourceEvidenceHistory } = await import("../src/lib/sourceReview.js");
  const updated = appendSourceEvidenceHistory(verified, {
    ...verified,
    sourceUrl: "https://example.org/new-award",
    evidenceUrl: "https://example.org/new-rules",
  }, "2026-11-24T12:00:00.000Z");

  assert.equal(updated.sourceEvidenceHistory.length, 1);
  assert.equal(updated.sourceEvidenceHistory[0].recordedAt, "2026-11-24T12:00:00.000Z");
  assert.equal(updated.sourceEvidenceHistory[0].sourceUrl, verified.sourceUrl);
  assert.equal(updated.sourceEvidenceHistory[0].evidenceUrl, verified.evidenceUrl);
});

test("preserves previous source and criterion excerpts when evidence text is revised", async () => {
  const { appendSourceEvidenceHistory } = await import("../src/lib/sourceReview.js");
  const updated = appendSourceEvidenceHistory(verified, {
    ...verified,
    evidenceText: "Revised sponsor excerpt.",
    criteriaEvidence: { state: { excerpt: "Revised Texas rule.", sourceUrl: "https://example.org/new-rules" } },
  }, "2026-11-24T12:00:00.000Z");

  const prior = updated.sourceEvidenceHistory[0];
  assert.equal(prior.evidenceText, verified.evidenceText);
  assert.deepEqual(prior.criteriaEvidence, verified.criteriaEvidence);
});

test("appends source evidence revisions without changing history for unrelated edits", async () => {
  const { appendSourceEvidenceHistory } = await import("../src/lib/sourceReview.js");
  const first = appendSourceEvidenceHistory(verified, {
    ...verified, sourceUrl: "https://example.org/revision-one",
  }, "2026-11-20T12:00:00.000Z");
  const second = appendSourceEvidenceHistory(first, {
    ...first, evidenceText: "Second sponsor excerpt.",
  }, "2026-11-21T12:00:00.000Z");
  const unchanged = appendSourceEvidenceHistory(second, {
    ...second, notes: "Unrelated personal note.",
  }, "2026-11-22T12:00:00.000Z");

  assert.equal(unchanged.sourceEvidenceHistory.length, 2);
  assert.equal(unchanged.sourceEvidenceHistory[0].sourceUrl, verified.sourceUrl);
  assert.equal(unchanged.sourceEvidenceHistory[1].sourceUrl, "https://example.org/revision-one");
  assert.equal(unchanged.sourceEvidenceHistory[1].evidenceText, verified.evidenceText);
});
