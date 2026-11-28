import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const app = await read("src/App.tsx");
const cards = await read("src/components/ScholarshipCards.tsx");
const statusPills = await read("src/components/StatusPills.tsx");
const evidence = await read("src/lib/evidence.js");
const api = await read("src/lib/scholarshipApi.ts");
const liveProfile = await read("src/lib/liveDiscoveryProfile.js");
const discovery = await read("src/lib/discovery.js");
const pipeline = await read("src/lib/discoveryPipeline.js");
const cloudMapping = await read("src/lib/cloudMapping.js");
const monitor = await read("src/lib/reliabilityMonitor.js");
const clientIdentity = await read("src/lib/discoveryClientIdentity.js");

test("public discovery sends only broad state and graduation-year filters", () => {
  assert.match(api, /buildLiveDiscoveryPayload\(profile, categories\)/);
  assert.match(liveProfile, /return \{[\s\S]*?state:[\s\S]*?graduationYear:/);
  const projectedFields = liveProfile.match(/return \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.match(projectedFields, /state:/);
  assert.match(projectedFields, /graduationYear:/);
  assert.doesNotMatch(projectedFields, /\b(?:school|gpa|classRank|email|activities|citizenship)\s*:/i);
  assert.match(api, /buildLiveDiscoveryPayload\(profile, categories\)/);
  assert.match(api, /body: payload/);
  assert.doesNotMatch(api, /body:\s*\{\s*profile\s*:/);
  assert.match(api, /headers: \{ "x-scout-client-id": clientId \}/);
  assert.doesNotMatch(api, /body: \{[^}]*profile\s*,/);
  assert.doesNotMatch(api, /body: \{[^}]*clientId/);
  assert.match(clientIdentity, /globalThis\.sessionStorage/);
});

test("discovery and cloud URL paths sanitize public URLs before exposing or persisting them", () => {
  assert.match(discovery, /const sourceUrl = sanitizePublicHttpsUrl\(item\.url\)/);
  assert.match(pipeline, /const safeUrl = sanitizePublicHttpsUrl\(value\)/);
  assert.match(cloudMapping, /const officialUrl = sanitizePublicHttpsUrl\(sourceUrl\)/);
  assert.match(cloudMapping, /const safeSourceEvidenceUrl = sanitizePublicHttpsUrl\(sourceEvidenceUrl\)/);
  assert.match(app, /const safeDraftRecord = sanitizeScholarshipSourceUrls\(draftRecord\)/);
});

test("dynamic scholarship links use sanitized URLs, including legacy local records", () => {
  for (const expression of [
    "selected.sourceUrl",
    "selected.evidenceUrl",
    "selected.awardEvidenceUrl",
    "selected.discoverySourceUrl",
  ]) {
    assert.ok(app.includes(`sanitizePublicHttpsUrl(${expression}`), `missing URL sanitization for ${expression}`);
  }
  assert.match(app, /sanitizePublicHttpsUrl\(entry\?\.sourceUrl/);
  assert.match(statusPills, /sanitizePublicHttpsUrl\(item\.evidence\.sourceUrl\)/);
  assert.match(cards, /getScholarshipSourcePageUrl\(item\.source_evidence_url/);
  assert.match(cards, /getScholarshipSourcePageUrl\(item\.source_url\)/);
  assert.match(cards, /getScholarshipSourcePageUrl\(item\.sourceUrl\)/);
  assert.match(evidence, /const sanitized = sanitizePublicHttpsUrl\(value\)/);
  assert.doesNotMatch(app + cards, /href=\{(?:selected\.(?:sourceUrl|evidenceUrl|discoverySourceUrl)|item\.(?:source_url|sourceUrl|source_evidence_url))\}/);
});

test("client application source contains no console logging calls", () => {
  for (const [name, source] of Object.entries({ app, api, discovery, pipeline, cloudMapping, monitor })) {
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error|debug)\s*\(/, `${name} must not log client data`);
  }
});

test("global diagnostics ignore error payloads and retain only generic categories", () => {
  assert.match(monitor, /const onError = \(\) => record\("runtime_error"\)/);
  assert.match(monitor, /const onRejection = \(\) => record\("unhandled_rejection"\)/);
  assert.doesNotMatch(monitor, /event\.(?:message|stack|reason|filename)|error\.(?:message|stack)/);
});