import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRECTORIES = ["src", "supabase", "tests", "docs"];
const EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx", ".css", ".json", ".md", ".yml", ".yaml", ".sql"]);
const CORRUPTED_UTF8 = [
  /\u00e2\u20ac[\u0080-\u00bf\u201c\u201d\u2013\u2014\u2122]/u,
  /\u00e2(?:\u2020|\u2021|\u20ac)/u,
  /\u00c3[\u0080-\u00bf]/u,
  /\u00c2[\u0080-\u00bf]/u,
  /\u00ef\u00bf\u00bd/u,
];
function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(file);
  }
  return files;
}
test("source, styles, tests, and docs contain no common UTF-8/CP1252 mojibake", () => {
  const violations = [];
  for (const directory of DIRECTORIES) {
    const absolute = path.join(ROOT, directory);
    if (!fs.existsSync(absolute)) continue;
    for (const file of walk(absolute)) {
      const source = fs.readFileSync(file, "utf8");
      if (CORRUPTED_UTF8.some((pattern) => pattern.test(source))) violations.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(violations, []);
});
