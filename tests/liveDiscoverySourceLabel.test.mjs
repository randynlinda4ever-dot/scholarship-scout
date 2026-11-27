import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWorkspaceSource } from "./helpers/workspaceSource.mjs";

const app = await readWorkspaceSource();
const cards = await readFile(new URL("../src/components/ScholarshipCards.tsx", import.meta.url), "utf8");

test("regular candidate cards derive sponsor attribution from the actual source domain", () => {
  const start = cards.indexOf("export function CandidateCard(");
  const end = cards.indexOf("\nexport function Empty(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const component = cards.slice(start, end);

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
  const start = cards.indexOf("export function CloudResultCard(");
  const end = cards.indexOf("\nconst formatDate", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const component = cards.slice(start, end);

  assert.ok(component.includes("Unverified lead"));
  assert.ok(component.includes("Sponsor not confirmed"));
  assert.ok(component.includes(">Open source page ↗</a>"));
  assert.ok(!component.includes(">Sponsor page ↗</a>"));
  assert.ok(component.includes("sanitizePublicHttpsUrl(item.source_url)"));
});
