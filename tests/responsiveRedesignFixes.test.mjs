import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const appCss = await readActiveAppStyles();
const brand = await readFile(new URL('../src/brand-system.css', import.meta.url), 'utf8');
const indexCss = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
test('desktop navigation labels remain visible beside their icons', () => { assert.match(app, /className="nav-copy"/); assert.match(appCss, /\.nav-copy \{ display: grid/); assert.match(brand, /\.sidebar \.nav-copy b/); });
test('320px mobile viewport fits the app shell without horizontal page overflow', () => { assert.match(indexCss, /html, body, #root \{[^}]*min-width: 320px/); assert.match(appCss, /\.shell \{ overflow-x: clip; \}/); assert.match(brand, /@media \(max-width: 380px\)/); });
