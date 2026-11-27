import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const STATUS = "Rules match — source unverified";
const CSS_CLASS = "status-rules-match-unverified";

test("eligibility, summary, App status mapping, CSS, and tests share one exact status contract", async () => {
  const [eligibility, summary, app, css] = await Promise.all([
    read("src/eligibility.js"),
    read("src/lib/eligibilitySummary.js"),
    read("src/App.tsx"),
    read("src/App.css"),
  ]);

  assert.ok(eligibility.includes(`status = "${STATUS}"`));
  assert.ok(summary.includes(`"${STATUS}"`));
  assert.ok(app.includes(`'${STATUS}'`));
  assert.ok(app.includes(`'${STATUS}': 'rules-match-unverified'`));
  assert.ok(css.includes(`.${CSS_CLASS}`));
  assert.doesNotMatch(app, /status-rules-match-source-unverified/);
});