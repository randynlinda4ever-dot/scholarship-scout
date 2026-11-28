import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const pageTypes = await readFile(new URL("../src/features/workspace/pageTypes.ts", import.meta.url), "utf8");
const fields = await readFile(new URL("../src/components/WorkspaceFields.tsx", import.meta.url), "utf8");
const trackerStart = app.indexOf("{tab === 'Scholarships'");
const prepStart = app.indexOf("{tab === 'Application prep'", trackerStart);
const trackerPage = app.slice(trackerStart, prepStart);
const editorStart = app.indexOf("{showAdd &&");
const selectedStart = app.indexOf("{selected && selectedAssessment", editorStart);
const backupStart = app.indexOf("{backupDialogMode !== 'closed'", selectedStart);
const editor = app.slice(editorStart, selectedStart);
const details = app.slice(selectedStart, backupStart > 0 ? backupStart : app.length);
const eligibilitySummary = app.slice(app.indexOf("function EligibilityMatchSummary"), app.indexOf("function Empty", app.indexOf("function EligibilityMatchSummary")));

function fieldLine(label) {
  return editor.split("\n").find((line) => line.includes(`label="${label}"`) || line.includes(`label='${label}'`))?.trim() ?? "";
}

test("the active My Scholarships route is the single current tracker, not an unused legacy page", () => {
  assert.match(trackerPage, /MY SCHOLARSHIPS/);
  assert.match(trackerPage, /Tracked opportunities/);
  assert.equal(existsSync(new URL("../src/features/workspace/pages/ScholarshipsPage.tsx", import.meta.url)), true);
  assert.match(pageTypes, /interface ScholarshipsPageModel/);
  assert.doesNotMatch(app, /from ['"].*features\/workspace\/pages\/ScholarshipsPage/);
});

test("the tracker keeps application progress, personal priority, eligibility and source freshness separate", () => {
  for (const category of [
    /Application status/,
    /Personal priority|PriorityPill/,
    /Eligibility/,
    /Source review/,
    /Application status filter/,
    /Eligibility status filter/,
    /Archive filter/,
    /Sort tracker records/,
  ]) assert.match(trackerPage + details, category);
  assert.match(trackerPage, /eligibility and application status are separate/);
  assert.match(trackerPage, /not an award guarantee/i);
});

test("the editor explicitly states only scholarship name and provider are required", () => {
  assert.match(editor, /Only scholarship name and provider are required/i);
  assert.match(editor, /All remaining fields are optional/i);
  assert.match(fieldLine("Scholarship name *"), /required/);
  assert.match(fieldLine("Provider *"), /required/);
  assert.match(fieldLine("Scholarship name *"), /requirement="required"/);
  assert.match(fieldLine("Provider *"), /requirement="required"/);
});

test("numeric sponsor criteria use native number inputs and engine-aligned ranges", () => {
  const expected = [
    ["Minimum age (years)", /type="number" min=\{0\} max=\{120\} step=\{1\}/],
    ["Maximum age (years)", /type="number" min=\{0\} max=\{120\} step=\{1\}/],
    ["Graduation year", /type="number" min=\{1900\} max=\{2100\} step=\{1\}/],
    ["GPA threshold", /type="number" min=\{0\} max=\{5\} step="any"/],
    ["Class-rank cutoff (top %)", /type="number" min=\{0\} max=\{100\} step="any"/],
    ["ACT threshold", /type="number" min=\{1\} max=\{36\} step=\{1\}/],
    ["SAT threshold", /type="number" min=\{400\} max=\{1600\} step=\{10\}/],
    ["Community-service hours", /type="number" min=\{0\} max=\{1000000\} step="any"/],
  ];
  for (const [label, pattern] of expected) {
    assert.match(fieldLine(label), pattern, `${label} has incorrect or missing numeric constraints`);
  }
});

test("age boundary choices become required only when the matching age threshold exists", () => {
  assert.match(fieldLine("Minimum age boundary"), /required=\{draft\.criteria\.ageRange\?\.min != null\}/);
  assert.match(fieldLine("Maximum age boundary"), /required=\{draft\.criteria\.ageRange\?\.max != null\}/);
  assert.match(fields, /export function SelectField[\s\S]*required = false/);
  assert.match(fields, /<select required=\{required\}/);
});

test("ACT and SAT sponsor alternatives are represented as an either/or rule, not two independent requirements", () => {
  assert.match(editor, /Independent test-score requirements/);
  assert.match(editor, /Alternative test-score requirement: ACT or SAT/);
  assert.match(editor, /Meeting either entered minimum satisfies this one alternative rule/);
  assert.match(fieldLine("ACT minimum (alternative route)"), /type="number" min=\{1\} max=\{36\} step=\{1\}/);
  assert.match(fieldLine("SAT minimum (alternative route)"), /type="number" min=\{400\} max=\{1600\} step=\{10\}/);
  assert.match(app, /const setActOrSatThreshold = \(key: 'act' \| 'sat', value: string\)/);
  assert.match(app, /minActOrSat: thresholds\.act === undefined && thresholds\.sat === undefined/);
  assert.match(app, /if \(value === ''\) delete thresholds\[key\]/);
});

test("all sponsor and criterion evidence URLs use URL inputs while dates use date inputs", () => {
  for (const label of [
    "Exact official page URL for the award excerpt",
    "Official sponsor URL",
    "Exact official page URL for the general evidence excerpt",
    "Exact official page URL for this rule",
  ]) {
    assert.match(fieldLine(label), /type="url"/, `${label} should be an HTML URL input`);
  }
  for (const label of [
    "Application opening date (only if confirmed)",
    "Priority deadline date",
    "Final deadline date",
    "Submission date (only after you submit)",
    "Award decision date",
  ]) {
    assert.match(fieldLine(label), /type="date"/, `${label} should use a date picker`);
  }
});

test("the editor groups fields by scholarship, award/deadlines, application, evidence and eligibility", () => {
  for (const category of [
    "Scholarship details",
    "Award and deadlines",
    "Application progress",
    "Sponsor source and evidence",
    "Structured eligibility rules",
    "Requirement evidence and verification",
    "Notes and verification",
  ]) assert.ok(editor.includes(category), `missing category group: ${category}`);
});

test("the visible tracker, editor, and detail views do not expose backend or diagnostic terminology", () => {
  const visible = [trackerPage, editor, details].join("\n");
  assert.doesNotMatch(visible, /Supabase|Edge Function|API key|stack trace|request id|debug(?:ging)?|database table|\bSQL\b|internal endpoint/i);
});

test("eligibility evidence distinguishes mandatory rules from preferred qualifications", () => {
  assert.match(editor, /Mandatory/);
  assert.match(editor, /Preferred/);
  assert.match(editor, /does not disqualify/);
  assert.match(eligibilitySummary, /Preferred qualifications \(informational\)/);
  assert.match(eligibilitySummary, /Preferred not met — not disqualifying/);
  assert.match(eligibilitySummary, /criterion evidence is not linked/i);
});

test("removing a scholarship requires explicit confirmation before deleting dependent application data", () => {
  assert.match(details, /onClick=\{\(\)=>setRemoveConfirmationId\(selected\.id\)\}>Remove from tracker/);
  assert.match(details, /role="alertdialog"/);
  assert.match(app, /useEffect\(\(\) => \{ setRemoveConfirmationId\(null\); \}, \[selected\?\.id\]\);/);
  assert.match(details, /Remove scholarship and its application workspace/);
  assert.match(details, /onClick=\{\(\)=>\{if\(!saveItems\(items\.filter\(x=>x\.id!==selected\.id\)\)\)return;/);
  assert.match(details, /Cancel removal/);
});

test("the app clearly explains why a scholarship is retained and where information belongs", () => {
  assert.match(editor, /Structured eligibility rules/);
  assert.match(editor, /Sponsor source and evidence/);
  assert.match(editor, /leave a field blank when the sponsor does not specify that requirement/i);
  assert.match(editor, /personal progress is separate from sponsor eligibility/i);
});

test("shared field component renders audited numeric constraints and required-field labels", () => {
  assert.match(fields, /min\?: number/);
  assert.match(fields, /max\?: number/);
  assert.match(fields, /step\?: number \| ["']any["']/);
  assert.match(fields, /min=\{min\}/);
  assert.match(fields, /max=\{max\}/);
  assert.match(fields, /step=\{step\}/);
  assert.match(fields, /data-requirement=\{requirement\}/);
  assert.match(fields, /Required/);
  assert.match(fields, /Optional/);
});
