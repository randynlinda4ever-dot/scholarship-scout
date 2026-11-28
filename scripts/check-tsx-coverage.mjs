import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

const root = process.cwd();
const srcRoot = resolve(root, "src");
const reportPath = resolve(process.argv[2] ?? "coverage/tsx-coverage.lcov");

function hasRuntimeCode(filePath) {
  const source = readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const syntax = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  return syntax.statements.some((statement) => {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEmptyStatement(statement)
    ) return false;
    if (ts.isExportDeclaration(statement)) return !statement.isTypeOnly;
    if (ts.isVariableStatement(statement)) {
      return !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
    }
    if (ts.isEnumDeclaration(statement)) {
      return !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ConstKeyword);
    }
    if (ts.isFunctionDeclaration(statement)) return Boolean(statement.body);
    if (ts.isClassDeclaration(statement)) return true;
    return true;
  });
}

function normalizeSourcePath(value) {
  let normalized = value.replace(/\\\\/g, "/");
  if (normalized.startsWith("file://")) {
    try { normalized = decodeURIComponent(new URL(normalized).pathname); } catch { /* retain source value */ }
  }
  const sourceIndex = normalized.lastIndexOf("/src/");
  if (sourceIndex >= 0) return normalized.slice(sourceIndex + 1);
  return normalized.replace(/^\.\//, "");
}

function percentage(covered, total) {
  return total > 0 ? Number(((covered / total) * 100).toFixed(2)) : 0;
}

function parseLcov(content) {
  const records = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (current) records.push(current);
      current = {
        source: normalizeSourcePath(line.slice(3)),
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0,
      };
      continue;
    }
    if (!current) continue;
    const match = /^(LF|LH|FNF|FNH|BRF|BRH):(\d+)$/.exec(line);
    if (!match) {
      if (line === "end_of_record") {
        records.push(current);
        current = null;
      }
      continue;
    }
    const [, key, rawValue] = match;
    const target = {
      LF: "linesFound",
      LH: "linesHit",
      FNF: "functionsFound",
      FNH: "functionsHit",
      BRF: "branchesFound",
      BRH: "branchesHit",
    }[key];
    current[target] = Number(rawValue);
  }
  if (current) records.push(current);
  return records;
}

const allSourceFiles = ts.sys.readDirectory(srcRoot, [".ts", ".tsx"], ["**/*.d.ts"]);
const expectedFiles = allSourceFiles
  .filter(hasRuntimeCode)
  .map((filePath) => relative(root, filePath).split(sep).join("/"))
  .sort();

let lcov;
try {
  lcov = readFileSync(reportPath, "utf8");
} catch (error) {
  console.error(`Cannot read TS/TSX coverage report: ${error.message}`);
  process.exit(1);
}
const records = parseLcov(lcov);
const bySource = new Map(records.map((record) => [record.source, record]));
const missing = expectedFiles.filter((filePath) => !bySource.has(filePath));
const uninstrumented = expectedFiles.filter((filePath) => {
  const record = bySource.get(filePath);
  return !record || record.linesFound === 0;
});

const tracked = expectedFiles.map((filePath) => {
  const record = bySource.get(filePath) ?? {
    source: filePath,
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0,
  };
  return {
    source: filePath,
    lines: percentage(record.linesHit, record.linesFound),
    functions: percentage(record.functionsHit, record.functionsFound),
    branches: percentage(record.branchesHit, record.branchesFound),
    counters: {
      linesHit: record.linesHit,
      linesFound: record.linesFound,
      functionsHit: record.functionsHit,
      functionsFound: record.functionsFound,
      branchesHit: record.branchesHit,
      branchesFound: record.branchesFound,
    },
  };
});

const sums = tracked.reduce((total, file) => ({
  linesHit: total.linesHit + file.counters.linesHit,
  linesFound: total.linesFound + file.counters.linesFound,
  functionsHit: total.functionsHit + file.counters.functionsHit,
  functionsFound: total.functionsFound + file.counters.functionsFound,
  branchesHit: total.branchesHit + file.counters.branchesHit,
  branchesFound: total.branchesFound + file.counters.branchesFound,
}), {
  linesHit: 0, linesFound: 0, functionsHit: 0, functionsFound: 0,
  branchesHit: 0, branchesFound: 0,
});

const totals = {
  lines: percentage(sums.linesHit, sums.linesFound),
  functions: percentage(sums.functionsHit, sums.functionsFound),
  branches: percentage(sums.branchesHit, sums.branchesFound),
};

const globalThresholds = { lines: 75, functions: 70, branches: 60 };
const criticalThresholds = {
  "src/components/BrandMark.tsx": { lines: 95, functions: 100, branches: 100 },
  "src/components/NavGlyph.tsx": { lines: 90, functions: 100, branches: 75 },
  "src/components/TrackerDetailsButton.tsx": { lines: 95, functions: 100, branches: 75 },
  "src/features/home/StartHomePage.tsx": { lines: 75, functions: 70, branches: 60 },
};
const violations = [];
if (missing.length) violations.push(`missing source records: ${missing.join(", ")}`);
if (uninstrumented.length) violations.push(`uninstrumented source modules: ${uninstrumented.join(", ")}`);
for (const metric of Object.keys(globalThresholds)) {
  if (totals[metric] < globalThresholds[metric]) {
    violations.push(`global ${metric} ${totals[metric]}% < ${globalThresholds[metric]}%`);
  }
}
for (const [filePath, thresholds] of Object.entries(criticalThresholds)) {
  const actual = tracked.find((file) => file.source === filePath);
  if (!actual) {
    violations.push(`critical module missing from coverage inventory: ${filePath}`);
    continue;
  }
  for (const metric of Object.keys(thresholds)) {
    if (actual[metric] < thresholds[metric]) {
      violations.push(`${filePath} ${metric} ${actual[metric]}% < ${thresholds[metric]}%`);
    }
  }
}

const summary = {
  schemaVersion: 1,
  nodeVersion: process.version,
  typescriptVersion: ts.version,
  sourceMapMode: "inline TypeScript source maps; Node.js test-runner LCOV",
  sourceFilesDiscovered: expectedFiles.length,
  sourceFilesReported: expectedFiles.length - missing.length,
  missingSourceFiles: missing,
  uninstrumentedSourceFiles: uninstrumented,
  thresholds: { global: globalThresholds, criticalModules: criticalThresholds },
  totals,
  files: tracked,
  violations,
};
writeFileSync(resolve(root, "coverage/tsx-summary.json"), JSON.stringify(summary, null, 2) + "\n");

console.log(`TS/TSX source modules: ${summary.sourceFilesReported}/${summary.sourceFilesDiscovered} reported`);
console.log(`Coverage: lines ${totals.lines}% (min ${globalThresholds.lines}%), functions ${totals.functions}% (min ${globalThresholds.functions}%), branches ${totals.branches}% (min ${globalThresholds.branches}%)`);
for (const violation of violations) console.error(`Coverage gate: ${violation}`);
if (violations.length) process.exitCode = 1;
