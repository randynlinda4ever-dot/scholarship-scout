import test from "node:test";
import assert from "node:assert/strict";
import {
  createResourceWorkspace,
  normalizeResourceWorkspace,
  isValidResourceWorkspace,
  calculateNetPrice,
  RESOURCE_CALENDAR,
} from "../src/lib/resourceWorkspace.js";
import { buildScoutBackup, validateScoutBackup } from "../src/lib/backup.js";

const profile = { grade: "junior", graduationYear: "2028" };
const profileKeys = ["grade", "graduationYear"];

test("resource workspace starts with all five resources represented and empty private drafts", () => {
  const workspace = createResourceWorkspace();
  assert.deepEqual(workspace.essayPlan.scholarshipName, "");
  assert.deepEqual(workspace.aidChecklist.completed, []);
  assert.deepEqual(workspace.aidChecklist.comparisons, []);
  assert.deepEqual(workspace.calendarCompleted, []);
  assert.ok(RESOURCE_CALENDAR.length >= 7);
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
});