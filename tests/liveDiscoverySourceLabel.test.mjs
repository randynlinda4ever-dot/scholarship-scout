import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("regular candidate cards derive sponsor attribution from the actual source domain", () => {
  const start = app.indexOf("function CandidateCard(");
  const end = app.indexOf("\nfunction Field(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const component = app.slice(start, end);

  assert.ok(component.includes("getSourceAttribution(item.sourceUrl).linkLabel"));
  assert.ok(component.includes("getSourceAttribution(item.sourceUrl).label"));
  assert.ok(!component.includes(">Sponsor page ↗</a>"));
});

test("detail views do not call an unverified third-party link an official source", () => {
  assert.ok(app.includes("Evidence excerpt attribution: {getEvidenceExcerptAttributions(selected).general?.label || 'No excerpt source recorded'}"));
  assert.ok(app.includes("{getSourceAttribution(selected.sourceUrl).linkLabel} ↗</a>"));
  assert.ok(!app.includes(">Open official source ↗</a>"));
});

test("unverified cloud discovery links are labeled as source pages, not sponsor pages", () => {
  const start = app.indexOf("function CloudResultCard(");
  const end = app.indexOf("\nfunction CandidateCard(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const component = app.slice(start, end);

  assert.ok(component.includes("Unverified lead"));
  assert.ok(component.includes("Sponsor not confirmed"));
  assert.ok(component.includes(">Open source page ↗</a>"));
  assert.ok(!component.includes(">Sponsor page ↗</a>"));
  assert.ok(component.includes("sanitizePublicHttpsUrl(item.source_url)"));
});
