import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("public methodology guide explains the implemented source-review labels and evidence threshold", async () => {
  const [guide, evidence, verification] = await Promise.all([
    read("../docs/methodology.md"),
    read("../src/lib/evidence.js"),
    read("../docs/verification-system.md"),
  ]);

  for (const label of ["Verified", "Needs review", "Expired", "unverified lead"]) {
    assert.match(guide, new RegExp(label, "i"), `missing explanation for ${label}`);
  }
  assert.match(guide, /last 30 days/i);
  assert.match(guide, /criterion-specific evidence/i);
  assert.match(guide, /same recognized official sponsor domain/i);
  assert.match(evidence, /ageDays <= 30/);
  assert.match(evidence, /hasCriterionEvidence/);
  assert.match(verification, /LIVE_VERIFICATION_ENABLED/);
  assert.match(guide, /automated scholarship-verification function is disabled/i);
});

test("public methodology guide documents every eligibility status and pass/fail/unknown semantics", async () => {
  const [guide, summary, engine] = await Promise.all([
    read("../docs/methodology.md"),
    read("../src/lib/eligibilitySummary.js"),
    read("../src/eligibility.js"),
  ]);

  for (const status of [
    "Expired",
    "Ineligible",
    "Needs information",
    "Rules match — source unverified",
    "Eligible",
  ]) assert.ok(guide.includes(status), `missing eligibility status: ${status}`);

  for (const outcome of ["Pass", "Fail", "Unknown"]) {
    assert.match(guide, new RegExp(`\\*\\*${outcome}\\*\\*`));
  }
  assert.match(summary, /not an award guarantee/i);
  assert.match(engine, /else if \(blockingUnknowns > 0\) status = "Needs information"/);
  assert.match(engine, /else if \(!sourceVerified\) status = "Rules match — source unverified"/);
});

test("public methodology guide states real limitations and avoids award guarantees", async () => {
  const [guide, evidence, engine] = await Promise.all([
    read("../docs/methodology.md"),
    read("../src/lib/evidence.js"),
    read("../src/eligibility.js"),
  ]);

  assert.match(guide, /does not guarantee/i);
  assert.match(guide, /allowlist/i);
  assert.match(guide, /mandatory versus preferred criteria/i);
  assert.match(guide, /financial need is not inferred/i);
  assert.match(guide, /award text is shown as entered/i);
  assert.match(evidence, /OFFICIAL_HOSTS/);
  assert.match(engine, /Needs-based qualification cannot be inferred/);
});