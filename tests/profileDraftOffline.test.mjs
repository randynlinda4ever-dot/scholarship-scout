import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;

const { createLocalVault, flushLocalVault, lockLocalVault, unlockLocalVault, vaultStorage } =
  await import("../src/lib/localVault.js");
const { writeJsonStorage } = await import("../src/lib/browserStorage.js");

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function memoryBackend() {
  let value = null;
  return {
    async get() { return value ? structuredClone(value) : null; },
    async set(next) { value = structuredClone(next); },
  };
}

function memoryLockManager() {
  let held = false;
  return {
    async request(_name, options, callback) {
      if (held && options.ifAvailable) return callback(null);
      held = true;
      try { return await callback({ name: "test-lock" }); }
      finally { held = false; }
    },
  };
}

test("profile drafts save and restore locally without a cloud login", async () => {
  const storage = memoryStorage();
  const backend = memoryBackend();
  const lockManager = memoryLockManager();
  const passphrase = "a memorable offline vault passphrase";
  const profileDraft = {
    state: "Texas",
    graduationYear: "2027",
    plannedMajor: "Anthropology",
    activities: "Student activities and community service",
  };

  // No Supabase client, user, or sign-in is created in this test.
  await createLocalVault(passphrase, { storage, backend, lockManager });
  assert.equal(writeJsonStorage("scout-profile-draft", profileDraft), true);
  await flushLocalVault();
  await lockLocalVault();

  await unlockLocalVault(passphrase, { storage, backend, lockManager });
  assert.deepEqual(JSON.parse(vaultStorage.getItem("scout-profile-draft")), profileDraft);
  await lockLocalVault();
});

test("the profile editor autosaves drafts locally before validation and independently of cloud auth", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const start = app.indexOf("  useEffect(() => {\n    const generation = ++profileSaveGenerationRef.current;");
  const end = app.indexOf("  }, [profileDraft]);", start);
  assert.ok(start >= 0 && end > start, "profile draft autosave effect should exist");
  const effect = app.slice(start, end);

  assert.ok(effect.includes("await flushLocalVault()"), "the UI must wait for encrypted persistence before reporting success");
  assert.ok(
    /setAlert\(\(currentAlert\) =>\s*currentAlert === PROFILE_DRAFT_SAVE_ERROR \|\| currentAlert === PROFILE_SAVE_ERROR/.test(effect),
    "a successful save must clear stale profile-save alerts",
  );

  assert.ok(
    effect.indexOf("saveJson('scout-profile-draft', profileDraft)") <
      effect.indexOf("validateProfileChanges("),
    "draft must be persisted before full-profile validation",
  );
  assert.doesNotMatch(effect, /cloudUser|getSupabaseClient|saveCloudScholarship|requireUser/);

  const saveProfileStart = app.indexOf("  const saveProfile = (next: Profile) => {");
  const saveProfileEnd = app.indexOf("\n  };", saveProfileStart);
  assert.ok(saveProfileStart >= 0 && saveProfileEnd > saveProfileStart);
  assert.match(app.slice(saveProfileStart, saveProfileEnd), /setProfileDraft\(next\)/);
  assert.doesNotMatch(app.slice(saveProfileStart, saveProfileEnd), /cloudUser|getSupabaseClient|saveCloudScholarship/);

  assert.match(app, /Profile changes saved in this browser’s encrypted vault\. No account sign-in is required/);
  assert.match(app, /Your unfinished profile is saved as a draft in this browser’s encrypted vault/);
  assert.match(app, /Sign-in is only needed for optional cloud scholarship records/);
});
