import test from 'node:test';
import assert from 'node:assert/strict';
import { readActiveAppStyles } from './helpers/activeAppStyles.mjs';

const styles = await readActiveAppStyles();

test('mobile dialog close controls retain a 44px touch target', () => {
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.close\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
});

test('mobile text actions retain a 44px touch target', () => {
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.text-button\s*\{[^}]*min-height:\s*44px/);
});

test('mobile compact-view control retains a 44px touch target', () => {
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.compact-toggle\s*\{[^}]*min-height:\s*44px/);
});

test('mobile tracker links have a 44px minimum hit area', () => {
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.tracker-open\s*\{[^}]*min-height:\s*44px/);
});

test('very narrow screens stack application progress cards in one column', () => {
  assert.match(styles, /@media \(max-width: 380px\)[\s\S]*?\.application-pipeline-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});
