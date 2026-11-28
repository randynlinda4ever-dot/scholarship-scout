import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const routeSpecs = [
  ["public/scholarship-guides/index.html", "https://scholarship-scout.org/scholarship-guides/", /scholarship guides for students/i],
  ["public/scholarship-guides/high-school-juniors.html", "https://scholarship-scout.org/scholarship-guides/high-school-juniors/", /scholarships for high-school juniors/i],
  ["public/scholarship-guides/texas-scholarships.html", "https://scholarship-scout.org/scholarship-guides/texas-scholarships/", /scholarships and financial aid for texas students/i],
  ["public/scholarship-guides/scholarships-by-gpa.html", "https://scholarship-scout.org/scholarship-guides/scholarships-by-gpa/", /scholarships based on gpa/i],
  ["public/scholarship-guides/scholarships-by-major.html", "https://scholarship-scout.org/scholarship-guides/scholarships-by-major/", /scholarships by college major/i],
];

test("the app shell has descriptive, indexable metadata and a canonical URL", async () => {
  const html = await read("index.html");
  assert.match(html, /<title>Scholarship Scout[^<]*<\/title>/i);
  assert.match(html, /<meta name="description" content="[^"]+"/i);
  assert.match(html, /<meta name="robots" content="index,follow"/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/scholarship-scout\.org\/"/i);
  assert.match(html, /property="og:title"/i);
});

test("every public guide is static, unique, crawlable, and has valid structured data", async () => {
  const canonicals = new Set();
  const normalizedBodies = new Set();
  for (const [path, canonical, keyword] of routeSpecs) {
    const html = await read(path);
    assert.match(html, /<title>[^<]+<\/title>/i, path);
    assert.match(html, /<meta name="description" content="[^"]+"/i, path);
    assert.match(html, /<meta name="robots" content="index,follow"/i, path);
    assert.ok(html.includes('<link rel="canonical" href="' + canonical + '">'), path);
    assert.match(html, /<h1\b[^>]*>/i, path);
    assert.match(html, keyword, path);
    assert.match(html, /application\/ld\+json/i, path);
    assert.match(html, /Scholarship Scout/i, path);
    assert.match(html, /research leads/i, path);
    assert.match(html, /official (?:scholarship )?(sponsor|provider)/i, path);
    assert.match(html, /href="\/scholarship-guides\//i, path);
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
    assert.ok(jsonLd, path + " structured data missing");
    assert.doesNotThrow(() => JSON.parse(jsonLd), path + " structured data must be valid JSON");
    canonicals.add(canonical);
    const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
    const normalized = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
    assert.ok(!normalizedBodies.has(normalized), path + " should have distinct content");
    normalizedBodies.add(normalized);
  }
  assert.equal(canonicals.size, routeSpecs.length);
});

test("robots.txt permits public guides and advertises the XML sitemap", async () => {
  const robots = await read("public/robots.txt");
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Allow:\s*\//);
  assert.match(robots, /Sitemap:\s*https:\/\/scholarship-scout\.org\/sitemap\.xml/i);
});

test("sitemap.xml lists only canonical public pages", async () => {
  const xml = await read("public/sitemap.xml");
  assert.match(xml, /<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  for (const [, canonical] of routeSpecs) {
    assert.ok(xml.includes("<loc>" + canonical + "</loc>"), "missing " + canonical);
  }
  assert.ok(xml.includes("<loc>https://scholarship-scout.org/</loc>"));
  assert.equal((xml.match(/<url>/g) ?? []).length, routeSpecs.length + 1);
});

test("Vercel routes public guides before the private-workspace SPA catch-all", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const rewrites = config.rewrites ?? [];
  const guidePaths = [
    ["/scholarship-guides/", "/scholarship-guides/index.html"],
    ["/scholarship-guides/high-school-juniors/", "/scholarship-guides/high-school-juniors.html"],
    ["/scholarship-guides/texas-scholarships/", "/scholarship-guides/texas-scholarships.html"],
    ["/scholarship-guides/scholarships-by-gpa/", "/scholarship-guides/scholarships-by-gpa.html"],
    ["/scholarship-guides/scholarships-by-major/", "/scholarship-guides/scholarships-by-major.html"],
  ];
  for (const [source, destination] of guidePaths) {
    assert.ok(rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === destination), source);
  }
  const appFallback = rewrites.at(-1);
  assert.ok(appFallback, "SPA fallback must remain configured");
  assert.match(appFallback.source, /scholarship-guides/, "SPA catch-all must exclude the public guide routes");
  const fallbackPattern = new RegExp("^" + appFallback.source + "$");
  assert.ok(fallbackPattern.test("/tracker"), "ordinary app routes should use the SPA fallback");
  assert.ok(!fallbackPattern.test("/scholarship-guides/texas-scholarships/"), "guide routes should not be sent to the SPA");
  assert.ok(!fallbackPattern.test("/assets/app.js"), "asset paths should not be sent to the SPA");
  assert.ok(!fallbackPattern.test("/robots.txt"), "file paths should not be sent to the SPA");
  assert.ok(rewrites.indexOf(appFallback) > rewrites.findIndex((rewrite) => rewrite.source === guidePaths[0][0]));
});

test("legal preflight links to public guides without removing the consent gate", async () => {
  const bootstrap = await read("src/bootstrap.ts");
  assert.match(bootstrap, /Browse free scholarship guides/i);
  assert.match(bootstrap, /href\s*=\s*["']\/scholarship-guides\/["']/i);
  assert.match(bootstrap, /hasCurrentAcceptance\(\)/);
  assert.match(bootstrap, /renderLegalGate\(\)/);
});

test("public guides preserve the actual discovery privacy boundary", async () => {
  const [profile, api, texas, gpa, major] = await Promise.all([
    read("src/lib/liveDiscoveryProfile.js"),
    read("src/lib/scholarshipApi.ts"),
    read("public/scholarship-guides/texas-scholarships.html"),
    read("public/scholarship-guides/scholarships-by-gpa.html"),
    read("public/scholarship-guides/scholarships-by-major.html"),
  ]);
  const projectedFields = profile.match(/return\s*\{([\s\S]*?)\n\s*\};/)?.[1] ?? "";
  assert.match(projectedFields, /state:/);
  assert.match(projectedFields, /graduationYear:/);
  assert.doesNotMatch(projectedFields, /\b(?:gpa|school|plannedMajor|activities|email)\s*:/i);
  assert.match(api, /const safeProfile = pickLiveDiscoveryProfile\(profile\)/);
  assert.match(api, /body: \{ profile: safeProfile, categories \}/);
  assert.match(gpa, /GPA.*(?:not sent|stays local|remains local|is not included)/i);
  assert.match(major, /major.*(?:not sent|local|not included)/i);
  assert.match(texas, /Texas Higher Education Coordinating Board/);
  assert.match(texas, /residency alone does not make every student eligible/i);
});

