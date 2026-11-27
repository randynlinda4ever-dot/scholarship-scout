import test from "node:test";
import assert from "node:assert/strict";
import { buildScholarshipQueries, isSafeHttpsUrl, normalizeExaResults, pickMatchingProfile, DISCOVERY_CATEGORY_OPTIONS } from "../src/lib/discovery.js";

const profile = {
  state: "Oregon", county: "Sample County", district: "Example District",
  school: "Example High School", grade: "High school senior", graduationYear: "2027",
  plannedMajor: "Environmental science", interests: "community ecology",
  email: "private@example.com", phone: "5550100", ssn: "000000000", familyIncome: "123456",
};

test("query cleanup preserves ordinary words and removes repeated whitespace", () => {
  const [result] = buildScholarshipQueries({
    state: "Oregon", county: "Sample County", grade: "High school senior", graduationYear: "2027",
  }, ["local"]);
  assert.match(result.query, /Oregon/);
  assert.match(result.query, /scholarships/);
  assert.match(result.query, /community foundations/);
  assert.doesNotMatch(result.query, /\\s{2,}/);
});

test("builds generic local and school resource searches from user-entered fields", () => {
  const queries = buildScholarshipQueries(profile, ["local", "school_resources"]);
  assert.equal(queries.length, 2);
  assert.match(queries[0].query, /Sample County/);
  assert.match(queries[1].query, /Example High School Example District/);
  assert.match(queries[1].query, /scholarship/i);
});

test("school resource searches remain generic when no school or district is entered", () => {
  const queries = buildScholarshipQueries({}, ["school_resources"]);
  assert.equal(queries.length, 1);
  assert.match(queries[0].query, /school-based scholarships/i);
  assert.doesNotMatch(queries[0].query, /Example|Example District|district-name/i);
});

test("the category catalogue contains no school or organization-specific defaults", () => {
  const ids = DISCOVERY_CATEGORY_OPTIONS.map((item) => item.id);
  for (const forbidden of ["example_district_id", "shh", "nse_npe", "texas_4h"]) assert.equal(ids.includes(forbidden), false);
  for (const required of ["local", "school_resources", "regional", "state", "academic", "humanities", "leadership", "community_service", "language", "employment", "arts", "incoming_college", "national", "general"]) {
    assert.equal(ids.includes(required), true, "missing category: " + required);
  }
});

test("ignores unsupported discovery categories", () => {
  assert.deepEqual(buildScholarshipQueries(profile, ["made_up_category", "example_district_id"]), []);
});

test("does not send school, district, academic, contact, or sensitive profile data in live matching payload", () => {
  const safe = pickMatchingProfile({ ...profile, gpa: "3.9", classRank: "1 of 100", familyIncome: "$90,000", streetAddress: "private address" });
  assert.deepEqual(safe, { state: "Oregon", graduationYear: "2027" });
});

test("keeps applicant age local and excludes it from the public matching payload", () => {
  const safe = pickMatchingProfile({ state: "Oregon", graduationYear: "2027", age: "17" });
  assert.deepEqual(safe, { state: "Oregon", graduationYear: "2027" });
  assert.equal(Object.hasOwn(safe, "age"), false);
});

test("accepts only public HTTPS source URLs", () => {
  assert.equal(isSafeHttpsUrl("https://www.careeronestop.org/Toolkit/Training/find-scholarships.aspx"), true);
  assert.equal(isSafeHttpsUrl("http://example.org/scholarship"), false);
  assert.equal(isSafeHttpsUrl("https://localhost/scholarship"), false);
  assert.equal(isSafeHttpsUrl("https://127.0.0.1/private"), false);
  assert.equal(isSafeHttpsUrl("https://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafeHttpsUrl("https://user:pass@example.org/"), false);
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
});

test("normalizes valid web results and drops unsafe or malformed URLs", () => {
  const results = normalizeExaResults([
    { title: "Student Opportunity Scholarship", url: "https://example.org/scholarship", text: "A scholarship for students.", publishedDate: "2026-10-01" },
    { title: "Unsafe", url: "http://127.0.0.1/admin", text: "ignore" },
    { title: "No URL", text: "missing url" },
  ], "general");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Student Opportunity Scholarship");
  assert.equal(results[0].sourceCategory, "general");
  assert.equal(results[0].sourceVerified, false);
  assert.equal(results[0].sourceAuthority, "unverified-lead");
  assert.match(results[0].excerpt, /scholarship/);
});

test("normalizes legacy web-result URLs before exposing them", () => {
  const [result] = normalizeExaResults([{
    title: "Synthetic Student Award",
    url: "https://example.org/award?page=4&email=student%40example.test&token=secret#access_token=fragment-secret",
    text: "Synthetic result",
  }]);
  assert.equal(result.sourceUrl, "https://example.org/award?page=4");
  assert.equal(result.domain, "example.org");
});

test("rejects IPv6 and public-literal IP hosts from web sources", () => {
  assert.equal(isSafeHttpsUrl("https://[::1]/admin"), false);
  assert.equal(isSafeHttpsUrl("https://93.184.216.34/scholarship"), false);
});
