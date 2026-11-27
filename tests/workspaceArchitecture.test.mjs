import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readWorkspaceStyles } from './helpers/styles.mjs';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const pageTypes = await readFile(new URL('../src/features/workspace/pageTypes.ts', import.meta.url), 'utf8');

const pageModules = [
  { route: 'Overview', component: 'OverviewPage', model: 'OverviewPageModel' },
  { route: 'Settings', component: 'SettingsPage', model: 'SettingsPageModel' },
  { route: 'Discovery', component: 'DiscoveryPage', model: 'DiscoveryPageModel' },
  { route: 'Cloud Search', component: 'CloudSearchPage', model: 'CloudSearchPageModel' },
  { route: 'Scholarships', component: 'ScholarshipsPage', model: 'ScholarshipsPageModel' },
  { route: 'Eligibility filters', component: 'EligibilityFiltersPage', model: 'EligibilityFiltersPageModel' },
  { route: 'Application prep', component: 'ApplicationPrepPage', model: 'ApplicationPrepPageModel' },
];

test('workspace routes delegate to individual typed feature page modules', async () => {
  for (const page of pageModules) {
    const source = await readFile(
      new URL('../src/features/workspace/pages/' + page.component + '.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, new RegExp('export function ' + page.component + '\\b'));
    assert.match(source, new RegExp('model: ' + page.model + '\\b'));
    assert.match(app, new RegExp('case "' + page.route + '":[\\s\\S]*?<' + page.component + ' model='));
    assert.match(pageTypes, new RegExp('export interface ' + page.model + '\\b'));
  }
  assert.doesNotMatch(app, /tab === '(?:Overview|Settings|Discovery|Cloud Search|Scholarships|Eligibility filters|Application prep)'\s*&&/);
  assert.match(app, /renderWorkspacePage\(\)/);
});

test('page contracts are explicit and do not use an untyped catch-all model', () => {
  assert.doesNotMatch(pageTypes, /Record<string,\s*any>|:\s*any\b/);
  assert.doesNotMatch(pageTypes, /ComponentType|ReactNode/);
});

test('App.css declares every stylesheet layer in its intentional cascade order', async () => {
  const manifest = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');
  const imports = [...manifest.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)].map((match) => match[1]);
  assert.deepEqual(imports, [
    './styles/base.css',
    './styles/theme.css',
    './styles/accessibility.css',
    './styles/editorial.css',
    './styles/navigation.css',
    './styles/design-system.css',
  ]);
  const styles = await readWorkspaceStyles();
  assert.ok(styles.length > 10_000, 'all imported style layers should be loaded by the regression helper');
});
