import { readFile } from 'node:fs/promises';

const sourceFiles = [
  '../../src/App.tsx',
  '../../src/domain/types.ts',
  '../../src/features/workspace/pageTypes.ts',
  '../../src/features/workspace/pages/OverviewPage.tsx',
  '../../src/features/workspace/pages/SettingsPage.tsx',
  '../../src/features/workspace/pages/DiscoveryPage.tsx',
  '../../src/features/workspace/pages/CloudSearchPage.tsx',
  '../../src/features/workspace/pages/ScholarshipsPage.tsx',
  '../../src/features/workspace/pages/EligibilityFiltersPage.tsx',
  '../../src/features/workspace/pages/ApplicationPrepPage.tsx',
  '../../src/components/ScholarshipCards.tsx',
  '../../src/components/WorkspaceFields.tsx',
  '../../src/components/StatusPills.tsx',
];

export async function readWorkspaceSource() {
  const modules = await Promise.all(
    sourceFiles.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
  );
  return modules.join('\n/* workspace module boundary */\n');
}
