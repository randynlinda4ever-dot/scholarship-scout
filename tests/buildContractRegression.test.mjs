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

test("preflight event handlers only reference an initialized updateButton binding", () => {
  const declaration = bootstrap.indexOf("let updateButton");
  const firstListener = bootstrap.indexOf("guardianCheckbox.addEventListener(\"change\", updateButton)");
  const assignment = bootstrap.indexOf("updateButton = () =>");
  assert.notEqual(declaration, -1);
  assert.ok(declaration < firstListener);
  assert.ok(firstListener < assignment);
});
