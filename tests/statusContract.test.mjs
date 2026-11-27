import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readWorkspaceStyles } from "./helpers/styles.mjs";

const read = (path) => path === "src/App.css"
  ? readWorkspaceStyles()
  : readFile(new URL("../" + path, import.meta.url), "utf8");
const STATUS = "Rules match — source unverified";
const CSS_CLASS = "status-rules-match-unverified";

test("eligibility, summary, shared status component, and CSS share one exact status contract", async () => {
  const [eligibility, summary, pills, css] = await Promise.all([
    read("src/eligibility.js"),
    read("src/lib/eligibilitySummary.js"),
    read("src/components/StatusPills.tsx"),
    read("src/App.css"),
  ]);

  assert.ok(eligibility.includes(`status = "${STATUS}"`));
  assert.ok(summary.includes(`"${STATUS}"`));
  assert.ok(pills.includes(`'${STATUS}'`));
  assert.ok(pills.includes(`'${CSS_CLASS.replace("status-", "")}'`));
  assert.ok(css.includes(`.${CSS_CLASS}`));
  assert.doesNotMatch(pills, /status-rules-match-source-unverified/);
});
