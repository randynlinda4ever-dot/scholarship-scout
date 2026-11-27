import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("README points maintainers to the canonical artifact integrity policy", async () => {
  const readme = await read("../README.md");
  assert.match(readme, /docs\/artifact-integrity\.md/);
});

test("integrity policy identifies exactly the existing Scholarship Scout artifact", async () => {
  const policy = await read("../docs/artifact-integrity.md");
  const canonicalUrl = "https://app.agentgrid.io/artifacts/Y9kTsZ0-vazOq3AnWspbAw";
  assert.equal(policy.split(canonicalUrl).length - 1, 1);
  assert.match(policy, /canonical product source of truth/i);
  assert.match(policy, /do not create a duplicate artifact/i);
});

test("integrity policy resolves the current revision dynamically and rejects stale deployment provenance", async () => {
  const policy = await read("../docs/artifact-integrity.md");
  assert.match(policy, /artifact-explore/i);
  assert.match(policy, /latest committed revision/i);
  assert.match(policy, /current main commit/i);
  assert.match(policy, /deployments are runtime outputs, not the canonical source/i);
  assert.doesNotMatch(policy, /\b[0-9a-f]{40}\b/i, "policy must not pin a stale commit hash");
});
