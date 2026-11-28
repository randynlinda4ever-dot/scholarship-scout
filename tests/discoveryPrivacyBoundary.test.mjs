import test from "node:test";
import assert from "node:assert/strict";
import { buildScholarshipQueries } from "../src/lib/discovery.js";
import { pickLiveDiscoveryProfile } from "../src/lib/liveDiscoveryProfile.js";

test("all public search query builders are restricted to broad state and graduation year only", () => {
  const profile = {
    state: "Texas",
    graduationYear: "2027",
    county: "Private County",
    district: "Private District",
    school: "Private High School",
    plannedCollege: "Private University",
    plannedMajor: "Private Major",
    interests: "Private Interest",
    languages: "Private Language",
    careerInterests: "Private Career",
    citizenship: "Private Citizenship",
    searchKeywords: "Private Ranking Keyword",
    gpa: "4.0",
    classRank: "12 of 300",
    activities: "Private Organization",
  };
  const payload = pickLiveDiscoveryProfile(profile);
  assert.deepEqual(Object.keys(payload).sort(), ["graduationYear", "state"]);
  assert.deepEqual(payload, { state: "Texas", graduationYear: "2027" });

  const queries = buildScholarshipQueries(profile, [
    "local", "school_resources", "regional", "state", "academic", "humanities",
    "leadership", "community_service", "language", "employment", "arts",
    "incoming_college", "national", "general",
  ]);
  assert.equal(queries.length, 14);
  const serialized = JSON.stringify(queries);
  for (const privateValue of [
    "Private County", "Private District", "Private High School", "Private University",
    "Private Major", "Private Interest", "Private Language", "Private Career",
    "Private Citizenship", "Private Ranking Keyword", "12 of 300", "Private Organization",
  ]) assert.equal(serialized.includes(privateValue), false, "private field leaked into a query: " + privateValue);
  assert.match(serialized, /Texas/);
  assert.match(serialized, /2027/);
});

test("invalid graduation years are omitted from public query builders", () => {
  const queries = buildScholarshipQueries({ state: "Texas", graduationYear: "2027.5" }, ["state"]);
  assert.equal(queries[0].query.includes("2027.5"), false);
});
