import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const securityDocs = await readFile(new URL('../docs/privacy-and-security.md', import.meta.url), 'utf8');

test('the application ships a restrictive meta Content Security Policy before scripts', () => {
  const cspPosition = html.indexOf('http-equiv="Content-Security-Policy"');
  const scriptPosition = html.indexOf('<script');
  assert.ok(cspPosition >= 0 && scriptPosition > cspPosition, 'CSP must precede executable scripts');

  const cspTagEnd = html.indexOf('/>', cspPosition);
  const cspTag = html.slice(cspPosition, cspTagEnd);
  const contentStart = cspTag.indexOf('content="');
  assert.ok(contentStart >= 0, 'CSP meta directive must have a content value');
  const valueStart = contentStart + 'content="'.length;
  const valueEnd = cspTag.indexOf('"', valueStart);
  const policy = cspTag.slice(valueStart, valueEnd);

  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://wjrwvempgjvoxlioodse.supabase.co wss://wjrwvempgjvoxlioodse.supabase.co",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "upgrade-insecure-requests",
  ]) {
    assert.ok(policy.includes(directive), 'CSP is missing: ' + directive);
  }

  assert.ok(!policy.includes('unsafe-eval'), 'CSP must not allow eval');
  assert.ok(!policy.includes('script-src *'), 'CSP must not allow arbitrary scripts');
  assert.ok(policy.includes("style-src 'self' 'unsafe-inline'"), 'inline styles are allowed only for current React style attributes');
});

test('hosting-only security headers are explicitly documented as unverified', () => {
  assert.ok(securityDocs.includes('frame-ancestors'));
  assert.ok(securityDocs.includes('Strict-Transport-Security'));
  assert.ok(securityDocs.includes('X-Content-Type-Options'));
  assert.ok(securityDocs.includes('Permissions-Policy'));
});
