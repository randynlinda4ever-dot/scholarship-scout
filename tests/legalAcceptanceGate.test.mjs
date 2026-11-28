import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LEGAL_ACCEPTANCE_STORAGE_KEY,
  LEGAL_ACCEPTANCE_VERSION,
  createLegalAcceptanceRecord,
  isCurrentLegalAcceptance,
} from "../src/legal/acceptance.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("only an affirmative acceptance for the current legal version opens the workspace", () => {
  const current = createLegalAcceptanceRecord("2026-11-26T12:00:00.000Z", { ageGroup: "adult" });
  const parentAuthorized = createLegalAcceptanceRecord("2026-11-26T12:00:00.000Z", { ageGroup: "minor", guardianConfirmed: true });
  assert.equal(isCurrentLegalAcceptance(current), true);
  assert.equal(isCurrentLegalAcceptance(parentAuthorized), true);
  assert.throws(() => createLegalAcceptanceRecord("2026-11-26T12:00:00.000Z", { ageGroup: "minor", guardianConfirmed: false }));
  assert.throws(() => createLegalAcceptanceRecord("2026-11-26T12:00:00.000Z", { ageGroup: "under13" }));
  assert.equal(isCurrentLegalAcceptance(null), false);
  assert.equal(isCurrentLegalAcceptance(""), false);
  assert.equal(isCurrentLegalAcceptance("{broken"), false);
  assert.equal(isCurrentLegalAcceptance(JSON.stringify({
    accepted: false,
    version: LEGAL_ACCEPTANCE_VERSION,
    acceptedAt: "2026-11-26T12:00:00.000Z",
  })), false);
});

test("a stale legal version or malformed timestamp requires acceptance again", () => {
  assert.equal(isCurrentLegalAcceptance(JSON.stringify({
    accepted: true,
    version: "older-version",
    acceptedAt: "2026-11-26T12:00:00.000Z",
  })), false);
  assert.equal(isCurrentLegalAcceptance(JSON.stringify({
    accepted: true,
    version: LEGAL_ACCEPTANCE_VERSION,
    acceptedAt: "not-a-date",
  })), false);
  assert.equal(isCurrentLegalAcceptance(JSON.stringify({
    accepted: true,
    version: LEGAL_ACCEPTANCE_VERSION,
  })), false);
});

test("acceptance receipt is versioned and contains no student identity or profile data", () => {
  const record = JSON.parse(createLegalAcceptanceRecord("2026-11-26T12:00:00.000Z"));
  assert.equal(record.accepted, true);
  assert.equal(record.version, LEGAL_ACCEPTANCE_VERSION);
  assert.equal(record.acceptedAt, "2026-11-26T12:00:00.000Z");
  assert.deepEqual(Object.keys(record).sort(), ["accepted", "acceptedAt", "ageGroup", "guardianConfirmed", "version"]);
  assert.equal(record.ageGroup, "adult");
  assert.equal(record.guardianConfirmed, false);
  assert.ok(LEGAL_ACCEPTANCE_STORAGE_KEY);
});

