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
  const [brand, nav, status, home, boundary, cards] = await Promise.all([
    vite.ssrLoadModule('/src/components/BrandMark.tsx'),
    vite.ssrLoadModule('/src/components/NavGlyph.tsx'),
    vite.ssrLoadModule('/src/components/StatusPills.tsx'),
    vite.ssrLoadModule('/src/features/home/StartHomePage.tsx'),
    vite.ssrLoadModule('/src/components/AppErrorBoundary.tsx'),
    vite.ssrLoadModule('/src/components/ScholarshipCards.tsx'),
  ]);
  components = { ...brand, ...nav, ...status, ...home, ...cards, AppErrorBoundary: boundary.default };
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

test('FilteredEmpty renders a distinct recoverable no-match state', () => {
  const html = renderToStaticMarkup(React.createElement(components.FilteredEmpty, { onClear: () => {} }));
  assert.match(html, /role="status"/);
  assert.match(html, /No scholarships match these filters/);
  assert.match(html, /Clear filters/);
});

test('CandidateCard renders eligibility status from the supplied assessment', () => {
  const item = {
    id: 'runtime-test', name: 'Community Scholars Award', provider: 'Community Foundation',
    award: '$1,000', notes: 'Synthetic fixture', sourceUrl: '',
    deadline: '', deadlineNotPublished: true,
  };
  const assessment = {
    status: 'Needs information',
    checks: [{ label: 'Residency', outcome: 'unknown', detail: 'Confirm residency.' }],
  };
  const html = renderToStaticMarkup(React.createElement(components.CandidateCard, {
    item, assessment, added: false, onAdd: () => {},
  }));
  assert.match(html, /Community Scholars Award/);
  assert.match(html, /Needs information/);
  assert.match(html, /1 unknown/);
});

test('CloudResultCard keeps cloud results as list items and gates tracker actions', () => {
  const item = {
    id: 'cloud-runtime-test', title: 'Synthetic Award', provider: 'Example Sponsor',
    source_url: 'https://example.org/scholarship', source_domain: 'example.org',
    verification_state: 'needs_human_review', discovery_category: 'general',
    excerpt: 'Synthetic public scholarship record',
  };
  const html = renderToStaticMarkup(React.createElement(components.CloudResultCard, {
    item, tracked: false, onTrack: () => {},
  }));
  assert.match(html, /role="listitem"/);
  assert.match(html, /Synthetic Award/);
  assert.match(html, /Verification not deployed/);
});
