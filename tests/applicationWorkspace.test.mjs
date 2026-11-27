import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TRACKER_RECORDS } from "../src/lib/trackerManagement.js";
import {
  APPLICATION_DOCUMENT_TEMPLATES,
  FINAL_APPLICATION_REVIEW_ITEMS,
  createApplicationWorkspace,
  countApplicationWords,
  normalizeApplicationWorkspace,
  getApplicationWorkspaceSummary,
} from "../src/lib/applicationWorkspace.js";

const scholarshipIds = ["s-1", "s-2"];

test("creates a workspace with suggested document rows and final review steps", () => {
  const workspace = createApplicationWorkspace();
  assert.equal(workspace.customTasks.length, 0);
  assert.equal(workspace.essays.length, 0);
  assert.equal(workspace.recommenders.length, 0);
  assert.deepEqual(
    workspace.documents.map((document) => document.title),
    APPLICATION_DOCUMENT_TEMPLATES,
  );
  assert.deepEqual(
    workspace.finalReview.map((item) => item.label),
    FINAL_APPLICATION_REVIEW_ITEMS,
  );
  assert.ok(workspace.documents.every((document) => document.required === false && document.ready === false));
});

test("normalizes each scholarship independently and drops unknown scholarship IDs", () => {
  const normalized = normalizeApplicationWorkspace({
    "s-1": { customTasks: [{ id: "t1", title: "Ask counselor", completed: true }] },
    "unknown": { customTasks: [{ id: "t2", title: "Not retained" }] },
  }, scholarshipIds);

  assert.deepEqual(Object.keys(normalized), ["s-1"]);
  assert.equal(normalized["s-1"].customTasks[0].completed, true);
  assert.equal(normalized["s-1"].documents.length, APPLICATION_DOCUMENT_TEMPLATES.length);
  assert.equal(normalized["s-1"].finalReview.length, FINAL_APPLICATION_REVIEW_ITEMS.length);
});

test("normalizes essays, recommendation requests, documents, and date-only deadlines", () => {
  const normalized = normalizeApplicationWorkspace({
    "s-1": {
      customTasks: [{ id: " t1 ", title: "  Request transcript  ", completed: 1, dueDate: "2026-11-20" }],
      essays: [{ id: "e1", title: "Why this field?", prompt: "Explain your interest.", wordLimit: "300", draft: "My draft." }],
      recommenders: [{ id: "r1", name: " Ms. Example ", role: "Counselor", status: "Received", requestedAt: "2026-11-01", dueDate: "2026-11-18", receivedAt: "2026-11-12", notes: "  Thanked her  " }],
      documents: [{ id: "d1", title: "Transcript", required: true, ready: true, dueDate: "2026-11-19", notes: "Official copy" }],
    },
  }, scholarshipIds);

  const entry = normalized["s-1"];
  assert.deepEqual(entry.customTasks[0], { id: "t1", title: "Request transcript", completed: false, dueDate: "2026-11-20" });
  assert.deepEqual(entry.essays[0], { id: "e1", title: "Why this field?", prompt: "Explain your interest.", wordLimit: 300, draft: "My draft." });
  assert.equal(entry.recommenders[0].name, "Ms. Example");
  assert.equal(entry.recommenders[0].status, "Received");
  assert.equal(entry.recommenders[0].receivedAt, "2026-11-12");
  assert.equal(entry.recommenders[0].notes, "Thanked her");
  assert.equal(entry.documents.length, 1);
  assert.equal(entry.documents[0].required, true);
  assert.equal(entry.documents[0].ready, true);
});

test("rejects prototype-like IDs and invalid dates while retaining safe entries", () => {
  const normalized = normalizeApplicationWorkspace({
    "s-1": {
      customTasks: [
        { id: "__proto__", title: "Unsafe ID" },
        { id: "safe", title: "Safe task", completed: true, dueDate: "2026-02-31" },
      ],
      essays: [{ id: "e1", title: "Essay", prompt: "Prompt", wordLimit: 500, draft: "Draft" }],
      recommenders: [{ id: "r1", name: "Person", role: "Teacher", status: "Sent", requestedAt: "2026-11-31" }],
      documents: [{ id: "d1", title: "Transcript", required: true, ready: true, dueDate: "not-a-date" }],
    },
  }, scholarshipIds);

  assert.equal(normalized["s-1"].customTasks.length, 1);
  assert.equal(normalized["s-1"].customTasks[0].dueDate, "");
  assert.equal(normalized["s-1"].recommenders[0].status, "Not requested");
  assert.equal(normalized["s-1"].recommenders[0].requestedAt, "");
  assert.equal(normalized["s-1"].documents[0].dueDate, "");
});

test("counts Unicode words and ignores punctuation-only fragments", () => {
  assert.equal(countApplicationWords("History, culture, and 21st-century research!"), 5);
  assert.equal(countApplicationWords("  "), 0);
  assert.equal(countApplicationWords("don't stop—learning"), 3);
});

test("calculates completion from checklist steps and only required application materials", () => {
  const workspace = createApplicationWorkspace();
  workspace.customTasks = [
    { id: "t1", title: "Confirm deadline", completed: true, dueDate: "" },
    { id: "t2", title: "Upload file", completed: false, dueDate: "" },
  ];
  workspace.essays = [
    { id: "e1", title: "Prompt one", prompt: "Why?", wordLimit: 2, draft: "One two three" },
    { id: "e2", title: "Prompt two", prompt: "How?", wordLimit: 10, draft: "" },
  ];
  workspace.recommenders = [
    { id: "r1", name: "Counselor", role: "Counselor", status: "Received", requestedAt: "", dueDate: "", receivedAt: "", notes: "" },
  ];
  workspace.documents[0].required = true;
  workspace.documents[0].ready = true;
  workspace.documents[1].required = true;
  workspace.documents[1].ready = false;
  workspace.finalReview[0].done = true;

  const summary = getApplicationWorkspaceSummary(workspace, [true, true, false]);
  assert.equal(summary.completed, 6);
  assert.equal(summary.total, 15);
  assert.equal(summary.percent, 40);
  assert.equal(summary.wordCount, 3);
  assert.equal(summary.overLimitEssays, 1);
});

test("preserves workspace entries beyond the former 500-record cutoff", () => {
  const ids = Array.from({ length: 600 }, (_, index) => `s-${index}`);
  const source = Object.fromEntries(ids.map((id) => [id, {}]));
  const normalized = normalizeApplicationWorkspace(source, ids);
  assert.equal(MAX_TRACKER_RECORDS, 2000);
  assert.equal(Object.keys(normalized).length, 600);
});

test("bounds workspace size and text fields", () => {
  const customTasks = Array.from({ length: 80 }, (_, index) => ({
    id: `t-${index}`, title: `Task ${index}`, completed: false,
  }));
  const essays = Array.from({ length: 30 }, (_, index) => ({
    id: `e-${index}`, title: "Essay", prompt: "p".repeat(6000), wordLimit: 50000, draft: "d".repeat(30000),
  }));
  const normalized = normalizeApplicationWorkspace({
    "s-1": { customTasks, essays },
  }, scholarshipIds);
  assert.equal(normalized["s-1"].customTasks.length, 50);
  assert.equal(normalized["s-1"].essays.length, 20);
  assert.ok(normalized["s-1"].essays[0].prompt.length <= 5000);
  assert.equal(normalized["s-1"].essays[0].wordLimit, 10000);
});
