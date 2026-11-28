import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

globalThis.crypto ??= webcrypto;
globalThis.__SCOUT_TEST_SCHOLARSHIP_API__ = true;
globalThis.window = { location: { origin: "https://scout.example.test", pathname: "/workspace", search: "?ignored=1", hash: "#ignored" } };

let client;
let queryResponses = [];
let authResults = {};
let invokeResult = { data: { success: true }, error: null };

class Query {
  constructor(table) {
    this.table = table;
    this.operation = "select";
  }
  select(value) { this.fields = value; return this; }
  insert(value) { this.operation = "insert"; this.payload = value; return this; }
  update(value) { this.operation = "update"; this.payload = value; return this; }
  delete() { this.operation = "delete"; return this; }
  upsert(value, options) { this.operation = "upsert"; this.payload = value; this.options = options; return this; }
  eq(key, value) { (this.filters ??= []).push(["eq", key, value]); return this; }
  not(key, operator, value) { (this.filters ??= []).push(["not", key, operator, value]); return this; }
  order(key, options) { (this.orders ??= []).push([key, options]); return this; }
  range(from, to) { this.rangeValue = [from, to]; return this; }
  async maybeSingle() { return this.takeResponse(); }
  async single() { return this.takeResponse(); }
  takeResponse() { return queryResponses.length ? queryResponses.shift() : { data: null, error: null }; }
  then(resolve, reject) { return Promise.resolve(this.takeResponse()).then(resolve, reject); }
}

function makeClient() {
  const auth = {
    getUser: async (...args) => authResults.getUser ?? { data: { user: { id: "user-1", is_anonymous: false } }, error: null },
    signInWithOtp: async (...args) => authResults.signInWithOtp ?? { error: null },
    signInWithOAuth: async (...args) => authResults.signInWithOAuth ?? { error: null },
    linkIdentity: async (...args) => authResults.linkIdentity ?? { error: null },
    signOut: async (...args) => authResults.signOut ?? { error: null },
  };
  return {
    auth,
    functions: { invoke: async (...args) => invokeResult },
    from(table) { return new Query(table); },
  };
}
function setClient(value = makeClient()) { client = value; globalThis.__SCOUT_DISCOVERY_TEST_CLIENT__ = value; }
function setResponses(...responses) { queryResponses = responses; }
const cloudRow = {
  id: "row-1", title: "Synthetic Award", sponsor: "Example Foundation",
  official_url: "https://example.org/award", deadline: "2027-04-01",
  eligibility: {}, evidence: [], verification_status: "unverified",
  created_at: "2026-01-01T00:00:00.000Z",
};

setClient();
const api = await import("../src/lib/scholarshipApi.ts?scholarship-api-runtime-coverage");

test.after(() => {
  delete globalThis.__SCOUT_TEST_SCHOLARSHIP_API__;
  delete globalThis.__SCOUT_DISCOVERY_TEST_CLIENT__;
  delete globalThis.__SCOUT_TEST_ROOT_CAPTURE__;
  delete globalThis.window;
});

test("magic-link and OAuth methods use same-origin callback and propagate provider errors", async () => {
  setClient();
  await api.sendMagicLink("student@example.test");
  assert.equal(authResults.signInWithOtp, undefined);
  assert.throws(() => api.getMagicLinkRedirectUrl?.(), /not a function/);
  authResults.signInWithOtp = { error: new Error("otp failed") };
  await assert.rejects(api.sendMagicLink("student@example.test"), /otp failed/);
  authResults.signInWithOtp = undefined;
  await api.signInWithGoogle();
  authResults.signInWithOAuth = { error: new Error("oauth failed") };
  await assert.rejects(api.signInWithGoogle(), /oauth failed/);
  authResults.signInWithOAuth = undefined;
});

test("Google identity linking requires an active anonymous session", async () => {
  setClient();
  authResults.getUser = { data: { user: { id: "user-1", is_anonymous: false } }, error: null };
  await assert.rejects(api.linkGoogleIdentity(), /active anonymous cloud session/);
  authResults.getUser = { data: { user: { id: "user-1", is_anonymous: true } }, error: null };
  await api.linkGoogleIdentity();
  authResults.linkIdentity = { error: new Error("link failed") };
  await assert.rejects(api.linkGoogleIdentity(), /link failed/);
  authResults = {};
});

