import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/scholarshipApi.ts", import.meta.url), "utf8");

test("orders cloud scholarship pages by creation time and a unique ID tie-breaker", () => {
  const start = source.indexOf("export async function listCloudScholarships");
  const end = source.indexOf("export async function saveCloudScholarship", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const query = source.slice(start, end);
  assert.match(
    query,
    /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)\s*\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)\s*\.range\(from, to\)/,
  );
});

test("orders URL-scoped duplicate candidates before range pagination", () => {
  const start = source.indexOf("const candidates = await fetchCloudPages");
  const end = source.indexOf("const existing = findExistingCloudScholarshipMatch", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const query = source.slice(start, end);
  assert.match(
    query,
    /\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)\s*\.range\(from, to\)/,
  );
});
