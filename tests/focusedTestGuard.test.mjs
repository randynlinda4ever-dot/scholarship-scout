import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFocusedTests } from '../scripts/check-focused-tests.mjs';

test('rejects focused test declarations', () => {
  const issues = inspectFocusedTests('test.only("focused", () => {});');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 1);
});

test('allows ordinary tests and unrelated only properties', () => {
  assert.deepEqual(inspectFocusedTests('test("normal", () => {}); object.only = true;'), []);
});
