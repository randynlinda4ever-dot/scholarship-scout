import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/analytics-consent.js", import.meta.url), "utf8");
const repo = "randynlinda4ever-dot/scholarship-scout";

function makeNode(tagName, registry) {
  const listeners = new Map();
  const attributes = new Map();
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    className: "",
    textContent: "",
    hidden: false,
    appendChild(child) {
      this.children.push(child);
      if (child.id) registry.set(child.id, child);
      return child;
    },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    dispatch(type) {
      for (const callback of listeners.get(type) || []) {
        callback({ preventDefault() {}, target: this, currentTarget: this });
      }
    },
  };
  return node;
}

function boot({ storedConsent = null, hostname = "scholarship-scout.org", pageType = "scholarship_guides", storageThrows = false } = {}) {
  const values = new Map();
  if (storedConsent) values.set("scholarship-scout.analytics-consent.v1", storedConsent);
  const storage = {
    getItem(key) {
      if (storageThrows) throw new Error("storage blocked");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (storageThrows) throw new Error("storage blocked");
      values.set(key, String(value));
    },
  };
  const registry = new Map();
  const externalScripts = [];
  const body = makeNode("body", registry);
  body.setAttribute("data-analytics-page-type", pageType);
  const document = {
    readyState: "complete",
    body,
    head: {
      appendChild(node) {
        externalScripts.push(node);
        if (node.id) registry.set(node.id, node);
        return node;
      },
    },
    createElement(tagName) { return makeNode(tagName, registry); },
    getElementById(id) { return registry.get(id) || null; },
  };
  const windowListeners = new Map();
  const window = {
    localStorage: storage,
    location: {
      hostname,
      href: "https://scholarship-scout.org/auth/callback?code=must-not-be-sent",
      reloadCount: 0,
      reload() { this.reloadCount += 1; },
    },
    dataLayer: [],
    addEventListener(type, callback) {
      const callbacks = windowListeners.get(type) || [];
      callbacks.push(callback);
      windowListeners.set(type, callbacks);
    },
    dispatchEvent(event) {
      for (const callback of windowListeners.get(event.type) || []) callback(event);
    },
  };
  vm.runInNewContext(source, { window, document, Date, URL });
  const findAction = (action, root = body) => {
    if (root.getAttribute?.("data-analytics-action") === action) return root;
    for (const child of root.children || []) {
      const found = findAction(action, child);
      if (found) return found;
    }
    return null;
  };
  return { window, document, storage, body, externalScripts, findAction, registry };
}

test("GTM stays unloaded until the visitor explicitly opts in", () => {
  const app = boot();
  assert.equal(app.externalScripts.length, 0);
  assert.equal(app.storage.getItem("scholarship-scout.analytics-consent.v1"), null);
  assert.ok(app.registry.get("scout-analytics-consent-banner"));
});

test("declining analytics stores the choice and never requests GTM", () => {
  const app = boot();
  const decline = app.findAction("decline");
  assert.ok(decline);
  decline.dispatch("click");
  assert.equal(app.storage.getItem("scholarship-scout.analytics-consent.v1"), "denied");
  assert.equal(app.externalScripts.length, 0);
});

test("accepting analytics loads the configured container with denied ad consent and sanitized event data", () => {
  const app = boot();
  const accept = app.findAction("accept");
  assert.ok(accept);
  accept.dispatch("click");

  assert.equal(app.storage.getItem("scholarship-scout.analytics-consent.v1"), "granted");
  assert.equal(app.externalScripts.length, 1);
  assert.equal(app.externalScripts[0].src, "https://www.googletagmanager.com/gtm.js?id=GTM-T6NTTR5X");

  const commands = app.window.dataLayer.filter(Array.isArray).map((args) => Array.from(args));
  const defaultConsent = commands.find((args) => args[0] === "consent" && args[1] === "default");
  const updatedConsent = commands.find((args) => args[0] === "consent" && args[1] === "update");
  assert.equal(defaultConsent[2].analytics_storage, "denied");
  assert.equal(defaultConsent[2].ad_storage, "denied");
  assert.equal(defaultConsent[2].ad_user_data, "denied");
  assert.equal(defaultConsent[2].ad_personalization, "denied");
  assert.equal(updatedConsent[2].analytics_storage, "granted");
  assert.equal(updatedConsent[2].ad_storage, "denied");
  assert.equal(updatedConsent[2].ad_user_data, "denied");
  assert.equal(updatedConsent[2].ad_personalization, "denied");

  const pageView = app.window.dataLayer.find((entry) => entry?.event === "scout_page_view");
  assert.deepEqual(JSON.parse(JSON.stringify(pageView)), {
    event: "scout_page_view",
    page_type: "scholarship_guides",
  });
  assert.ok(!JSON.stringify(app.window.dataLayer).includes("must-not-be-sent"));
  const pageContext = commands.find((args) => args[0] === "set" && typeof args[1] === "object");
  assert.equal(pageContext[1].page_location, "https://scholarship-scout.org/");
  assert.equal(pageContext[1].page_title, "Scholarship Scout");
  assert.equal(pageContext[1].page_referrer, "");
});

