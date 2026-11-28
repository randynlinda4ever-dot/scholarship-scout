import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("README identifies the GitHub repository as the only canonical source", async () => {
  const readme = await read("../README.md");
  const policy = await read("../GITHUB_REPOSITORY.md");
  assert.match(readme, /GitHub `main` is the only canonical source/i);
  assert.match(policy, /GitHub is the only source-of-truth repository/i);
  assert.match(policy, /main` branch is the canonical production source branch/i);
});

test("source integrity policy requires reviewed GitHub history and exact deployment provenance", async () => {
  const policy = await read("../docs/artifact-integrity.md");
  assert.match(policy, /only source of truth/i);
  assert.match(policy, /origin\/main/i);
  assert.match(policy, /focused branch/i);
  assert.match(policy, /deployment's Git commit/i);
  assert.match(policy, /verify.*Supabase.*separately/is);
  assert.doesNotMatch(policy, /\b[0-9a-f]{40}\b/i, "policy must not pin a stale commit hash");
});

test("active project instructions do not depend on a separate source or synchronization service", async () => {
  const [agents, repository, policy] = await Promise.all([
    read("../AGENTS.md"),
    read("../GITHUB_REPOSITORY.md"),
    read("../docs/artifact-integrity.md"),
  ]);
  assert.match(agents, /GitHub repository is the only application source/i);
});
