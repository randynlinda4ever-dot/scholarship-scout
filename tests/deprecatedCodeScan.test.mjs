import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSource } from '../scripts/check-deprecated-code.mjs';

test('flags deprecated declarations with source locations', () => {
  const issues = inspectSource('/** @deprecated use replacement() */\nexport function oldApi() {}', 'fixture.ts');
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /@deprecated/);
  assert.equal(issues[0].line, 2);
});

test('flags debugger and production console diagnostics', () => {
  const issues = inspectSource('function run() { debugger; console.log("debug"); console.info("trace"); }');
  assert.equal(issues.length, 3);
});

test('does not flag deprecated words inside comments or string literals', () => {
  const issues = inspectSource('// @deprecated old API\nconst note = "console.log debugger";\nfunction current() { return note; }');
  assert.deepEqual(issues, []);
});
