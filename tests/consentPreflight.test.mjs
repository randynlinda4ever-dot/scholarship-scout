import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("the HTML entrypoint loads only the consent preflight, not the application", async () => {
  const html = await read("index.html");
  assert.match(html, /<script type="module" src="\/src\/bootstrap\.ts"><\/script>/);
  assert.doesNotMatch(html, /src="\/src\/main\.tsx"/);
  assert.match(html, /<link rel="stylesheet" href="\/analytics-consent\.css" \/>/);
  assert.match(html, /<script defer src="\/analytics-consent\.js"><\/script>/);
  assert.doesNotMatch(html, /googletagmanager\.com\/gtm\.js/);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
});

test("pre-consent bootstrap loads only legal and local-vault gates, not React or Supabase", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  const vaultGate = await read("src/lib/localVaultGate.js");
  assert.match(bootstrap, /from "\.\/legal\/acceptance\.js"/);
  assert.match(bootstrap, /from "\.\/legal\/terms"/);
  assert.match(bootstrap, /from "\.\/lib\/localVaultGate\.js"/);
  assert.doesNotMatch(bootstrap, /from "\.\/legal\/terms\.js"/);
  assert.doesNotMatch(bootstrap, /from ["'](?:react|react-dom)(?:\/[^"']*)?["']/);
  assert.doesNotMatch(bootstrap, /installReliabilityMonitoring|getSupabaseClient|createClient/);
  assert.match(vaultGate, /from "\.\/localVault\.js"/);
  assert.doesNotMatch(vaultGate, /from ["'](?:react|react-dom|@supabase\/supabase-js)/);
  assert.match(bootstrap, /if \(hasCurrentAcceptance\(\)\) \{\s*void startWorkspace\(\);\s*\} else \{\s*renderLegalGate\(\);\s*\}/);
});

test("the React workspace is dynamically imported only after consent and vault unlock", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(bootstrap, /await renderLocalVaultGate\(root, async \(\) => \{/);
  assert.match(bootstrap, /await import\("\.\/main"\)/);
  assert.ok(
    bootstrap.indexOf("await renderLocalVaultGate") < bootstrap.indexOf('await import("./main")'),
    "the vault gate must wrap the React workspace import",
  );
  assert.match(bootstrap, /window\.localStorage\.setItem\(LEGAL_ACCEPTANCE_STORAGE_KEY, receipt\)/);
  assert.match(bootstrap, /isCurrentLegalAcceptance\(window\.localStorage\.getItem\(LEGAL_ACCEPTANCE_STORAGE_KEY\)\)/);
  assert.match(bootstrap, /if \(!checkbox\.checked \|\| !readToEnd \|\| !ageAllowed \|\| workspaceStarting\) return/);
  assert.match(bootstrap, /acceptButton\.disabled = !checkbox\.checked \|\| !readToEnd/);
});

test("the legal preflight renders the complete notice before enabling explicit acceptance", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(bootstrap, /for \(const section of LEGAL_SECTIONS\)/);
  assert.match(bootstrap, /section\.paragraphs/);
  assert.match(bootstrap, /section\.bullets/);
  assert.match(bootstrap, /checkbox\.checked = false/);
  assert.match(bootstrap, /aria-modal", "true"/);
  assert.match(bootstrap, /aria-labelledby", "legal-preflight-title"/);
  assert.match(bootstrap, /documentRegion\.addEventListener\("scroll"/);
  assert.match(bootstrap, /documentRegion\.focus\(\)/);
});
