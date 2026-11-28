import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

export async function readActiveAppStyles() {
  const appCss = await read('src/App.css');
  const importedPaths = [...appCss.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)]
    .map((match) => 'src/' + match[1].replace(/^\.\//, ''));
  const imported = await Promise.all(importedPaths.map(read));
  const additionalActiveStyles = await Promise.all([
    'public/brand-theme.css',
    'src/brand-system.css',
    'src/index.css',
    'src/styles/base.css',
    'src/components/LegalAcceptanceGate.css',
    'src/lib/localVaultGate.css',
  ].map(read));
  return [appCss, ...imported, ...additionalActiveStyles].join('\n');
}
