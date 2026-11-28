import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
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
    "script-src 'self' https://www.googletagmanager.com",
    "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com",
    "connect-src 'self' https://wjrwvempgjvoxlioodse.supabase.co wss://wjrwvempgjvoxlioodse.supabase.co https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com",
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

test('Vercel applies transport, MIME, referrer, and capability headers to every route', () => {
  const globalRule = vercel.headers.find((rule) => rule.source === '/(.*)');
  assert.ok(globalRule, 'a catch-all security-header rule must cover the app and static resources');
  const values = Object.fromEntries(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(values['strict-transport-security'], 'max-age=31536000');
  assert.equal(values['x-content-type-options'], 'nosniff');
  assert.equal(values['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(values['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
});

test('production hosts deny framing without breaking the separate preview iframe origin', () => {
  for (const host of ['scholarship-scout.org', 'www.scholarship-scout.org']) {
    const rule = vercel.headers.find((item) =>
      item.source === '/(.*)' &&
      item.has?.some((condition) => condition.type === 'host' && condition.value === host)
    );
    assert.ok(rule, 'missing production-only framing rule for ' + host);
    const values = Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    assert.equal(values['content-security-policy'], "frame-ancestors 'none'");
    assert.equal(values['x-frame-options'], 'DENY');
  }
  assert.ok(securityDocs.includes('Anima'));
  assert.ok(securityDocs.includes('frame-ancestors'));
});
