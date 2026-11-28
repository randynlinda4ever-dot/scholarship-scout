import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const reportDirectory = resolve(root, "coverage");
const reportPath = resolve(reportDirectory, "tsx-coverage.lcov");
await rm(reportDirectory, { recursive: true, force: true });
await mkdir(reportDirectory, { recursive: true });

const testFiles = (await readdir(resolve(root, "tests")))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => resolve(root, "tests", name));

const args = [
  "--import", resolve(root, "scripts/register-tsx-coverage-loader.mjs"),
  "--enable-source-maps",
  "--test",
  "--experimental-test-coverage",
  "--test-coverage-include-all",
  "--test-coverage-include=src/**/*.ts",
  "--test-coverage-include=src/**/*.tsx",
  "--test-coverage-exclude=src/**/*.d.ts",
  "--test-reporter=lcov",
  `--test-reporter-destination=${reportPath}`,
  ...testFiles,
];

const testRun = spawnSync(process.execPath, args, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
if (testRun.error) console.error(testRun.error);

let coverageCheck = { status: 1 };
if (existsSync(reportPath)) {
  coverageCheck = spawnSync(
    process.execPath,
    [resolve(root, "scripts/check-tsx-coverage.mjs"), reportPath],
    { cwd: root, env: process.env, stdio: "inherit", windowsHide: true },
  );
  if (coverageCheck.error) console.error(coverageCheck.error);
} else {
  console.error("TypeScript/TSX coverage reporter did not create its LCOV report.");
}

if (testRun.status !== 0 || coverageCheck.status !== 0) process.exitCode = 1;
