import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

const root = process.cwd();
const srcRoot = resolve(root, "src");
const reportPath = resolve(process.argv[2] ?? "coverage/tsx-coverage.lcov");

function hasRuntimeCode(filePath) {
  const source = readFileSync(filePath, "utf8");
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
  return file.statements.some((node) => {
    if (ts.isImportDeclaration(node) || ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) || ts.isEmptyStatement(node)) return false;
    if (ts.isExportDeclaration(node)) return !node.isTypeOnly;
    if (ts.isFunctionDeclaration(node)) return Boolean(node.body);
    return true;
  });
}

function executableLines(filePath) {
  const source = readFileSync(filePath, "utf8");
  const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
  const result = new Set();
  const lineOf = (position) => file.getLineAndCharacterOfPosition(position).line + 1;
  const addLine = (node) => result.add(lineOf(node.getStart(file)));
  const addRange = (node) => {
    for (let line = lineOf(node.getStart(file)); line <= lineOf(Math.max(node.getStart(file), node.end - 1)); line += 1) result.add(line);
  };

  function visit(node) {
    if (
      ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) ||
      ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEmptyStatement(node) ||
      (ts.isExportDeclaration(node) && node.isTypeOnly) ||
      (ts.canHaveModifiers(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword))
    ) return;

    if (
      ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    ) {
      addLine(node);
      if (node.body) visit(node.body);
      for (const parameter of node.parameters) if (parameter.initializer) visit(parameter.initializer);
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      addLine(node);
      for (const member of node.members) visit(member);
      return;
    }
    if (ts.isVariableStatement(node)) {
      addLine(node);
      for (const declaration of node.declarationList.declarations) visit(declaration);
      return;
    }
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node)) {
      addLine(node);
      if (node.initializer) visit(node.initializer);
      if (ts.isVariableDeclaration(node) && ts.isBindingPattern(node.name)) visit(node.name);
      return;
    }
    if (ts.isBlock(node)) {
      for (const statement of node.statements) visit(statement);
      return;
    }
    if (ts.isJsxText(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      addRange(node);
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
        ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
      visit(node.expression);
      return;
    }
    if (ts.isStatement(node) || ts.isExpression(node) || ts.isJsxAttribute(node) ||
        ts.isJsxSpreadAttribute(node) || ts.isJsxOpeningElement(node) ||
        ts.isJsxClosingElement(node)) addLine(node);
    ts.forEachChild(node, visit);
  }

  for (const statement of file.statements) visit(statement);
  return result;
}

function normalizePath(value) {
  let path = value.replace(/\\\\/g, "/");
  if (path.startsWith("file://")) {
    try { path = decodeURIComponent(new URL(path).pathname); } catch { /* keep original */ }
  }
  const sourceIndex = path.lastIndexOf("/src/");
  return sourceIndex >= 0 ? path.slice(sourceIndex + 1) : path.replace(/^\.\//, "");
}

function percent(hit, total) {
  return total ? Number((hit * 100 / total).toFixed(2)) : 0;
}

function parseLcov(content) {
  const records = [];
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (current) records.push(current);
      current = { source: normalizePath(line.slice(3)), counts: new Map(), functionsFound: 0, functionsHit: 0, branchesFound: 0, branchesHit: 0, rawLinesFound: 0, rawLinesHit: 0 };
      continue;
    }
    if (!current) continue;
    const da = /^DA:(\d+),(\d+)/.exec(line);
    if (da) { current.counts.set(Number(da[1]), Number(da[2])); continue; }
    const match = /^(LF|LH|FNF|FNH|BRF|BRH):(\d+)$/.exec(line);
    if (!match) {
      if (line === "end_of_record") { records.push(current); current = null; }
      continue;
    }
    const key = { LF:"rawLinesFound", LH:"rawLinesHit", FNF:"functionsFound", FNH:"functionsHit", BRF:"branchesFound", BRH:"branchesHit" }[match[1]];
    current[key] = Number(match[2]);
  }
  if (current) records.push(current);
  return records;
}

const expectedFiles = ts.sys.readDirectory(srcRoot, [".ts", ".tsx"], ["**/*.d.ts"])
  .filter(hasRuntimeCode)
  .map((file) => relative(root, file).split(sep).join("/"))
  .sort();

let lcov;
try { lcov = readFileSync(reportPath, "utf8"); }
catch (error) {
  console.error("Cannot read TS/TSX coverage report: " + error.message);
  process.exit(1);
}

