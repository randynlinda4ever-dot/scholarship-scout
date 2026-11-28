import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['src'];
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const DEPRECATED_IMPORTS_FILE = path.join(ROOT, 'scripts/quality/deprecated-imports.json');

export function inspectSource(source, fileName = 'source.ts') {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const issues = [];
  const report = (node, message) => {
    const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    issues.push({ file: fileName, line: line + 1, message });
  };

  const visit = (node) => {
    const deprecatedTag = ts.getJSDocTags(node).find((tag) => tag.tagName.text === 'deprecated');
    if (deprecatedTag) report(node, '@deprecated declaration must be removed or migrated before promotion');
    if (ts.isDebuggerStatement(node)) report(node, 'debugger statement is not allowed in production source');
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const method = node.expression.name.text;
      if (ts.isIdentifier(receiver) && receiver.text === 'console' && ['log', 'info', 'debug'].includes(method)) {
        report(node, `console.${method} call is not allowed in production source`);
      }
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
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

export async function scanProductionSource() {
  const config = JSON.parse(await readFile(DEPRECATED_IMPORTS_FILE, 'utf8'));
  if (!Array.isArray(config.imports)) throw new Error('deprecated-imports.json must contain an imports array');
  const deprecatedImports = new Set(config.imports);
  const files = (await Promise.all(SOURCE_ROOTS.map((root) => walk(path.join(ROOT, root))))).flat();
  const issues = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    issues.push(...inspectSource(source, relative));
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const checkImport = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && deprecatedImports.has(node.moduleSpecifier.text)) {
        const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
        issues.push({ file: relative, line: line + 1, message: `import from retired module "${node.moduleSpecifier.text}"` });
      }
      ts.forEachChild(node, checkImport);
    };
    checkImport(tree);
  }
  return { scannedFiles: files.length, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const { scannedFiles, issues } = await scanProductionSource();
  console.log(`Scanned ${scannedFiles} production source files for deprecated declarations and retired patterns.`);
  if (issues.length) {
    for (const issue of issues) console.error(`${issue.file}:${issue.line}: ${issue.message}`);
    process.exitCode = 1;
  } else {
    console.log('Deprecated-code scan passed.');
  }
}