test("the current app section is buffered without sending data before consent", () => {
  const app = boot({ pageType: "app" });
  app.window.dispatchEvent({
    type: "scholarship-scout:page-view",
    detail: { pageType: "settings" },
  });
  assert.equal(app.externalScripts.length, 0);
  assert.equal(app.window.dataLayer.length, 0);

  app.findAction("accept").dispatch("click");
  const event = app.window.dataLayer.find((entry) => entry?.event === "scout_page_view");
  assert.deepEqual(JSON.parse(JSON.stringify(event)), {
    event: "scout_page_view",
    page_type: "settings",
  });
});

test("storage failures fail closed and do not load the external tag", () => {
  const app = boot({ storageThrows: true });
  app.findAction("accept").dispatch("click");
  assert.equal(app.externalScripts.length, 0);
  assert.ok(JSON.stringify(app.body.children).includes("Analytics will remain off"));
});

test("all public guide pages use fixed page categories and the same first-party consent controller", async () => {
  const pages = [
    ["api-docs.html", "api_docs"],
    ["scholarship-guides/index.html", "scholarship_guides"],
    ["scholarship-guides/high-school-juniors.html", "high_school_juniors"],
    ["scholarship-guides/texas-scholarships.html", "texas_scholarships"],
    ["scholarship-guides/scholarships-by-gpa.html", "scholarships_by_gpa"],
    ["scholarship-guides/scholarships-by-major.html", "scholarships_by_major"],
  ];
  for (const [path, pageType] of pages) {
    const html = await readFile(new URL("../public/" + path, import.meta.url), "utf8");
    assert.match(html, new RegExp('<body data-analytics-page-type="' + pageType + '">'));
    assert.match(html, /<script defer src="\\/analytics-consent\\.js"><\\/script>/);
    assert.match(html, /href="\\/analytics-consent\\.css"/);
  }
});

test("the Privacy Notice discloses third-party analytics and excludes student data", async () => {
  const terms = await readFile(new URL("../src/legal/terms.ts", import.meta.url), "utf8");
  const acceptance = await readFile(new URL("../src/legal/acceptance.js", import.meta.url), "utf8");
  assert.match(terms, /Optional Google Analytics measurement is off by default/);
  assert.match(terms, /Any optional analytics choice for a person under 18/);
  assert.match(terms, /account identifiers, page URLs, page titles, or referrers/);
  assert.match(acceptance, /2026-11-28\\.9/);
});

test("page-view events accept only predefined page categories", () => {
  const app = boot({ storedConsent: "granted" });
  app.window.dispatchEvent({
    type: "scholarship-scout:page-view",
    detail: { pageType: "student-email-or-scholarship-search-query" },
  });
  assert.equal(app.window.dataLayer.some((entry) => entry?.event === "scout_page_view" && entry.page_type === "student-email-or-scholarship-search-query"), false);
});

test("stored consent does not activate GTM on non-production preview hosts", () => {
  const app = boot({ storedConsent: "granted", hostname: "scholarship-scout-standalone-git-feature.vercel.app" });
  assert.equal(app.externalScripts.length, 0);
  assert.equal(app.window.dataLayer.length, 0);
});

test("the persistent privacy control opens settings and revocation disables analytics before reload", () => {
  const app = boot({ storedConsent: "granted" });
  assert.equal(app.externalScripts.length, 1);
  app.window.dispatchEvent({ type: "scholarship-scout:manage-analytics" });
  const revoke = app.findAction("decline", app.registry.get("scout-analytics-preferences"));
  assert.ok(revoke);
  revoke.dispatch("click");

  assert.equal(app.storage.getItem("scholarship-scout.analytics-consent.v1"), "denied");
  const deniedUpdate = app.window.dataLayer.filter(Array.isArray)
    .map((args) => Array.from(args))
    .find((args) => args[0] === "consent" && args[1] === "update" && args[2].analytics_storage === "denied");
  assert.ok(deniedUpdate);
  assert.equal(app.window.location.reloadCount, 1);
});

test("the app keeps analytics off by default and includes a Settings route to reopen privacy choices", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(html, /<script defer src="\/analytics-consent\.js"><\/script>/);
  assert.match(main, /AnalyticsConsentManager/);
  assert.match(app, /scholarship-scout:manage-analytics/);
  assert.match(app, /trackAnalyticsPageView\(tab\)/);
});

test("the strict application CSP permits only the GTM and GA endpoints needed for the consented tag", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? "";
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /https:\/\/www\.google-analytics\.com/);
  assert.doesNotMatch(csp, /script-src \*/);
});
