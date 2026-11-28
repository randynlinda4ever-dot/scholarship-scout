import { readFile } from "node:fs/promises";

/**
 * Returns global stylesheet source in App.css manifest order. UI regression
 * tests inspect the active CSS modules instead of assuming App.css contains
 * their declarations directly.
 */
export async function readActiveAppStyles() {
  const manifest = await readFile(new URL("../../src/App.css", import.meta.url), "utf8");
  const imports = [...manifest.matchAll(/^\s*@import\s+['"](.\/styles\/[^'"]+)['"]\s*;/gm)]
    .map((match) => match[1]);
  if (!imports.length) throw new Error("App.css does not declare any active stylesheet modules");

  const activeModules = await Promise.all(imports.map((path) =>
    readFile(new URL("../../src/" + path.slice(2), import.meta.url), "utf8")
  ));
  const externalImports = manifest.split("\n").filter((line) => /^\s*@import\s+url\(/i.test(line));
  return [...externalImports, ...activeModules].join("\n");
}
