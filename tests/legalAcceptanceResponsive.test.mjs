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

test("desktop age choices use a compact three-column layout", async () => {
  const styles = await read("src/components/LegalAcceptanceGate.css");
  assert.match(styles, /\.legal-age-fieldset\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.legal-age-fieldset\s+legend\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("mobile age choices wrap into two columns with the under-13 option on its own row", async () => {
  const styles = await read("src/components/LegalAcceptanceGate.css");
  assert.match(styles, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.legal-age-fieldset\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.legal-age-fieldset\s+label:last-of-type\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test("legal notice text remains at least 12px on mobile and acceptance controls keep touch-sized targets", async () => {
  const styles = await read("src/components/LegalAcceptanceGate.css");
  assert.match(styles, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.legal-document\s*\{[^}]*font-size:\s*12px/s);
  assert.match(styles, /\.legal-gate-primary,\s*\.legal-gate-secondary\s*\{[^}]*min-height:\s*44px/s);
  assert.match(styles, /\.legal-age-fieldset\s+input,\s*\.legal-guardian-check\s+input\s*\{[^}]*width:\s*20px/s);
});

test("first-load preflight uses the same compact desktop and mobile legal layout", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(bootstrap, /\.legal-preflight-age\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)/s);
  assert.match(bootstrap, /\.legal-preflight-age\s+legend\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(bootstrap, /@media \(max-width: 600px\)[\s\S]*?\.legal-preflight-age\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)/);
  assert.match(bootstrap, /\.legal-preflight-age\s+label:last-of-type\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(bootstrap, /\.legal-preflight-document\s*\{[^}]*font-size:\s*13px/s);
});

test("guardian acknowledgement remains explicit while its wording is concise", async () => {
  const component = await read("src/components/LegalAcceptanceGate.tsx");
  assert.match(component, /I am this user's parent or legal guardian/);
  assert.match(component, /reviewed this notice/);
  assert.match(component, /understand how Scholarship Scout uses information/);
  assert.match(component, /authorize this 13–17 year old to use it/);
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(bootstrap, /understand how Scholarship Scout uses information/);
});
