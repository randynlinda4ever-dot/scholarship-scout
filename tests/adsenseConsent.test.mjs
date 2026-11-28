import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/adsense-consent.js", import.meta.url), "utf8");
const configSource = await readFile(new URL("../public/adsense-config.js", import.meta.url), "utf8");
const repo = "randynlinda4ever-dot/scholarship-scout";

function makeNode(tagName, registry) {
  const listeners = new Map();
  const attributes = new Map();
  const node = {
    tagName: tagName.toUpperCase(),
    children: [],
    style: {},
    className: "",
    textContent: "",
    hidden: false,
    checked: false,
    disabled: false,
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

function boot({
  consent = null,
  hostname = "scholarship-scout.org",
  config = { enabled: true, publisherId: "ca-pub-1234567890123456", publicGuideSlotId: "1234567890" },
  storageThrows = false,
  includeSlot = true,
} = {}) {
  const values = new Map();
  if (consent) values.set("scholarship-scout.ads-consent.v1", consent);
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
  if (includeSlot) {
    const slot = makeNode("div", registry);
    slot.id = "scout-public-guide-ad";
    slot.setAttribute("data-scout-ad-slot", "public-guides");
    slot.hidden = true;
    body.appendChild(slot);
  }
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
    location: { hostname, reloadCount: 0, reload() { this.reloadCount += 1; } },
    SCHOLARSHIP_SCOUT_ADS_CONFIG: config,
    adsbygoogle: [],
    addEventListener(type, callback) {
      const callbacks = windowListeners.get(type) || [];
      callbacks.push(callback);
      windowListeners.set(type, callbacks);
    },
  };
  vm.runInNewContext(source, { window, document, Date, URL });
  const findByAttribute = (name, value, root = body) => {
    if (root.getAttribute?.(name) === value) return root;
    for (const child of root.children || []) {
      const found = findByAttribute(name, value, child);
      if (found) return found;
    }
    return null;
  };
  return { window, document, storage, body, externalScripts, findByAttribute, registry };
}

test("AdSense configuration is disabled and contains no invented account identifiers by default", () => {
  const window = {};
  vm.runInNewContext(configSource, { window, Object });
  assert.deepEqual(JSON.parse(JSON.stringify(window.SCHOLARSHIP_SCOUT_ADS_CONFIG)), {
    enabled: false,
    publisherId: "",
    publicGuideSlotId: "",
  });
});

test("AdSense does not load before an explicit adult-authorized choice", () => {
  const app = boot();
  assert.equal(app.externalScripts.length, 0);
  assert.equal(app.storage.getItem("scholarship-scout.ads-consent.v1"), null);
  assert.ok(app.findByAttribute("data-ads-action", "accept"));
});

test("ad requests require the adult confirmation and are non-personalized with teen treatment", () => {
  const app = boot();
  const accept = app.findByAttribute("data-ads-action", "accept");
  const adultConfirmation = app.findByAttribute("data-ads-adult-confirmation", "true");
  assert.ok(accept);
  assert.ok(adultConfirmation);

  accept.dispatch("click");
  assert.equal(app.externalScripts.length, 0, "unchecked adult confirmation must not load AdSense");

  adultConfirmation.checked = true;
  accept.dispatch("click");

  assert.equal(app.storage.getItem("scholarship-scout.ads-consent.v1"), "granted");
  assert.equal(app.externalScripts.length, 1);
  assert.match(app.externalScripts[0].src, /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456$/);
  assert.equal(app.window.adsbygoogle.requestNonPersonalizedAds, 1);

  const slot = app.registry.get("scout-public-guide-ad");
  const ad = slot.children.find((child) => child.tagName === "INS");
  assert.ok(ad);
  assert.equal(ad.getAttribute("data-ad-client"), "ca-pub-1234567890123456");
  assert.equal(ad.getAttribute("data-ad-slot"), "1234567890");
  assert.equal(ad.getAttribute("data-tag-for-age-treatment"), "2");
  assert.equal(app.window.adsbygoogle.length, 1);
});

test("a denied choice never requests advertising scripts", () => {
  const app = boot();
  const decline = app.findByAttribute("data-ads-action", "decline");
  assert.ok(decline);
  decline.dispatch("click");
  assert.equal(app.storage.getItem("scholarship-scout.ads-consent.v1"), "denied");
  assert.equal(app.externalScripts.length, 0);
});

test("stored denial remains off and storage failures fail closed", () => {
  const denied = boot({ consent: "denied" });
  assert.equal(denied.externalScripts.length, 0);
  assert.equal(denied.findByAttribute("data-ads-action", "accept"), null);

  const blockedStorage = boot({ storageThrows: true });
  const checkbox = blockedStorage.findByAttribute("data-ads-adult-confirmation", "true");
  checkbox.checked = true;
  blockedStorage.findByAttribute("data-ads-action", "accept").dispatch("click");
  assert.equal(blockedStorage.externalScripts.length, 0);
});

test("missing publisher or slot configuration leaves advertising disabled", () => {
  for (const config of [
    { enabled: false, publisherId: "ca-pub-1234567890123456", publicGuideSlotId: "1234567890" },
    { enabled: true, publisherId: "", publicGuideSlotId: "1234567890" },
    { enabled: true, publisherId: "ca-pub-1234567890123456", publicGuideSlotId: "" },
  ]) {
    const app = boot({ config, consent: "granted" });
    assert.equal(app.externalScripts.length, 0);
  }
});

test("preview hosts never initialize AdSense, even with saved consent", () => {
  const app = boot({ hostname: "scholarship-scout-standalone-git-feature.vercel.app", consent: "granted" });
  assert.equal(app.externalScripts.length, 0);
});

test("only the six public scholarship-guide pages include a single ad placement", async () => {
  const pages = [
    "scholarship-guides/index.html",
    "scholarship-guides/high-school-juniors.html",
    "scholarship-guides/texas-scholarships.html",
    "scholarship-guides/scholarships-by-gpa.html",
    "scholarship-guides/scholarships-by-major.html",
  ];
  for (const path of pages) {
    const html = await readFile(new URL("../public/" + path, import.meta.url), "utf8");
    assert.equal((html.match(/data-scout-ad-slot="public-guides"/g) || []).length, 1, path);
    assert.match(html, /<script defer src="\/adsense-config\.js"><\/script>/);
    assert.match(html, /<script defer src="\/adsense-consent\.js"><\/script>/);
  }

  const appHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const apiHtml = await readFile(new URL("../public/api-docs.html", import.meta.url), "utf8");
  assert.doesNotMatch(appHtml, /adsbygoogle|adsense-consent\.js/);
  assert.doesNotMatch(apiHtml, /data-scout-ad-slot|adsense-consent\.js/);
});

test("the Privacy Notice explains contextual ads, teen treatment, consent, and remaining ad cookies", async () => {
  const terms = await readFile(new URL("../src/legal/terms.ts", import.meta.url), "utf8");
  const acceptance = await readFile(new URL("../src/legal/acceptance.js", import.meta.url), "utf8");
  assert.match(terms, /non-personalized ads/);
  assert.match(terms, /teen age treatment/);
  assert.match(terms, /frequency capping and aggregated reporting/);
  assert.match(terms, /parent or legal guardian/);
  assert.match(acceptance, /2026-11-28\.10/);
});