test("cloud user and sign-out methods handle absent clients and auth failures", async () => {
  setClient(null);
  assert.equal(await api.getCloudUser(), null);
  await api.signOutCloudUser();
  setClient();
  authResults.getUser = { data: { user: null }, error: new Error("auth unavailable") };
  assert.equal(await api.getCloudUser(), null);
  authResults.getUser = { data: { user: { id: "user-1" } }, error: null };
  assert.equal((await api.getCloudUser()).id, "user-1");
  authResults.signOut = { error: new Error("sign-out failed") };
  await assert.rejects(api.signOutCloudUser(), /sign-out failed/);
  authResults = {};
});

test("vault backup reads validate metadata and reject anonymous accounts", async () => {
  setClient();
  authResults.getUser = { data: { user: { id: "anon", is_anonymous: true } }, error: null };
  await assert.rejects(api.getAccountVaultBackup(), /permanent signed-in account/);
  authResults.getUser = { data: { user: { id: "user-1", is_anonymous: false } }, error: null };
  setResponses({ data: null, error: null });
  assert.equal(await api.getAccountVaultBackup(), null);
  setResponses({ data: { credential_id: 3, prf_salt: "salt", encrypted_envelope: {}, revision: 1 }, error: null });
  await assert.rejects(api.getAccountVaultBackup(), /metadata is invalid/);
  const backup = { credential_id: "credential", prf_salt: "salt", encrypted_envelope: { cipher: "opaque" }, revision: 2, updated_at: "2026-01-01T00:00:00Z" };
  setResponses({ data: backup, error: null });
  assert.deepEqual(await api.getAccountVaultBackup(), backup);
  setResponses({ data: null, error: new Error("db error") });
  await assert.rejects(api.getAccountVaultBackup(), /could not be checked/);
});

test("vault backup create, revision update and delete enforce conflict handling", async () => {
  setClient();
  const input = { credentialId: "credential", prfSalt: "salt", encryptedEnvelope: { ciphertext: "opaque" } };
  const created = { credential_id: "credential", prf_salt: "salt", encrypted_envelope: input.encryptedEnvelope, revision: 1, updated_at: "2026-01-01T00:00:00Z" };
  setResponses({ data: created, error: null });
  assert.deepEqual(await api.createAccountVaultBackup(input), created);
  setResponses({ data: null, error: { code: "23505" } });
  await assert.rejects(api.createAccountVaultBackup(input), /single encrypted account vault already exists/);
  setResponses({ data: null, error: new Error("db error") });
  await assert.rejects(api.createAccountVaultBackup(input), /could not be created/);
  await assert.rejects(api.updateAccountVaultBackup({ encryptedEnvelope: {}, expectedRevision: 0 }), /revision is invalid/);
  setResponses({ data: { revision: 3 }, error: null });
  assert.equal(await api.updateAccountVaultBackup({ encryptedEnvelope: {}, expectedRevision: 2 }), 3);
  setResponses({ data: null, error: null });
  await assert.rejects(api.updateAccountVaultBackup({ encryptedEnvelope: {}, expectedRevision: 2 }), /newer vault backup already exists/);
  setResponses({ data: null, error: new Error("db error") });
  await assert.rejects(api.updateAccountVaultBackup({ encryptedEnvelope: {}, expectedRevision: 2 }), /could not be synchronized/);
  setResponses({ data: null, error: null });
  await api.deleteAccountVaultBackup();
  setResponses({ data: null, error: new Error("db error") });
  await assert.rejects(api.deleteAccountVaultBackup(), /could not be deleted/);
});

test("account deletion requires success and clears the local auth session best-effort", async () => {
  setClient();
  invokeResult = { data: { success: false }, error: null };
  await assert.rejects(api.deleteCloudAccount(), /could not be deleted/);
  invokeResult = { data: { success: true }, error: null };
  authResults.signOut = { error: new Error("local signout failed") };
  await api.deleteCloudAccount();
  invokeResult = { data: null, error: new Error("invoke failed") };
  await assert.rejects(api.deleteCloudAccount(), /could not be deleted/);
  authResults = {};
});

