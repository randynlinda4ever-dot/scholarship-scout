import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getScholarshipSourcePageUrl } from "../src/lib/evidence.js";
import {
  getWorkspaceScrollPosition,
  saveWorkspaceScrollPosition,
} from "../src/lib/workspaceScroll.js";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const cards = await readFile(new URL("../src/components/ScholarshipCards.tsx", import.meta.url), "utf8");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("source-page links preserve the actual scholarship path and useful query parameters", () => {
  assert.equal(
    getScholarshipSourcePageUrl("https://awards.example.org/scholarships/first-generation?cycle=2027&utm_source=search"),
    "https://awards.example.org/scholarships/first-generation?cycle=2027",
  );
});

test("source-page links do not mislabel a sponsor homepage as a scholarship page", () => {
  assert.equal(getScholarshipSourcePageUrl("https://awards.example.org/"), null);
  assert.equal(getScholarshipSourcePageUrl("https://awards.example.org/?page=scholarship&id=42"), "https://awards.example.org/?id=42&page=scholarship");
});

test("source-page links reject unsafe URLs", () => {
  assert.equal(getScholarshipSourcePageUrl("http://awards.example.org/scholarship"), null);
  assert.equal(getScholarshipSourcePageUrl("https://localhost/scholarship"), null);
});

test("workspace scroll positions persist independently for each app page", () => {
  const storage = memoryStorage();
  saveWorkspaceScrollPosition("/discovery", 840, storage);
  saveWorkspaceScrollPosition("/scholarships", 125, storage);
  assert.equal(getWorkspaceScrollPosition("/discovery", storage), 840);
  assert.equal(getWorkspaceScrollPosition("/scholarships", storage), 125);
  assert.equal(getWorkspaceScrollPosition("/settings", storage), 0);
});

test("workspace scroll positions reject invalid routes and invalid offsets", () => {
  const storage = memoryStorage();
  saveWorkspaceScrollPosition("/discovery", -10, storage);
  saveWorkspaceScrollPosition("https://example.org", 200, storage);
  assert.equal(getWorkspaceScrollPosition("/discovery", storage), 0);
  assert.equal(getWorkspaceScrollPosition("https://example.org", storage), 0);
});

test("scholarship result cards link to page-specific URLs, never a bare sponsor homepage", () => {
  assert.match(cards, /getScholarshipSourcePageUrl\(item\.source_url\)/);
  assert.match(cards, /href=\{sourcePageUrl\}/);
  assert.match(cards, /A direct scholarship page URL was not returned/);
  assert.doesNotMatch(cards, /href=\{sanitizePublicHttpsUrl\(item\.source_url\)/);
});

test("workspace navigation saves and restores each tab's scroll position", () => {
  assert.match(app, /saveWorkspaceScrollPosition\(workspaceTabToPath\(previousTab\), window\.scrollY\)/);
  assert.match(app, /getWorkspaceScrollPosition\(path\)/);
  assert.match(app, /window\.addEventListener\("pagehide", persistScroll\)/);
  assert.match(app, /document\.addEventListener\("visibilitychange", persistWhenHidden\)/);
  assert.doesNotMatch(app, /setMobileNavOpen\(false\);\s*window\.scrollTo\(0, 0\);/);
});
