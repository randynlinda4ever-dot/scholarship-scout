import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let components;

test('load React components through the production Vite TypeScript transform', async (t) => {
  vite = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' });
  t.after(async () => { await vite?.close(); });
  const [brand, nav, status, home, boundary] = await Promise.all([
    vite.ssrLoadModule('/src/components/BrandMark.tsx'),
    vite.ssrLoadModule('/src/components/NavGlyph.tsx'),
    vite.ssrLoadModule('/src/components/StatusPills.tsx'),
    vite.ssrLoadModule('/src/features/home/StartHomePage.tsx'),
    vite.ssrLoadModule('/src/components/AppErrorBoundary.tsx'),
  ]);
  components = { ...brand, ...nav, ...status, ...home, AppErrorBoundary: boundary.default };
  assert.equal(typeof components.BrandMark, 'function');
  assert.equal(typeof components.NavGlyph, 'function');
});

test('BrandMark renders the decorative official brand asset accessibly', () => {
  const html = renderToStaticMarkup(React.createElement(components.BrandMark, { className: 'brand-test' }));
  assert.match(html, /src="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(html, /alt=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /data-brand-symbol="graduation-hands"/);
});

test('every supported navigation glyph renders a hidden SVG with a stable viewBox', () => {
  const names = ['home','search','cloud','book','checklist','user','settings','book-stack','check-circle','info','calendar-clock','menu','close','chevron-left','chevron-right'];
  for (const name of names) {
    const html = renderToStaticMarkup(React.createElement(components.NavGlyph, { name }));
    assert.match(html, /<svg[^>]*viewBox="0 0 24 24"/);
    assert.match(html, /aria-hidden="true"/);
  }
});

test('status components render the semantic status and safe fallback class', () => {
  const eligible = renderToStaticMarkup(React.createElement(components.StatusPill, { status: 'Eligible' }));
  const needsInfo = renderToStaticMarkup(React.createElement(components.StatusPill, { status: 'Needs information' }));
  assert.match(eligible, /status-eligible/);
  assert.match(eligible, />Eligible<\/span>/);
  assert.match(needsInfo, /status-needs-information/);
});

test('StartHomePage exposes accessible email, Google, guest, and legal actions', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(components.StartHomePage, {
    email: 'student@example.com', onEmailChange: noop, onEmailSubmit: noop,
    onGoogleSignIn: noop, onContinueGuest: noop, onReviewLegal: noop,
    message: 'Test status', busy: false, online: true, configured: true,
    authReady: true, isAnonymous: false, cooldownSeconds: 0,
  }));
  assert.match(html, /id="start-home-email"/);
  assert.match(html, /type="email"/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Continue without an account/);
  assert.match(html, /Terms &amp; privacy/);
  assert.match(html, /role="status"/);
});

test('StartHomePage hides email form for anonymous users and disables offline sign-in', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(components.StartHomePage, {
    email: '', onEmailChange: noop, onEmailSubmit: noop,
    onGoogleSignIn: noop, onContinueGuest: noop, onReviewLegal: noop,
    message: '', busy: false, online: false, configured: true,
    authReady: true, isAnonymous: true, cooldownSeconds: 0,
  }));
  assert.doesNotMatch(html, /start-home-email/);
  assert.match(html, /Connect Google account/);
  assert.match(html, /disabled=""/);
});
