import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDocumentText,
  extractTranscriptSuggestions,
  createEssayDraftFromDocument,
} from "../src/lib/documentImport.js";

test("transcript extraction identifies explicitly labeled academic values for review", () => {
  const text = `
    Cumulative Weighted GPA: 4.18 / 5.0
    Class Rank: 14 of 520
    ACT Composite Score: 31
    SAT Total Score: 1420
    Credits Earned: 26.5
  `;
  const suggestions = extractTranscriptSuggestions(text);
  const values = Object.fromEntries(suggestions.map(({ field, value }) => [field, value]));
  assert.equal(values.gpa, "4.18");
  assert.equal(values.gpaType, "Weighted / 5.0");
  assert.equal(values.classRank, "14/520");
  assert.equal(values.act, "31");
  assert.equal(values.sat, "1420");
  assert.equal(values.credits, "26.5");
});

test("transcript extraction rejects values outside supported academic ranges", () => {
  const suggestions = extractTranscriptSuggestions("GPA: 8.5 / 4.0\nACT: 55\nSAT: 2200");
  assert.deepEqual(suggestions, []);
});

test("transcript import does not suggest GPA values on scales outside current eligibility support", () => {
  assert.deepEqual(extractTranscriptSuggestions("Weighted GPA: 5.6 / 6.0"), []);
  assert.deepEqual(extractTranscriptSuggestions("GPA: 95 / 100"), []);
  assert.deepEqual(extractTranscriptSuggestions("GPA: 5.6"), []);
});

test("document text normalization removes control characters and enforces a size limit", () => {
  assert.equal(normalizeDocumentText("  A\r\n\tB\u0000  "), "A\nB");
  assert.equal(normalizeDocumentText("x".repeat(20), 8).length, 8);
});

test("essay import uses the filename as a safe title and does not alter the supplied writing", () => {
  const result = createEssayDraftFromDocument("My Personal Essay.final.docx", "  My exact draft.\nSecond paragraph.  ");
  assert.equal(result.title, "My Personal Essay");
  assert.equal(result.draft, "My exact draft.\nSecond paragraph.");
});


test("essay import refuses to silently truncate documents larger than the application draft limit", () => {
  assert.throws(
    () => createEssayDraftFromDocument("Long essay.txt", "x".repeat(20_001)),
    /split it into separate drafts/i,
  );
});
