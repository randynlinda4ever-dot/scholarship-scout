import { readFile } from 'node:fs/promises';

const appStylesheetUrl = new URL('../../src/App.css', import.meta.url);

export async function readWorkspaceStyles() {
  const manifest = await readFile(appStylesheetUrl, 'utf8');
  const imports = [...manifest.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)]
    .map((match) => match[1]);
  if (imports.length === 0) {
    throw new Error('App.css must import at least one stylesheet module.');
  }
  const layers = await Promise.all(
    imports.map((specifier) => readFile(new URL(specifier, appStylesheetUrl), 'utf8')),
  );
  return layers.join('\n');
}
