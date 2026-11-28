import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("App consumes the shared domain model instead of redeclaring core entities", async () => {
  const app = await read("../src/App.tsx");
  const domain = await read("../src/domain/types.ts");

  assert.match(app, /import type \{[^}]*Profile[^}]*Scholarship[^}]*\} from '\.\/domain\/types\.js'/s);
  assert.doesNotMatch(app, /type Scholarship\s*=\s*\{/);
  assert.doesNotMatch(app, /type Profile\s*=\s*\{/);
  assert.match(domain, /schoolCountry:\s*string/);
  assert.match(domain, /plannedCollegeCountry:\s*string/);
});

test("the active application-preparation route renders its feature component", async () => {
  const app = await read("../src/App.tsx");
  const page = await read("../src/features/workspace/pages/ApplicationPrepPage.tsx");

  assert.match(app, /import \{ ApplicationPrepPage \} from '\.\/features\/workspace\/pages\/ApplicationPrepPage'/);
  assert.match(app, /tab === 'Application prep' && <ApplicationPrepPage model=\{/);
  for (const capability of [
    "Core preparation checklist",
    "Custom checklist",
    "Essay prompts and drafts",
    "Recommendation requests",
    "Required documents and deadlines",
    "Final application review",
    "Submission and decision record",
    "Record as submitted",
  ]) assert.ok(page.includes(capability), capability);
  assert.match(page, /Draft — keep your own voice and experiences/);
  assert.doesNotMatch(page, /<h3>Writing principles<\/h3>/);
});

test("the shared workspace sub-navigation is used by tracker and preparation screens", async () => {
  const app = await read("../src/App.tsx");
  const prep = await read("../src/features/workspace/pages/ApplicationPrepPage.tsx");
  const nav = await read("../src/components/WorkspaceSubnav.tsx");

  assert.match(app, /import \{ WorkspaceSubnav \} from '\.\/components\/WorkspaceSubnav'/);
  assert.ok(app.split("<WorkspaceSubnav").length - 1 >= 2);
  assert.ok(prep.includes("<WorkspaceSubnav"));
  assert.match(nav, /aria-pressed=\{active === option\.value\}/);
});

test("the app and profile page share one full-featured field-control implementation", async () => {
  const app = await read("../src/App.tsx");
  const fields = await read("../src/components/WorkspaceFields.tsx");

  assert.match(app, /import \{ Field, SelectField, CheckField \} from '\.\/components\/WorkspaceFields'/);
  assert.doesNotMatch(app, /function (Field|SelectField|CheckField)\s*\(/);
  assert.match(fields, /requirement\?: ["']required["'] \| ["']optional["']/);
  assert.match(fields, /aria-required=\{required \|\| undefined\}/);
  assert.match(fields, /min=\{min\}/);
  assert.match(fields, /max=\{max\}/);
  assert.match(fields, /step=\{step\}/);
  assert.match(fields, /<select required=\{required\}/);
});
