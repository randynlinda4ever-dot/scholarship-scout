import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("agent demo is a separate HTML entry and does not use the real app bootstrap", async () => {
  const html = await read("agent-demo.html");
  assert.match(html, /src="\/src\/agentDemo\.tsx"/);
  assert.doesNotMatch(html, /src="\/src\/bootstrap\.ts"/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /noindex, nofollow, noarchive/);
});

test("agent demo build is enabled only for Vercel preview deployments", async () => {
  const config = await read("vite.config.ts");
  assert.match(config, /VERCEL_/);
  assert.match(config, /env\.VERCEL_ENV\s*===\s*['"]preview['"]/);
  assert.doesNotMatch(config, /mode\s*===\s*['"]development['"]/);
  assert.match(config, /__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__/);
});

test("production Vite builds omit the demo HTML entry", async () => {
  const config = await read("vite.config.ts");
  assert.match(config, /rollupOptions/);
  assert.match(config, /agent-demo\.html/);
  assert.match(config, /previewDemoEnabled/);
});

test("agent demo entrypoint does not import the legal gate, real workspace, vault, or Supabase", async () => {
  const entry = await read("src/agentDemo.tsx");
  const component = await read("src/features/agent-demo/AgentDemo.tsx");
  const combined = entry + component;
  assert.match(entry, /__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__/);
  assert.doesNotMatch(combined, /from ['"][^'"]*(?:\.\/App|localVault|supabaseClient|scholarshipApi|LegalAcceptanceGate|legal\/acceptance)[^'"]*['"]/i);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|fetch\s*\(|createClient\s*\(/);
  assert.match(component, /Synthetic test content/);
  assert.match(component, /not real scholarship listings/i);
});

test("legal preflight exposes a preview-only demo entry without recording acceptance", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(bootstrap, /__SCHOLARSHIP_SCOUT_PREVIEW_DEMO_ENABLED__/);
  assert.match(bootstrap, /\/agent-demo/);
  assert.match(bootstrap, /Open synthetic agent test demo/);
  assert.doesNotMatch(bootstrap, /createLegalAcceptanceRecord\([^)]*agent/i);
});

test("the actual app's legal acceptance check remains the only path into its workspace", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  const main = await read("src/main.tsx");
  assert.match(bootstrap, /if \(hasCurrentAcceptance\(\)\) \{\s*void startWorkspace\(\);\s*\} else \{\s*renderLegalGate\(\);\s*\}/);
  assert.match(bootstrap, /await renderEmailAuthGate\(root, async \(user\) => \{/);
  assert.match(bootstrap, /await renderAuthenticatedVaultGate\(/);
  assert.match(bootstrap, /await import\("\.\/main"\)/);
  assert.match(main, /<LegalAcceptanceGate>/);
});

test("Vercel routes the demo separately and falls back only for app paths", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const rewrites = config.rewrites;
  const demoIndex = rewrites.findIndex((route) => route.source === "/agent-demo");
  const appFallback = rewrites.findIndex((route) => route.destination === "/index.html");
  assert.ok(demoIndex >= 0 && demoIndex < appFallback);
  assert.equal(rewrites[demoIndex].destination, "/agent-demo.html");
  const fallback = rewrites[appFallback];
  assert.match(fallback.source, /\(\?!/);
  assert.match(fallback.source, /api/);
  assert.match(fallback.source, /assets/);
});
