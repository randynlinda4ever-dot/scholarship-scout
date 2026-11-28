import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { registerHooks } from "node:module";
import ts from "typescript";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = resolve(process.cwd(), "src");
const config = ts.readConfigFile(resolve(process.cwd(), "tsconfig.json"), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const compilerOptions = {
  ...parsed.options,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  noEmit: false,
  inlineSourceMap: true,
  inlineSources: true,
};

function inside(filePath) {
  const rel = relative(sourceRoot, filePath);
  return rel !== "" && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}
function sourceCandidate(base) {
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const candidates = [base];
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs") candidates.push(stem + ".ts", stem + ".tsx");
  else if (!ext) candidates.push(base + ".ts", base + ".tsx", base + ".js", base + ".mjs", base + ".jsx", resolve(base,"index.ts"), resolve(base,"index.tsx"), resolve(base,"index.js"));
  return candidates.find((candidate) => {
    try { return inside(candidate) && existsSync(candidate) && statSync(candidate).isFile(); }
    catch { return false; }
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./lib/supabaseClient" &&
      context.parentURL?.startsWith("file:") &&
      context.parentURL.split(/[?#]/, 1)[0].endsWith("/src/App.tsx") &&
      globalThis.__SCOUT_TEST_SUPABASE_UNCONFIGURED__ === true
    ) return {url:"scholarship-scout:test-supabase-client",shortCircuit:true};

    if (
      specifier === "react-dom/client" && context.parentURL?.startsWith("file:") &&
      /\/src\/(main|agentDemo)\.tsx(?:\?|$)/.test(context.parentURL)
    ) return {url:"scholarship-scout:test-react-dom-client",shortCircuit:true};

    if (context.parentURL?.startsWith("file:") && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      try {
        const target = new URL(specifier, context.parentURL);
        target.search = "";
        target.hash = "";
        const candidate = sourceCandidate(fileURLToPath(target));
        if (candidate) return {url:pathToFileURL(candidate).href,shortCircuit:true};
      } catch { /* default resolution */ }
    }
    return nextResolve(specifier,context);
  },
  load(url, context, nextLoad) {
    if (url === "scholarship-scout:test-supabase-client") {
      return {
        format:"module",
        shortCircuit:true,
        source:"export const supabaseConfigured=false; export function getSupabaseClient(){return Promise.resolve(null);}",
      };
    }
    if (url === "scholarship-scout:test-react-dom-client") {
      return {
        format:"module",
        shortCircuit:true,
        source:"export function createRoot(root){return {render(tree){globalThis.__SCOUT_TEST_ROOT_CAPTURE__={root,tree};},unmount(){globalThis.__SCOUT_TEST_ROOT_CAPTURE__=null;}};}",
      };
    }
    if (!url.startsWith("file:")) return nextLoad(url,context);
    let filePath;
    try { filePath = fileURLToPath(url); } catch { return nextLoad(url,context); }
    if (!inside(filePath)) return nextLoad(url,context);
    const ext = extname(filePath).toLowerCase();
    if (ext === ".css") return {format:"module",source:"export default undefined;",shortCircuit:true};
    if ((ext !== ".ts" && ext !== ".tsx") || filePath.endsWith(".d.ts")) return nextLoad(url,context);
    const transformed = ts.transpileModule(readFileSync(filePath,"utf8"),{
      fileName:filePath,compilerOptions,reportDiagnostics:true,
    });
    const errors=(transformed.diagnostics??[]).filter((diagnostic)=>diagnostic.category===ts.DiagnosticCategory.Error);
    if (errors.length) throw new SyntaxError("Could not transform " + filePath + ":\n" + errors.map((diagnostic)=>ts.flattenDiagnosticMessageText(diagnostic.messageText,"\n")).join("\n"));
    return {format:"module",source:transformed.outputText,shortCircuit:true};
  },
});
