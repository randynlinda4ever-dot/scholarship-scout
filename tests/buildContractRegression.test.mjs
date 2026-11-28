import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [authRuntime, authTypes, acceptanceRuntime, acceptanceTypes, bootstrap] = await Promise.all([
  read("src/lib/authRedirect.js"),
  read("src/lib/authRedirect.d.ts"),
  read("src/legal/acceptance.js"),
  read("src/legal/acceptance.d.ts"),
  read("src/bootstrap.ts"),
]);

test("auth callback declaration exposes every runtime export", () => {
  assert.match(authRuntime, /export function hasPendingAuthCallback\(/);
  assert.match(authRuntime, /export function hasPendingAuthCallbackError\(/);
  assert.match(authTypes, /export function hasPendingAuthCallback\(/);
  assert.match(authTypes, /export function hasPendingAuthCallbackError\(/);
  assert.match(authTypes, /search\?: string/);
  assert.match(authTypes, /hash\?: string/);
});

test("legal acceptance declaration includes the runtime age and guardian options", () => {
  assert.match(acceptanceRuntime, /guardianConfirmed/);
  assert.match(acceptanceTypes, /ageGroup\?/);
  assert.match(acceptanceTypes, /guardianConfirmed\?/);
});

test("preflight event handlers invoke the assigned updateButton callback when users interact", () => {
  const assignment = bootstrap.indexOf("updateButton = () => {");
  const checkboxListener = bootstrap.indexOf('checkbox.addEventListener("change", () => updateButton());');
  const guardianListener = bootstrap.indexOf('guardianCheckbox.addEventListener("change", () => updateButton());');
  assert.ok(assignment >= 0);
  assert.ok(checkboxListener > assignment);
  assert.ok(guardianListener > assignment);
});