const bySource = new Map(parseLcov(lcov).map((record) => [record.source, record]));
const missing = expectedFiles.filter((file) => !bySource.has(file));
const uninstrumented = expectedFiles.filter((file) => !bySource.get(file) || bySource.get(file).rawLinesFound === 0);
const files = expectedFiles.map((path) => {
  const record = bySource.get(path);
  const executable = executableLines(resolve(root, path));
  let linesHit = 0;
  for (const line of executable) if ((record?.counts.get(line) ?? 0) > 0) linesHit += 1;
  const linesFound = executable.size;
  return {
    source: path,
    lines: percent(linesHit, linesFound),
    functions: percent(record?.functionsHit ?? 0, record?.functionsFound ?? 0),
    branches: percent(record?.branchesHit ?? 0, record?.branchesFound ?? 0),
    counters: {
      linesHit, linesFound,
      functionsHit: record?.functionsHit ?? 0,
      functionsFound: record?.functionsFound ?? 0,
      branchesHit: record?.branchesHit ?? 0,
      branchesFound: record?.branchesFound ?? 0,
      rawLinesHit: record?.rawLinesHit ?? 0,
      rawLinesFound: record?.rawLinesFound ?? 0,
    },
  };
});

const totals = files.reduce((sum, file) => {
  for (const key of ["linesHit","linesFound","functionsHit","functionsFound","branchesHit","branchesFound"]) sum[key] += file.counters[key];
  return sum;
}, {linesHit:0,linesFound:0,functionsHit:0,functionsFound:0,branchesHit:0,branchesFound:0});

const coverage = {
  lines: percent(totals.linesHit, totals.linesFound),
  functions: percent(totals.functionsHit, totals.functionsFound),
  branches: percent(totals.branchesHit, totals.branchesFound),
};
const globalThresholds = {lines:75,functions:70,branches:60};
const criticalThresholds = {
  "src/components/BrandMark.tsx": {lines:100,functions:100,branches:100},
  "src/components/NavGlyph.tsx": {lines:100,functions:100,branches:100},
  "src/components/TrackerDetailsButton.tsx": {lines:100,functions:100,branches:100},
  "src/features/home/StartHomePage.tsx": {lines:85,functions:100,branches:90},
};
const violations = [];
if (missing.length) violations.push("missing source records: " + missing.join(", "));
if (uninstrumented.length) violations.push("uninstrumented source modules: " + uninstrumented.join(", "));
for (const metric of Object.keys(globalThresholds)) {
  if (coverage[metric] < globalThresholds[metric]) violations.push("global " + metric + " " + coverage[metric] + "% < " + globalThresholds[metric] + "%");
}
for (const [path, thresholds] of Object.entries(criticalThresholds)) {
  const actual = files.find((file) => file.source === path);
  if (!actual) { violations.push("critical module missing from coverage inventory: " + path); continue; }
  for (const metric of Object.keys(thresholds)) {
    if (actual[metric] < thresholds[metric]) violations.push(path + " " + metric + " " + actual[metric] + "% < " + thresholds[metric] + "%");
  }
}

const summary = {
  schemaVersion:2,
  nodeVersion:process.version,
  typescriptVersion:ts.version,
  sourceMapMode:"inline TypeScript source maps; Node.js test-runner LCOV",
  lineCoverageDenominator:"TypeScript AST executable statements and expressions; erased imports/types excluded",
  sourceFilesDiscovered:expectedFiles.length,
  sourceFilesReported:expectedFiles.length - missing.length,
  missingSourceFiles:missing,
  uninstrumentedSourceFiles:uninstrumented,
  thresholds:{global:globalThresholds,criticalModules:criticalThresholds},
  totals:coverage,
  files,
  violations,
};
writeFileSync(resolve(root,"coverage/tsx-summary.json"),JSON.stringify(summary,null,2)+"\n");
console.log("TS/TSX source modules: " + summary.sourceFilesReported + "/" + summary.sourceFilesDiscovered + " reported");
console.log("Coverage: lines " + coverage.lines + "% (min " + globalThresholds.lines + "%), functions " + coverage.functions + "% (min " + globalThresholds.functions + "%), branches " + coverage.branches + "% (min " + globalThresholds.branches + "%)");
for (const violation of violations) console.error("Coverage gate: " + violation);
if (violations.length) process.exitCode = 1;
