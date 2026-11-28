import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  workspacePathToTab,
  workspaceTabToPath,
} from "../src/lib/workspaceRoutes.js";

test("direct workspace paths resolve to their intended tabs", () => {
  assert.equal(workspacePathToTab("/"), "Overview");
  assert.equal(workspacePathToTab("/overview"), "Overview");
  assert.equal(workspacePathToTab("/discovery"), "Discovery");
  assert.equal(workspacePathToTab("/cloud-search"), "Cloud Search");
  assert.equal(workspacePathToTab("/scholarships"), "Scholarships");
  assert.equal(workspacePathToTab("/application-prep"), "Application prep");
  assert.equal(workspacePathToTab("/eligibility"), "Eligibility filters");
  assert.equal(workspacePathToTab("/resources"), "Resources");
  assert.equal(workspacePathToTab("/settings"), "Settings");
});

test("workspace routes normalize trailing slashes and unknown paths safely", () => {
  assert.equal(workspacePathToTab("/discovery/"), "Discovery");
  assert.equal(workspacePathToTab("/resources/"), "Resources");
  assert.equal(workspacePathToTab("/not-a-page"), "Overview");
});

test("tab selection maps back to stable browser paths", () => {
  assert.equal(workspaceTabToPath("Overview"), "/");
  assert.equal(workspaceTabToPath("Discovery"), "/discovery");
  assert.equal(workspaceTabToPath("Cloud Search"), "/cloud-search");
  assert.equal(workspaceTabToPath("Scholarships"), "/scholarships");
  assert.equal(workspaceTabToPath("Application prep"), "/application-prep");
  assert.equal(workspaceTabToPath("Eligibility filters"), "/eligibility");
  assert.equal(workspaceTabToPath("Resources"), "/resources");
  assert.equal(workspaceTabToPath("Settings"), "/settings");
});

test("the React workspace initializes from direct paths and supports browser history", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /useState\(\(\) => workspacePathToTab\(window\.location\.pathname\)\)/);
  assert.match(app, /window\.history\.pushState\(/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  assert.match(app, /workspacePathToTab\(window\.location\.pathname\)/);
});
