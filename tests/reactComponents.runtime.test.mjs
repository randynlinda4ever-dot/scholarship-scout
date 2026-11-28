import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as brand from "../src/components/BrandMark.tsx";
import * as nav from "../src/components/NavGlyph.tsx";
import * as status from "../src/components/StatusPills.tsx";
import * as home from "../src/features/home/StartHomePage.tsx";
import * as cards from "../src/components/ScholarshipCards.tsx";
import * as trackerDetails from "../src/components/TrackerDetailsButton.tsx";

const components = { ...brand, ...nav, ...status, ...home, ...cards, ...trackerDetails };

test("React components load from the original TypeScript and TSX modules", () => {
  assert.equal(typeof components.BrandMark, "function");
  assert.equal(typeof components.NavGlyph, "function");
  assert.equal(typeof components.StartHomePage, "function");
  assert.equal(typeof components.CandidateCard, "function");
  assert.equal(typeof components.TrackerDetailsButton, "function");
});

test("TrackerDetailsButton exposes an accessible action and opens the selected scholarship", () => {
  const item = { id: "tracker-details-runtime", name: "North Star Community Scholarship" };
  let selected = null;
  const element = components.TrackerDetailsButton({
    item,
    onOpen: (value) => { selected = value; },
  });

  assert.equal(element.type, "button");
  assert.equal(element.props.type, "button");
  assert.equal(element.props.className, "secondary tracker-details");
  assert.equal(element.props["aria-label"], "Open details for North Star Community Scholarship");
  assert.equal(element.props.children, "›");

  element.props.onClick();
  assert.equal(selected, item);
  assert.match(renderToStaticMarkup(element), /Open details for North Star Community Scholarship/);
});

test("BrandMark renders the decorative official brand asset accessibly", () => {
  const html = renderToStaticMarkup(React.createElement(components.BrandMark, { className: "brand-test" }));
  assert.match(html, /src="\/brand\/scholarship-scout-logo\.png"/);
  assert.match(html, /alt=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /data-brand-symbol="graduation-hands"/);
});

test("every supported navigation glyph renders an accessible SVG", () => {
  const names = ["home","search","cloud","book","checklist","user","settings","book-stack","check-circle","info","calendar-clock","menu","close","chevron-left","chevron-right"];
  for (const name of names) {
    const html = renderToStaticMarkup(React.createElement(components.NavGlyph, { name }));
    assert.match(html, /<svg[^>]*viewBox="0 0 24 24"/);
    assert.match(html, /aria-hidden="true"/);
  }
});

test("status components render semantic states and safe fallbacks", () => {
  const eligible = renderToStaticMarkup(React.createElement(components.StatusPill, { status: "Eligible" }));
  const needsInfo = renderToStaticMarkup(React.createElement(components.StatusPill, { status: "Needs information" }));
  assert.match(eligible, /status-eligible/);
  assert.match(eligible, />Eligible<\/span>/);
  assert.match(needsInfo, /status-needs-information/);
});

test("StartHomePage renders enabled email, Google, guest, and legal actions", () => {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(components.StartHomePage, {
    email: "student@example.com", onEmailChange: noop, onEmailSubmit: noop,
    onGoogleSignIn: noop, onContinueGuest: noop, onReviewLegal: noop,
    message: "Test status", busy: false, online: true, configured: true,
    authReady: true, isAnonymous: false, cooldownSeconds: 0,
  }));
  assert.match(html, /id="start-home-email"/);
  assert.match(html, /type="email"/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Continue without an account/);
  assert.match(html, /Terms &amp; privacy/);
  assert.match(html, /role="status"/);
});

test("StartHomePage hides email entry for anonymous users and disables offline sign-in", () => {
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(components.StartHomePage, {
    email: "", onEmailChange: noop, onEmailSubmit: noop,
    onGoogleSignIn: noop, onContinueGuest: noop, onReviewLegal: noop,
    message: "", busy: false, online: false, configured: true,
    authReady: true, isAnonymous: true, cooldownSeconds: 0,
  }));
  assert.doesNotMatch(html, /start-home-email/);
  assert.match(html, /Connect Google account/);
  assert.match(html, /disabled=""/);
});

test("FilteredEmpty renders a recoverable no-match state", () => {
  const html = renderToStaticMarkup(React.createElement(components.FilteredEmpty, { onClear: () => {} }));
  assert.match(html, /role="status"/);
  assert.match(html, /No scholarships match these filters/);
  assert.match(html, /Clear filters/);
});

test("CandidateCard renders the supplied eligibility assessment", () => {
  const item = {
    id: "runtime-test", name: "Community Scholars Award", provider: "Community Foundation",
    award: "$1,000", notes: "Synthetic fixture", sourceUrl: "",
    deadline: "", deadlineNotPublished: true,
  };
  const assessment = {
    status: "Needs information",
    checks: [{ label: "Residency", outcome: "unknown", detail: "Confirm residency." }],
  };
  const html = renderToStaticMarkup(React.createElement(components.CandidateCard, {
    item, assessment, added: false, onAdd: () => {},
  }));
  assert.match(html, /Community Scholars Award/);
  assert.match(html, /Needs information/);
  assert.match(html, /1 unknown/);
});

test("CloudResultCard labels public records as unverified and gates tracker actions", () => {
  const item = {
    id: "cloud-runtime-test", title: "Synthetic Award", provider: "Example Sponsor",
    source_url: "https://example.org/scholarship", source_domain: "example.org",
    verification_state: "needs_human_review", discovery_category: "general",
    excerpt: "Synthetic public scholarship record",
  };
  const html = renderToStaticMarkup(React.createElement(components.CloudResultCard, {
    item, tracked: false, onTrack: () => {},
  }));
  assert.match(html, /role="listitem"/);
  assert.match(html, /Synthetic Award/);
  assert.match(html, /Verification not deployed/);
});

test("shared status components expose their public labels and source evidence", () => {
  const item = { name: "Synthetic award", sourceUrl: "https://example.org/award", deadline: "2099-01-01" };
  const assessment = { status: "Needs information", checks: [{ label: "Residency", outcome: "unknown" }] };
  const elements = [
    React.createElement(components.ApplicationStatusPill, { status: "Not started" }),
    React.createElement(components.PriorityPill, { priority: "Medium" }),
    React.createElement(components.SourceStatusPill, { item }),
    React.createElement(components.DeadlineUrgencyPill, { deadline: "2099-01-01", timeZone: "UTC" }),
    React.createElement(components.EvidenceCompletenessList, { item }),
    React.createElement(components.EligibilityMatchSummary, { assessment }),
  ];
  const html = elements.map(renderToStaticMarkup).join("");
  assert.match(html, /Not started/);
  assert.match(html, /Medium/);
  assert.match(html, /Fresh|Stale|Unverified/);
  assert.match(html, /Sponsor evidence completeness/);
  assert.match(html, /More information needed/);
});

test("Empty renders the true no-record state separately from filtered-empty state", () => {
  const html = renderToStaticMarkup(React.createElement(components.Empty, { onAdd: () => {} }));
  assert.match(html, /No scholarships in this view/);
  assert.match(html, /Add scholarship/);
  assert.doesNotMatch(html, /No scholarships match these filters/);
});
