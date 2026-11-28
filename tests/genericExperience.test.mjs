import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const discovery = await readFile(new URL("../src/lib/discovery.js", import.meta.url), "utf8");

test("first-run scholarship discovery contains no school, district, county, or personal profile presets", () => {
  for (const unwanted of [
    "Example District", "Example High School", "Example County",
    "Example Education Foundation", "Example State University",
    "Example Honor Society", "Example Academic Competition",
  ]) {
    assert.equal(app.includes(unwanted), false, `unexpected targeted preset: ${unwanted}`);
    assert.equal(discovery.includes(unwanted), false, `unexpected targeted query: ${unwanted}`);
  }
  assert.match(app, /const DISCOVERED: Scholarship\[\] = \[\]/);
});

test("school and district are editable optional profile inputs with no suggested institution", () => {
  assert.match(app, /Field label="School name \(local result ordering\)" value=\{profileDraft\.school\}/);
  assert.match(app, /Field label="School district" value=\{profileDraft\.district\}/);
  assert.match(app, /Used only on this device to prioritize returned results that mention your school/);
});

test("discovery categories are reusable and include school-based searches without named schools", () => {
  assert.match(discovery, /id: "school_resources"/);
  assert.match(discovery, /id: "local"/);
});

test("generic profile version does not embed a student's school, organization, or region", async () => {
  assert.match(app, /profileVersion: 'profile-general-2026-11-v3'/);
  const profileModel = await readFile(new URL("../src/lib/profileModel.js", import.meta.url), "utf8");
  assert.match(profileModel, /CURRENT_PROFILE_VERSION = "profile-general-2026-11-v3"/);
  assert.match(app, /PROFILE_VERSION = CURRENT_PROFILE_VERSION/);
});