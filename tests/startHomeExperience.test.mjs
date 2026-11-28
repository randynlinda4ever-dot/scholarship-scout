import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Start/Home explains the current product, privacy model, and account paths", async () => {
  const page = await read("src/features/home/StartHomePage.tsx");
  for (const phrase of [
    "Discover scholarships",
    "Stay organized",
    "Use practical resources",
    "encrypted in this browser",
    "state, expected graduation year, and selected category IDs",
    "local vault passphrase",
    "Create your account",
    "Continue with Google",
    "Continue without an account",
    "Guest mode stores work only in this browser",
  ]) assert.ok(page.toLowerCase().includes(phrase.toLowerCase()), "missing Start/Home content: " + phrase);
  assert.ok(page.includes("onEmailSubmit"));
  assert.ok(page.includes("onGoogleSignIn"));
  assert.ok(page.includes("onContinueGuest"));
  assert.ok(page.includes("onReviewLegal"));
});

test("unauthenticated visitors are gated; explicit guest mode is a separate opt-in", async () => {
  const [app, bootstrap] = await Promise.all([
    read("src/App.tsx"), read("src/bootstrap.ts"),
  ]);
  assert.match(app, /const \[cloudAuthReady, setCloudAuthReady\] = useState\(false\)/);
  assert.ok(app.includes("if (!cloudAuthReady || (!cloudUser && !guestMode) || cloudUser?.is_anonymous)"));
  assert.ok(app.includes("<StartHomePage"));
  assert.ok(app.includes("setCloudAuthReady(true)"));
  assert.ok(bootstrap.includes("onContinueGuest"));
  assert.ok(bootstrap.includes("startGuestWorkspace"));
  assert.ok(bootstrap.includes("allowDeviceUnlock: !guestMode"));
});

test("sign-in controls are not buried in Settings", async () => {
  const app = await read("src/App.tsx");
  assert.ok(!app.includes("settings-auth-form"));
  assert.ok(!app.includes("Optional cloud account and access"));
  assert.ok(app.includes("Connected account"));
  assert.ok(app.includes("<StartHomePage"));
});

test("vault passphrases can be shown and automatic unlock is bound to the account id", async () => {
  const gate = await read("src/lib/localVaultGate.js");
  assert.match(gate, /passVisibility\.addEventListener\("click"/);
  assert.match(gate, /confirmVisibility\.addEventListener\("click"/);
  assert.match(gate, /passInput\.type = visible \? "text" : "password"/);
  assert.match(gate, /confirmInput\.type = visible \? "text" : "password"/);
  assert.match(gate, /await hasDeviceUnlock\(\{ ownerId \}\)/);
  assert.match(gate, /await unlockLocalVaultWithDeviceKey\(\{ ownerId \}\)/);
  assert.match(gate, /keep the manual recovery screen available/);
});

test("guest mode always uses the passphrase and warns that browser-only work may not persist", async () => {
  const [gate, app] = await Promise.all([
    read("src/lib/localVaultGate.js"), read("src/App.tsx"),
  ]);
  assert.match(gate, /allowDeviceUnlock = true/);
  assert.match(gate, /allowDeviceUnlock && !requiresPassphraseThisSession/);
  assert.match(gate, /guestMode/);
  assert.match(gate, /Guest mode does not sync or provide account recovery/);
  assert.match(app, /scholarship-scout-guest-session/);
  assert.match(app, /guestMode/);
});

test("remembered-device encryption preserves passphrase recovery and account isolation", async () => {
  const vault = await read("src/lib/localVault.js");
  assert.match(vault, /LOCAL_VAULT_VERSION = 2/);
  assert.match(vault, /LEGACY_LOCAL_VAULT_VERSION = 1/);
  assert.match(vault, /keyWrap/);
  assert.match(vault, /deviceKeyWrap/);
  assert.match(vault, /extractable === false/);
  assert.match(vault, /ownerId && unlocked\.ownerId && unlocked\.ownerId !== ownerId/);
  assert.match(vault, /if \(!ownerId && unlocked\.ownerId\)/);
  assert.match(vault, /export async function enableLocalVaultDeviceUnlock/);
  assert.match(vault, /export async function forgetLocalVaultDeviceUnlock/);
  assert.match(vault, /additionalData\(LEGACY_LOCAL_VAULT_VERSION\)/);
  assert.match(vault, /clearTransientKeyMaterial/);
});
