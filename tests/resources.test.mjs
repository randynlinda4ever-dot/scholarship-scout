import test from "node:test";
import assert from "node:assert/strict";
import {
  createResourceWorkspace,
  normalizeResourceWorkspace,
  isValidResourceWorkspace,
  calculateNetPrice,
  MAX_RESUME_ENTRIES,
  RESUME_ENTRY_CATEGORIES,
  RESOURCE_CALENDAR,
  createResourceResumeEntry,
  updateResourceResumeEntry,
  removeResourceResumeEntry,
} from "../src/lib/resourceWorkspace.js";
import { buildScoutBackup, validateScoutBackup } from "../src/lib/backup.js";

const profile = { grade: "junior", graduationYear: "2028" };
const profileKeys = ["grade", "graduationYear"];

test("resource workspace starts with empty private worksheets and a bounded resume workspace", () => {
  const workspace = createResourceWorkspace();
  assert.deepEqual(workspace.essayPlan.scholarshipName, "");
  assert.deepEqual(workspace.aidChecklist.completed, []);
  assert.deepEqual(workspace.aidChecklist.comparisons, []);
  assert.deepEqual(workspace.calendarCompleted, []);
  assert.deepEqual(workspace.resumeEntries, []);
  assert.equal(MAX_RESUME_ENTRIES, 30);
  assert.ok(RESUME_ENTRY_CATEGORIES.includes("Community service"));
  assert.ok(RESOURCE_CALENDAR.length >= 7);
});

test("resume entry lifecycle creates, edits, and removes entries without changing their IDs", () => {
  const first = createResourceResumeEntry("resume-1");
  const second = createResourceResumeEntry("resume-2");
  assert.equal(first.category, "Activities");
  assert.equal(first.role, "");

  const added = [first, second];
  const edited = updateResourceResumeEntry(added, "resume-1", {
    role: "Volunteer coordinator",
    organization: "Food pantry",
  });
  assert.equal(edited[0].role, "Volunteer coordinator");
  assert.equal(edited[0].organization, "Food pantry");
  assert.equal(edited[0].id, "resume-1");
  assert.equal(edited[1].role, "");

  const removed = removeResourceResumeEntry(edited, "resume-1");
  assert.deepEqual(removed, [second]);
  assert.equal(updateResourceResumeEntry(removed, "missing", { role: "Ignored" }).length, 1);
});

test("normalization keeps only known checklist IDs and safe bounded worksheet fields", () => {
  const workspace = normalizeResourceWorkspace({
    essayPlan: {
      scholarshipName: "  Service award  ",
      prompt: "Describe a time you helped your community.",
      unexpectedField: "must not survive",
    },
    aidChecklist: {
      completed: ["fsa-account", "unknown", "fsa-account"],
      comparisons: [{ id: "school-1", school: "North College", cost: "42000", grants: "26000", notes: "Verify renewal rules" }],
    },
    calendarCompleted: [RESOURCE_CALENDAR[0].tasks[0].id, "not-a-real-task"],
  });
  assert.equal(workspace.essayPlan.scholarshipName, "  Service award  ");
  assert.equal(Object.hasOwn(workspace.essayPlan, "unexpectedField"), false);
  assert.deepEqual(workspace.aidChecklist.completed, ["fsa-account"]);
  assert.equal(workspace.aidChecklist.comparisons[0].school, "North College");
  assert.deepEqual(workspace.calendarCompleted, [RESOURCE_CALENDAR[0].tasks[0].id]);
});

