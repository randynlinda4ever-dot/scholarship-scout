import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createServer } from "vite";
import { buildLiveDiscoveryPayload } from "../src/lib/liveDiscoveryProfile.js";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const appFile = ts.createSourceFile("src/App.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findDiscoveryCall(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "runLiveScholarshipDiscovery"
  ) return node;
  let found = null;
  ts.forEachChild(node, (child) => {
    found ??= findDiscoveryCall(child);
  });
  return found;
}

test("the app passes the complete in-memory profile into live discovery", () => {
  const call = findDiscoveryCall(appFile);
  assert.ok(call, "the live discovery action must call runLiveScholarshipDiscovery");
  assert.equal(call.arguments.length, 2);
  assert.ok(ts.isIdentifier(call.arguments[0]));
  assert.equal(call.arguments[0].text, "profile");
  assert.ok(ts.isIdentifier(call.arguments[1]));
  assert.equal(call.arguments[1].text, "selectedDiscoveryCategories");
});

test("live discovery sends only approved filters and ranks results with the full local profile", async (t) => {
  let capturedFunction;
  let capturedOptions;
  globalThis.__SCOUT_DISCOVERY_TEST_CLIENT__ = {
    functions: {
      invoke: async (functionName, options) => {
        capturedFunction = functionName;
        capturedOptions = options;
        return {
          data: {
            results: [{
              id: "synthetic-anthropology-award",
              title: "Central Texas Anthropology Scholarship",
              source_url: "https://example.org/awards/anthropology",
              excerpt: "The Central Texas Anthropology Scholarship supports graduating Texas high school seniors interested in anthropology.",
              evidence_excerpt: "The Central Texas Anthropology Scholarship supports graduating Texas high school seniors interested in anthropology.",
              discovery_category: "local",
            }],
            summary: {
              requestedQueries: 1,
              successfulQueries: 1,
              failedQueries: 0,
              pagesChecked: 1,
              rawResultCount: 1,
            },
            warnings: [],
          },
          error: null,
        };
      },
    },
  };

  const mockId = "\0scholarship-scout-test-supabase-client";
  const vite = await createServer({
    configFile: "./vite.config.ts",
    server: { middlewareMode: true },
    appType: "custom",
    plugins: [{
      name: "discovery-flow-supabase-client-test-double",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./supabaseClient" &&
          importer?.replace(/\\/g, "/").endsWith("/src/lib/scholarshipApi.ts")
        ) return mockId;
        return null;
      },
      load(id) {
        if (id === mockId) {
          return "export async function getSupabaseClient() { return globalThis.__SCOUT_DISCOVERY_TEST_CLIENT__; }";
        }
        return null;
      },
    }],
  });

  t.after(async () => {
    await vite.close();
    delete globalThis.__SCOUT_DISCOVERY_TEST_CLIENT__;
  });

  const api = await vite.ssrLoadModule("/src/lib/scholarshipApi.ts");
  const profile = {
    state: "Texas",
    graduationYear: "2027",
    county: "Example County",
    grade: "12th grade",
    plannedMajor: "anthropology",
    interests: "community service",
    gpa: "PRIVATE-GPA-SENTINEL",
    classRank: "PRIVATE-RANK-SENTINEL",
    school: "PRIVATE-SCHOOL-SENTINEL",
    email: "PRIVATE-EMAIL-SENTINEL",
    phone: "PRIVATE-PHONE-SENTINEL",
    resume: "PRIVATE-RESUME-SENTINEL",
    familyIncome: "PRIVATE-INCOME-SENTINEL",
  };
  const selectedDiscoveryCategories = ["local", "humanities"];

  const discovery = await api.runLiveScholarshipDiscovery(profile, selectedDiscoveryCategories);

  assert.equal(capturedFunction, "scholarship-discover");
  assert.ok(capturedOptions);
  assert.deepEqual(JSON.parse(JSON.stringify(capturedOptions.body)), {
    state: "Texas",
    graduationYear: "2027",
    categories: ["local", "humanities"],
  });
  assert.deepEqual(Object.keys(capturedOptions.body).sort(), ["categories", "graduationYear", "state"]);
  assert.deepEqual(capturedOptions.body.categories, selectedDiscoveryCategories);

  const serializedRequest = JSON.stringify(capturedOptions.body);
  for (const sentinel of [
    "PRIVATE-GPA-SENTINEL",
    "PRIVATE-RANK-SENTINEL",
    "PRIVATE-SCHOOL-SENTINEL",
    "PRIVATE-EMAIL-SENTINEL",
    "PRIVATE-PHONE-SENTINEL",
    "PRIVATE-RESUME-SENTINEL",
    "PRIVATE-INCOME-SENTINEL",
    "Example County",
    "anthropology",
    "community service",
  ]) {
    assert.equal(serializedRequest.includes(sentinel), false, sentinel);
  }

  assert.equal(discovery.results.length, 1);
  assert.ok(
    discovery.results[0].relevance_reasons.includes("Matches your interests: anthropology"),
    "the browser-side ranking result must reflect the profile's private planned-major field",
  );
  assert.equal(discovery.results[0].relevance_score > 0, true);
});

test("the real payload builder rejects malformed profiles and invalid category selections", () => {
  const validCategories = ["local"];

  for (const malformedProfile of [null, [], "Texas", { state: "Texas", graduationYear: "202" }]) {
    assert.throws(
      () => buildLiveDiscoveryPayload(malformedProfile, validCategories),
      /profile|required|state|graduation year/i,
    );
  }

  for (const categories of [[], ["unsupported-category"], ["local", "local"], Array(15).fill("local")]) {
    assert.throws(
      () => buildLiveDiscoveryPayload({ state: "Texas", graduationYear: "2027" }, categories),
      /supported|duplicated/i,
    );
  }
});

test("the discovery loading message distinguishes local profile matching from transmitted fields", () => {
  assert.ok(
    appSource.includes(
      "Only your state, graduation year, and category choices are sent to the search service; additional profile details stay on this device for matching.",
    ),
  );
});
