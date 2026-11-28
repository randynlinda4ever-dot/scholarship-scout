import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../src/lib/scholarshipApi.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../src/bootstrap.ts", import.meta.url), "utf8");
const emailGate = await readFile(new URL("../src/lib/emailAuthGate.js", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/_shared/scholarship-discovery.mjs", import.meta.url), "utf8");
const entrypoint = await readFile(new URL("../supabase/functions/scholarship-discover/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("the discovery data service stays independent of account records", () => {
  const start = api.indexOf("export async function runLiveScholarshipDiscovery(");
  const end = api.indexOf("export async function verifyLiveScholarship(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const implementation = api.slice(start, end);
  assert.ok(implementation.includes("const client = await requireClient();"));
  assert.ok(!implementation.includes("requireUser("));
  assert.ok(!implementation.includes("ensureCloudUser("));
});

test("the real app requires verified email authentication before mounting the workspace", () => {
  assert.match(bootstrap, /renderEmailAuthGate/);
  assert.match(bootstrap, /renderAuthenticatedVaultGate/);
  assert.match(emailGate, /getUser\(\)/);
  assert.match(emailGate, /email_confirmed_at/);
  assert.match(app, /disabled={!cloudUser \|\|/);
});

test("live search results render only inside the authenticated workspace", () => {
  const start = app.indexOf("{tab === 'Cloud Search'");
  const end = app.indexOf("{tab === 'Scholarships'", start);
  const cloudSearchPage = app.slice(start, end);
  assert.ok(cloudSearchPage.includes("{exaResults.length>0 &&"));
  assert.ok(cloudSearchPage.includes("{discoverySummary &&"));
  assert.ok(cloudSearchPage.includes("Your email account is required to use Scholarship Scout."));
});

test("the deployed discovery function exposes only a throttled, non-account data endpoint", () => {
  assert.ok(entrypoint.includes("createScholarshipDiscoveryHandler"));
  assert.ok(!edge.includes('withSupabase({ auth: "user" }'));
  assert.ok(edge.includes("rateLimiter(req)"));
  assert.ok(config.includes("[functions.scholarship-discover]"));
  assert.ok(config.includes("verify_jwt = false"));
});

test("public discovery bounds JSON payload size, category count, and keeps gateway credentials server-side", () => {
  assert.ok(edge.includes("MAX_CATEGORIES = 14"));
  assert.ok(edge.includes("MAX_BODY_BYTES"));
  assert.ok(edge.includes("MAX_SEARCH_REQUESTS = 24"));
  assert.ok(edge.includes("SEARXNG_GATEWAY_TOKEN"));
  assert.ok(!edge.includes("VITE_SUPABASE"));
  assert.ok(!edge.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