test("normalizes resume entries, rejects unsafe identifiers, and bounds all student-entered text", () => {
  const workspace = normalizeResourceWorkspace({
    resumeEntries: [
      {
        id: "role-1", category: "Community service", role: "Volunteer",
        organization: "Food pantry", startDate: "2024-09", endDate: "2025-04",
        details: "Sorted donations and prepared weekly food boxes.",
        impact: "Helped prepare 40 food boxes each month.",
      },
      {
        id: "role-1", category: "Work", role: "Duplicate", organization: "",
        startDate: "", endDate: "", details: "", impact: "",
      },
      {
        id: "__proto__", category: "Work", role: "Unsafe", organization: "",
        startDate: "", endDate: "", details: "", impact: "",
      },
      {
        id: "role-2", category: "Unknown section", role: "R".repeat(140),
        organization: "O".repeat(180), startDate: "2026-13", endDate: "2025-01",
        details: "D".repeat(900), impact: "I".repeat(600),
      },
    ],
  });

  assert.equal(workspace.resumeEntries.length, 2);
  assert.deepEqual(workspace.resumeEntries[0], {
    id: "role-1", category: "Community service", role: "Volunteer",
    organization: "Food pantry", startDate: "2024-09", endDate: "2025-04",
    details: "Sorted donations and prepared weekly food boxes.",
    impact: "Helped prepare 40 food boxes each month.",
  });
  assert.equal(workspace.resumeEntries[1].category, "Activities");
  assert.equal(workspace.resumeEntries[1].role.length, 120);
  assert.equal(workspace.resumeEntries[1].organization.length, 160);
  assert.equal(workspace.resumeEntries[1].startDate, "");
  assert.equal(workspace.resumeEntries[1].endDate, "");
  assert.equal(workspace.resumeEntries[1].details.length, 800);
  assert.equal(workspace.resumeEntries[1].impact.length, 500);
  assert.equal(isValidResourceWorkspace(workspace), true);
});

test("validates resume records before they enter encrypted backups", () => {
  const workspace = createResourceWorkspace();
  const validEntry = {
    id: "role-1", category: "Work", role: "Team member", organization: "Store",
    startDate: "2025-05", endDate: "", details: "Assisted customers.", impact: "Trained new staff.",
  };
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [validEntry] }), true);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [{ ...validEntry, id: "__proto__" }] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [{ ...validEntry, category: "unknown" }] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [{ ...validEntry, startDate: "2025-13" }] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [{ ...validEntry, startDate: "", endDate: "2025-06" }] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [{ ...validEntry, startDate: "2025-06", endDate: "2025-05" }] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [{ ...validEntry, details: "x".repeat(801) }] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: [validEntry, validEntry] }), false);
  assert.equal(isValidResourceWorkspace({ ...workspace, resumeEntries: Array.from({ length: MAX_RESUME_ENTRIES + 1 }, (_, index) => ({ ...validEntry, id: "role-" + index })) }), false);
});

test("validates resource data before it enters an imported backup", () => {
  const workspace = createResourceWorkspace();
  assert.equal(isValidResourceWorkspace(workspace), true);
  assert.equal(isValidResourceWorkspace({ ...workspace, calendarCompleted: ["fake-task"] }), false);
  assert.equal(isValidResourceWorkspace({
    ...workspace,
    essayPlan: { ...workspace.essayPlan, prompt: 123 },
  }), false);
  assert.equal(isValidResourceWorkspace({
    ...workspace,
    aidChecklist: { completed: ["not-a-check"], comparisons: [] },
  }), false);
  assert.equal(isValidResourceWorkspace({
    ...workspace,
    aidChecklist: { completed: [], comparisons: [{ id: "__proto__", school: "x", cost: "1", grants: "0", notes: "" }] },
  }), false);
});

test("net price subtracts grants and scholarships only and rejects incomplete or invalid amounts", () => {
  assert.equal(calculateNetPrice("42000", "26000"), 16000);
  assert.equal(calculateNetPrice("12000.50", "2000.25"), 10000.25);
  assert.equal(calculateNetPrice("12000.", "2000"), 10000);
  assert.equal(calculateNetPrice("", "2000"), null);
  assert.equal(calculateNetPrice("42000", ""), null);
  assert.equal(calculateNetPrice("-1", "0"), null);
  assert.equal(calculateNetPrice("unknown", "0"), null);
  assert.equal(calculateNetPrice("1e3", "0"), null);
  assert.equal(calculateNetPrice("1,000", "0"), null);
});