test("cloud scholarship listing paginates and maps records; query errors are normalized", async () => {
  setClient();
  setResponses({ data: [cloudRow], error: null });
  const rows = await api.listCloudScholarships();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Synthetic Award");
  const page = Array.from({ length: 500 }, (_, index) => ({ ...cloudRow, id: "row-" + index }));
  setResponses({ data: page, error: null }, { data: [cloudRow], error: null });
  assert.equal((await api.listCloudScholarships()).length, 501);
  setResponses({ data: null, error: new Error("db error") });
  await assert.rejects(api.listCloudScholarships(), /could not be loaded/);
  authResults.getUser = { data: { user: null }, error: new Error("no session") };
  await assert.rejects(api.listCloudScholarships(), /Sign in before saving/);
  authResults = {};
});

test("cloud scholarship save paginates candidates, preserves identity and normalizes errors", async () => {
  setClient();
  const item = { name: "Synthetic Award", provider: "Example Foundation", sourceUrl: "https://example.org/award", deadline: "2027-04-01", award: "$1,000" };
  setResponses({ data: [], error: null }, { data: cloudRow, error: null });
  const saved = await api.saveCloudScholarship(item);
  assert.equal(saved.title, "Synthetic Award");
  setResponses({ data: [], error: null }, { data: null, error: new Error("upsert failed") });
  await assert.rejects(api.saveCloudScholarship(item), /could not be saved/);
  setResponses({ data: null, error: new Error("candidate lookup failed") });
  await assert.rejects(api.saveCloudScholarship(item), /existing cloud scholarship record/);
  authResults = {};
});

test("discovery validates payload, ranks local results, and preserves bounded summaries", async () => {
  setClient();
  const result = {
    id: "lead-1", title: "Texas Anthropology Scholarship", source_url: "https://example.org/anthropology",
    excerpt: "Texas Anthropology Scholarship for graduating seniors.", evidence_excerpt: "Texas Anthropology Scholarship for graduating seniors.",
    discovery_category: "local",
  };
  invokeResult = { error: null, data: { results: [result], summary: { requestedQueries: 1, successfulQueries: 1, failedQueries: 0, pagesChecked: 2, rawResultCount: 4, potentialQueries: 3, queriesAvoided: 1, retryAttempts: 2, cacheHit: true, cacheAgeMs: 100 }, warnings: ["provider warning", 42, "second warning"] } };
  const run = await api.runLiveScholarshipDiscovery({ state: "Texas", graduationYear: "2027", gpa: "4.0", essay: "private" }, ["local"]);
  assert.equal(run.results.length, 1);
  assert.equal(run.summary.uniqueResults, 1);
  assert.equal(run.summary.cacheHit, true);
  assert.deepEqual(run.warnings, ["provider warning", "second warning"]);
  invokeResult = { error: null, data: { results: [], summary: {}, warnings: [] } };
  const empty = await api.runLiveScholarshipDiscovery({ state: "Texas", graduationYear: "2027" }, ["local"]);
  assert.equal(empty.summary.requestedQueries, 0);
  assert.equal(empty.summary.rawResultCount, 0);
  invokeResult = { error: null, data: { results: "invalid" } };
  await assert.rejects(api.runLiveScholarshipDiscovery({ state: "Texas", graduationYear: "2027" }, ["local"]), /invalid response/);
  invokeResult = { error: { context: new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { "Retry-After": "30" } }) } };
  await assert.rejects(api.runLiveScholarshipDiscovery({ state: "Texas", graduationYear: "2027" }, ["local"]), (error) => error.status === 429 && error.retryAfter === "30" && /Rate limited/.test(error.message));
  invokeResult = { error: new Error("network down") };
  await assert.rejects(api.runLiveScholarshipDiscovery({ state: "Texas", graduationYear: "2027" }, ["local"]), /Check the connection/);
  invokeResult = { error: null, data: { results: [], summary: null, warnings: [] } };
  await assert.rejects(api.runLiveScholarshipDiscovery({ state: "", graduationYear: "2027" }, ["local"]), /valid state/);
});

test("sponsor verification remains explicitly unavailable until deployed", async () => {
  await assert.rejects(api.verifyLiveScholarship("synthetic-id"), /not deployed/);
});
