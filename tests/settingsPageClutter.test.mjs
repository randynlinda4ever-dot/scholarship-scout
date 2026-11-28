import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const settings = app.slice(app.indexOf("{tab === 'Settings'"), app.indexOf("{tab === 'Discovery'"));

test("settings does not repeat sign-in or account-creation controls", () => {
  assert.doesNotMatch(settings, /className="cloud-steps"|settings-auth-form|id="cloud-email"/);
  assert.equal((settings.match(/>Check session status<\/button>/g) || []).length, 1);
});

test("settings retains local vault, account management, privacy, and deletion controls", () => {
  assert.match(settings, /Your profile, tracker, application drafts, Resources worksheets/);
  assert.match(settings, /Connected account/);
  assert.match(settings, /Sign out/);
  assert.match(settings, /Forget this device/);
  assert.match(settings, /Privacy request/);
  assert.match(settings, /Delete account and data/);
});
