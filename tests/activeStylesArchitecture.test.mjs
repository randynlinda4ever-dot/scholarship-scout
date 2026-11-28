import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expectedStylesheets = [
  "./styles/base.css",
  "./styles/theme.css",
  "./styles/accessibility.css",
  "./styles/editorial.css",
  "./styles/components.css",
  "./styles/navigation.css",
  "./styles/design-system.css",
  "./styles/overrides.css",
];

test("App.css is the ordered manifest for the active global stylesheets", async () => {
  const [manifest, app] = await Promise.all([
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  ]);
  const localImports = [...manifest.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith("./"));

  assert.deepEqual(localImports, expectedStylesheets);
  assert.match(manifest, /^@import url\(/);
  assert.match(app, /import ['"]\.\/App\.css['"]/);
  assert.match(app, /import ['"]\.\/brand-system\.css['"]/);
});

test("each imported stylesheet exists and contains rules rather than nested imports", async () => {
  const styles = await Promise.all(expectedStylesheets.map(async (path) => {
    const content = await readFile(new URL("../src/" + path.slice(2), import.meta.url), "utf8");
    return { path, content };
  }));

  for (const { path, content } of styles) {
    assert.ok(content.trim().length > 0, path + " must not be empty");
    assert.doesNotMatch(content, /^\s*@import\s/m, path + " must not create a nested import chain");
  }
});
