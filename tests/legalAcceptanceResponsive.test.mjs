import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legal notice remains a separate scrollable reading region", async () => {
  const styles = await read("src/components/LegalAcceptanceGate.css");
  const component = await read("src/components/LegalAcceptanceGate.tsx");

  assert.match(styles, /\.legal-document\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(component, /className="legal-document"/);
  assert.match(component, /onScroll=\{handleDocumentScroll\}/);
  assert.match(component, /role="region"/);
});

test("the age question uses one accessible compact selector instead of a radio grid", async () => {
  const component = await read("src/components/LegalAcceptanceGate.tsx");
  const bootstrap = await read("src/bootstrap.ts");

  assert.match(component, /className="legal-age-control"/);
  assert.match(component, /className="legal-age-select"/);
  assert.match(component, /value=\{ageGroup\}/);
  assert.match(component, /value="under13"/);
  assert.match(bootstrap, /legal-preflight-age-control/);
  assert.match(bootstrap, /legal-preflight-age-select/);
  assert.doesNotMatch(component, /legal-age-fieldset|type="radio"/);
  assert.doesNotMatch(bootstrap, /\.legal-preflight-age\s*\{|type = "radio"/);
});

test("mobile age selector and acceptance controls preserve touch-sized targets", async () => {
  const styles = await read("src/components/LegalAcceptanceGate.css");
  const bootstrap = await read("src/bootstrap.ts");

  assert.match(styles, /\.legal-age-select\s*\{[^}]*min-height:\s*40px/s);
  assert.match(styles, /\.legal-gate-primary,\s*\.legal-gate-secondary\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.legal-guardian-check input\s*\{[^}]*width:\s*20px/s);
  assert.match(bootstrap, /\.legal-preflight-age-select\s*\{[^}]*min-height:\s*40px/s);
  assert.match(bootstrap, /\.legal-preflight-accept\s*\{[^}]*min-height:\s*46px/s);
});

test("mobile Terms layout keeps the reading region flexible and the controls in normal document flow", async () => {
  const styles = await read("src/components/LegalAcceptanceGate.css");
  const mobile = styles.split("@media (max-width: 620px)")[1];

  assert.match(mobile, /\.legal-gate-panel\s*\{[^}]*height:\s*100dvh/s);
  assert.match(mobile, /\.legal-document\s*\{[^}]*min-height:\s*0/s);
  assert.match(mobile, /\.legal-gate-footer\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s);
  assert.doesNotMatch(mobile, /\.legal-gate-footer\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(mobile, /\.legal-gate-footer\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(mobile, /\.legal-gate-actions\s*\{[^}]*position:\s*sticky/);
});

test("first-load preflight uses the same compact selector and normal-flow mobile footer", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  const mobile = bootstrap.split("@media (max-width: 600px)")[1];

  assert.match(bootstrap, /legal-preflight-age-control/);
  assert.match(bootstrap, /legal-preflight-age-select/);
  assert.match(mobile, /\.legal-preflight-panel\s*\{[^}]*height:\s*100dvh/s);
  assert.match(mobile, /\.legal-preflight-document\s*\{[^}]*min-height:\s*0/s);
  assert.match(mobile, /\.legal-preflight-footer\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s);
  assert.doesNotMatch(bootstrap, /\.legal-preflight-age\s*\{/);
  assert.doesNotMatch(mobile, /\.legal-preflight-footer\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(mobile, /\.legal-preflight-actions\s*\{[^}]*position:\s*sticky/);
});

test("first-load agreement controls call the assigned state updater", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  const updateAssignment = bootstrap.indexOf("updateButton = () => {");
  const checkboxListener = bootstrap.indexOf('checkbox.addEventListener("change", () => updateButton());');
  const guardianListener = bootstrap.indexOf('guardianCheckbox.addEventListener("change", () => updateButton());');

  assert.ok(updateAssignment >= 0);
  assert.ok(checkboxListener > updateAssignment);
  assert.ok(guardianListener > updateAssignment);
});

test("guardian acknowledgement stays explicit and is shown only for users aged 13 through 17", async () => {
  const component = await read("src/components/LegalAcceptanceGate.tsx");
  const bootstrap = await read("src/bootstrap.ts");

  assert.match(component, /ageGroup === "minor" \? <label className="legal-guardian-check"/);
  assert.match(component, /I am this user's parent or legal guardian/);
  assert.match(component, /reviewed this notice/);
  assert.match(component, /authorize this 13–17-year-old to use Scholarship Scout/);
  assert.match(bootstrap, /ageGroup !== "minor"/);
  assert.match(bootstrap, /legal-preflight-intro/);
  assert.match(bootstrap, /Scroll to the end to enable acceptance/);
  assert.match(bootstrap, /under13/);
});

test("acceptance requires reading the full notice, choosing an allowed age group, and explicit consent", async () => {
  const component = await read("src/components/LegalAcceptanceGate.tsx");
  const bootstrap = await read("src/bootstrap.ts");

  assert.match(component, /if \(!checked \|\| !readToEnd\) return/);
  assert.match(component, /ageGroup === "minor" && !guardianConfirmed/);
  assert.match(component, /ageGroup === "under13"/);
  assert.match(bootstrap, /!checkbox\.checked \|\| !readToEnd \|\| !ageAllowed/);
});

test("guardian acknowledgement is hidden by default and shown only for the 13–17 selection", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  const gate = await read("src/components/LegalAcceptanceGate.tsx");
  const styles = await read("src/components/LegalAcceptanceGate.css");

  assert.match(bootstrap, /guardianLabel\.hidden = true/);
  assert.match(bootstrap, /guardianLabel\.hidden = ageGroup !== "minor"/);
  assert.match(bootstrap, /\.legal-preflight-guardian\[hidden\] \{ display: none !important; \}/);
  assert.match(gate, /ageGroup === "minor" \? <label className="legal-guardian-check"/);
  assert.match(styles, /\.legal-guardian-check\[hidden\] \{ display: none !important; \}/);
  assert.ok(bootstrap.includes(".legal-preflight h1 { font-size: 22px; line-height: 1.15; }"));
  assert.ok(bootstrap.includes(".legal-preflight-guides { display: none; }"));
  assert.ok(styles.includes(".legal-gate-kicker { display: none; }"));
  assert.match(bootstrap, /guardianCheckbox\.checked = false/);
  assert.match(bootstrap, /guardianLabel\.hidden = ageGroup !== "minor"/);
});
