import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../src/lib/scholarshipApi.ts", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/_shared/scholarship-discovery.mjs", import.meta.url), "utf8");
const entrypoint = await readFile(new URL("../supabase/functions/scholarship-discover/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("live discovery does not create or require a Supabase user", () => {
  const start = api.indexOf("export async function runLiveScholarshipDiscovery(");
  const end = api.indexOf("export async function verifyLiveScholarship(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const implementation = api.slice(start, end);
  assert.ok(implementation.includes("const client = await requireClient();"));
  assert.ok(!implementation.includes("requireUser("));
  assert.ok(!implementation.includes("ensureCloudUser("));
});

test("the Cloud Search button does not force an anonymous login before searching", () => {
  const start = app.indexOf("const handleCloudSearch = async");
  const end = app.indexOf("const handleCloudSave", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(!app.slice(start, end).includes("ensureCloudUser("));
});

test("live search results and summaries render whether or not a cloud user is connected", () => {
  const start = app.indexOf("{tab === 'Cloud Search'");
  const end = app.indexOf("{tab === 'Scholarships'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const cloudSearchPage = app.slice(start, end);
  assert.ok(cloudSearchPage.includes("{exaResults.length>0 &&"));
  assert.ok(cloudSearchPage.includes("{discoverySummary &&"));
  assert.ok(cloudSearchPage.includes("Public search — no account required"));
});

test("the deployed discovery function is public but applies request throttling", () => {
  assert.ok(entrypoint.includes("createScholarshipDiscoveryHandler"));
  assert.ok(!edge.includes('withSupabase({ auth: "user" }'));
  assert.ok(edge.includes("rateLimiter(req)"));
  assert.ok(config.includes("[functions.scholarship-discover]"));
  assert.ok(config.includes("verify_jwt = false"));
});

test("public discovery bounds JSON payload size and keeps gateway credentials server-side", () => {
  assert.ok(edge.includes("MAX_CATEGORIES"));
  assert.ok(edge.includes("MAX_BODY_BYTES"));
  assert.ok(edge.includes("SEARXNG_GATEWAY_TOKEN"));
  assert.ok(edge.includes('Bearer ${gatewayToken}'));
  assert.ok(!edge.includes("VITE_SUPABASE"));
  assert.ok(!edge.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
