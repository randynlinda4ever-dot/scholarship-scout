import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const ROOT = process.cwd();
const TEST_ROOT = path.join(ROOT, 'tests');
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

export function inspectFocusedTests(source, fileName = 'test.js') {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const issues = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'only'
      && ts.isIdentifier(node.expression.expression)
      && ['test', 'it', 'describe', 'suite'].includes(node.expression.expression.text)
    ) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      issues.push({ file: fileName, line: line + 1, message: 'focused test APIs are forbidden in committed test suites' });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return issues;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) files.push(absolute);
  }
  return files;
}

export async function scanFocusedTests() {
  const files = await walk(TEST_ROOT);
  const issues = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    issues.push(...inspectFocusedTests(source, path.relative(ROOT, file).split(path.sep).join('/')));
  }
  return { scannedFiles: files.length, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const { scannedFiles, issues } = await scanFocusedTests();
  console.log(`Scanned ${scannedFiles} test files for focused-only test declarations.`);
  if (issues.length) {
    for (const issue of issues) console.error(`${issue.file}:${issue.line}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log('Focused-test guard passed.');
  }
}