test("version-three encrypted backup round-trips resource worksheets and progress", () => {
  const resources = createResourceWorkspace();
  resources.essayPlan.scholarshipName = "Community Leadership Award";
  resources.essayPlan.coreMessage = "I learned to lead by listening.";
  resources.aidChecklist.completed = ["fsa-account"];
  resources.aidChecklist.comparisons = [{
    id: "school-1", school: "North College", cost: "42000", grants: "26000", notes: "",
  }];
  resources.calendarCompleted = [RESOURCE_CALENDAR[0].tasks[0].id];
  resources.resumeEntries = [{
    id: "resume-1", category: "Leadership", role: "Club officer", organization: "Student council",
    startDate: "2025-08", endDate: "", details: "Organized meetings and coordinated volunteers.",
    impact: "Led a school supply drive.",
  }];

  const backup = buildScoutBackup(profile, [], new Date("2026-11-27T00:00:00.000Z"), {}, {}, profile, resources);
  assert.equal(backup.version, 3);
  assert.deepEqual(backup.resourceWorkspace, resources);

  const restored = validateScoutBackup(backup, profileKeys);
  assert.equal(restored.ok, true);
  if (restored.ok) assert.deepEqual(restored.value.resourceWorkspace, resources);
});

test("older version-two backups remain valid and restore an empty resource workspace", () => {
  const backup = buildScoutBackup(profile, [], new Date(0));
  backup.version = 2;
  delete backup.resourceWorkspace;
  const restored = validateScoutBackup(backup, profileKeys);
  assert.equal(restored.ok, true);
  if (restored.ok) assert.deepEqual(restored.value.resourceWorkspace, createResourceWorkspace());
});

test("normalization clears malformed financial amounts before they reach saved state", () => {
  const workspace = normalizeResourceWorkspace({
    aidChecklist: {
      completed: [],
      comparisons: [
        { id: "school-1", school: "North College", cost: "1e3", grants: "-20", notes: "" },
      ],
    },
  });
  assert.equal(workspace.aidChecklist.comparisons[0].cost, "");
  assert.equal(workspace.aidChecklist.comparisons[0].grants, "");
  assert.equal(isValidResourceWorkspace(workspace), true);
});

test("resource UI persists worksheets locally and follows browser Back/Forward navigation", async () => {
  const app = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  );
  const page = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/features/resources/ResourcesPage.tsx", import.meta.url), "utf8"),
  );
  assert.match(app, /readLocalJson\('scout-resource-workspace'\)/);
  assert.match(app, /persistLocalJsonState\(\s*'scout-resource-workspace'/);
  assert.match(app, /resourceWorkspace\)\)/);
  assert.match(page, /addEventListener\("popstate", syncHash\)/);
  assert.match(page, /removeEventListener\("popstate", syncHash\)/);
  assert.match(page, /type="number"/);
  assert.match(page, /maxLength=\{120\}/);
  assert.match(page, /maxLength=\{160\}/);
  assert.match(page, /maxLength=\{800\}/);
  assert.match(page, /maxLength=\{500\}/);
  const styles = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/features/resources/ResourcesPage.css", import.meta.url), "utf8"),
  );
  assert.match(styles, /\.resource-page select:focus-visible/);
  assert.match(styles, /\.resource-resume-preview-topline \{ display: flex; flex-wrap: wrap/);
  assert.match(page, /id: "resume"/);
  assert.match(page, /active === "resume"/);
  assert.match(page, /Experience entries/);
  assert.match(page, /Printable resume content/);
  assert.match(page, /RESUME_ENTRY_CATEGORIES/);
  assert.match(page, /MAX_RESUME_ENTRIES/);
  assert.match(page, /Add experience/);
  assert.match(page, /Remove experience/);
  assert.match(page, /className="resource-callout resource-no-print"/);
  assert.match(page, /className="resource-private-note resource-no-print"/);
  assert.match(page, /className="resource-empty-state resource-no-print"/);
});