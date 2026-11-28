import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import ts from "typescript";

const sourceRoot = resolve(process.cwd(), "src");
const configPath = resolve(process.cwd(), "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) {
  throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
}
const parsedConfig = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const compilerOptions = {
  ...parsedConfig.options,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  noEmit: false,
  inlineSourceMap: true,
  inlineSources: true,
};

function isInsideSource(filePath) {
  const relativePath = relative(sourceRoot, filePath);
  return relativePath !== "" &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath);
}

function resolveSourceCandidate(basePath) {
  const extension = extname(basePath);
  const stem = extension ? basePath.slice(0, -extension.length) : basePath;
  const candidates = [basePath];

  if (extension === ".js" || extension === ".jsx" || extension === ".mjs") {
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  } else if (!extension) {
    candidates.push(
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.mjs`,
      `${basePath}.jsx`,
      resolve(basePath, "index.ts"),
      resolve(basePath, "index.tsx"),
      resolve(basePath, "index.js"),
    );
  }

  return candidates.find((candidate) => {
    try {
      return isInsideSource(candidate) && existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith("file:") &&
      (specifier.startsWith("./") || specifier.startsWith("../"))
    ) {
      try {
        const target = new URL(specifier, context.parentURL);
        target.search = "";
        target.hash = "";
        const candidate = resolveSourceCandidate(fileURLToPath(target));
        if (candidate) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      } catch {
        // Fall through to Node's standard resolver for non-source imports.
      }
    }
    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (!url.startsWith("file:")) return nextLoad(url, context);

    let filePath;
    try {
      filePath = fileURLToPath(url);
    } catch {
      return nextLoad(url, context);
    }
    if (!isInsideSource(filePath)) return nextLoad(url, context);

    const extension = extname(filePath).toLowerCase();
    if (extension === ".css") {
      return {
        format: "module",
        source: "export default undefined;",
        shortCircuit: true,
      };
    }
    if (
      (extension !== ".ts" && extension !== ".tsx") ||
      filePath.endsWith(".d.ts")
    ) {
      return nextLoad(url, context);
    }

    const source = readFileSync(filePath, "utf8");
    const transformed = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions,
      reportDiagnostics: true,
    });
    const errors = (transformed.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length) {
      const message = errors
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
        .join("\n");
      throw new SyntaxError(`Could not transform ${filePath}:\n${message}`);
    }

    return {
      format: "module",
      source: transformed.outputText,
      shortCircuit: true,
    };
  },
});
