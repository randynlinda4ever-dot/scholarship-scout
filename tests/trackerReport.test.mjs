import test from "node:test";
import assert from "node:assert/strict";
import { buildTrackerCsvReport } from "../src/lib/trackerReport.js";

test("builds a CSV report with application and eligibility kept separate", () => {
  const csv = buildTrackerCsvReport([
    {
      id: "s1", name: "Example Scholarship", provider: "Example Foundation",
      award: "$1,000", deadline: "2027-05-01", applicationStatus: "Preparing",
      priority: "High", tags: ["local", "history"], archived: false,
    },
  ], new Map([["s1", { status: "Needs information" }]]), () => "needs-review");

  assert.match(csv, /Scholarship,Sponsor,Award,Deadline,Application status,Priority,Eligibility status,Source review,Tags,Archived/);
  assert.match(csv, /Example Scholarship,Example Foundation/);
  assert.match(csv, /Preparing,High,Needs information,needs-review/);
  assert.match(csv, /local; history/);
});

test("quotes commas, quotes, and line breaks using CSV rules", () => {
  const csv = buildTrackerCsvReport([
    { id: "s1", name: 'Award, "A"', provider: "Foundation\nNorth", tags: [] },
  ], new Map(), () => "unverified");
  assert.match(csv, /"Award, ""A""","Foundation\nNorth"/);
});

test("neutralizes spreadsheet formula prefixes in user-controlled text fields", () => {
  const csv = buildTrackerCsvReport([
    { id: "s1", name: "=HYPERLINK(\"https://example.com\",\"open\")", provider: "@SUM(1,2)", tags: [] },
  ], new Map(), () => "unverified");
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'@SUM/);
});