test("the gate keeps all workspace code unloaded until an unchecked agreement is accepted", async () => {
  const gate = await read("src/components/LegalAcceptanceGate.tsx");
  const entry = await read("src/main.tsx");
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(gate, /from "\.\.\/legal\/terms"/);
  assert.doesNotMatch(gate, /from "\.\.\/legal\/terms\.js"/);
  assert.match(bootstrap, /from "\.\/legal\/terms"/);
  assert.doesNotMatch(bootstrap, /from "\.\/legal\/terms\.js"/);
  const app = await read("src/App.tsx");
  const appStyles = await read("src/App.css");
  const gateStyles = await read("src/components/LegalAcceptanceGate.css");

  assert.match(gate, /useState\(false\)/);
  assert.match(gate, /Parent or guardian authorization/);
  const bootstrapAgeGate = await read("src/bootstrap.ts");
  assert.match(bootstrapAgeGate, /legal-preflight-guardian/);
  assert.match(bootstrapAgeGate, /createLegalAcceptanceRecord\(new Date\(\)\.toISOString\(\),/);
  assert.match(bootstrapAgeGate, /guardianConfirmed: ageGroup === "minor"/);
  assert.match(gate, /ageGroup === "minor" && !guardianConfirmed/);
  assert.match(gate, /I am this user's parent or legal guardian/);
  assert.match(gate, /checked=\{checked\}/);
  assert.match(gate, /disabled=\{!checked \|\| !readToEnd \|\| !ageGroup/);
  assert.match(gate, /role="dialog"/);
  assert.match(gate, /aria-modal="true"/);
  assert.match(gate, /onScroll=\{handleDocumentScroll\}/);
  assert.match(gate, /legalDocumentRef/);
  assert.match(entry, /<LegalAcceptanceGate>/);
  assert.match(entry, /lazy\(async \(\) =>/);
  assert.match(entry, /import\('\.\/App'\)/);
  assert.match(entry, /import\('\.\/components\/AppErrorBoundary'\)/);
  assert.doesNotMatch(entry, /import App from ['"]\.\/App['"]/);
  assert.doesNotMatch(entry, /<AppErrorBoundary>/);
  assert.doesNotMatch(entry, /installReliabilityMonitoring/);
  assert.match(app, /installReliabilityMonitoring\(\)/);
  assert.match(app, /imported only after legal acceptance, verified email sign-in, and local-vault unlock/);
  assert.match(appStyles, /@import url\('https:\/\/fonts\.googleapis\.com/);
  assert.doesNotMatch(gateStyles, /@import|url\(https?:/i);
});

test("the full notice discloses actual local, search, cloud, age, and service limitations", async () => {
  const terms = await read("src/legal/terms.ts");
  for (const phrase of [
    "at least 13",
    "parent or legal guardian",
    "encrypts your student profile",
    "non-exportable encryption key",
    "does not receive the local vault contents",
    "malicious software",
    "permanent account-deletion workflow",
    "privacy-request form in settings",
    "your selected U.S. state, expected graduation year, and selected scholarship category IDs",
    "Google",
    "account provider",
    "email sign-in link",
    "does not request access to your email inbox",
    "does not submit scholarship applications",
    "does not warrant that scholarship information",
    "Settings provides a permanent cloud-account deletion workflow",
    "individually operated project based in texas",
    "levi.haidar@outlook.com",
    "does not publish a personal residential street address",
    "stored in this browser",
    "parent/guardian acknowledgement status",
    "not server-side proof of identity",
    "existing vault passphrase once to verify and migrate",
    "Cloud sponsor and source records are stored separately",
    "does not upload a cloud copy of your student profile or local eligibility assessments",
    "existing vault passphrase once to verify and migrate",
    "Cloud sponsor and source records are stored separately",
    "does not upload a cloud copy of your student profile",
    "The current app does not upload a cloud copy of your student profile or local eligibility assessments.",

  ]) {
    assert.ok(terms.toLowerCase().includes(phrase.toLowerCase()), `missing disclosure: ${phrase}`);
  }
});

test("accepted users can reopen the notice from Settings", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /scholarship-scout:review-legal/);
  assert.match(app, /Review Terms of Service & Privacy Notice/);
});


test("privacy notice accurately discloses U.S.-only live search and local post-search ranking", async () => {
  const terms = await read("src/legal/terms.ts");
  assert.match(terms, /Automated live discovery currently supports U\.S\. state targeting only/);
  assert.match(terms, /selected U\.S\. state, expected graduation year, and selected scholarship category IDs/);
  assert.match(terms, /browser may compare result titles and excerpts against locally stored county, school name, education level, planned major, interests, academic coursework and honors, activities, service experience, employment, languages, certifications, and custom ranking keywords/);
  assert.match(terms, /Those matching values are processed only on this device and are not sent as part of the search request/);
  assert.match(terms, /non-exportable encryption key/);
  assert.match(terms, /The sign-in screen also offers Google sign-in/);
});
