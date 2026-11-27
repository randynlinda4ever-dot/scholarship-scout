import test from "node:test";
import assert from "node:assert/strict";
import { assessEligibility } from "../src/eligibility.js";

const sourceUrl = "https://nationalspanishexam.org/awards/students/senior-scholarship/";
const assess = (criteria, profile) => assessEligibility({
  criteria,
  sourceUrl,
  criteriaEvidence: Object.fromEntries(Object.keys(criteria).map((key) => [key, {
    excerpt: `Synthetic sponsor rule for ${key}.`,
    sourceUrl: `https://nationalspanishexam.org/awards/students/senior-scholarship/#${key}`,
  }])),
}, profile, new Date("2026-11-24T12:00:00"));

test("confirmed SHH membership does not satisfy separate NSE/NPE medal-year requirements", () => {
  const result = assess(
    { requiresShhMembership: true, requiredNseMedalYears: [2025, 2026] },
    {
      shhMembershipStatus: "Confirmed active member in good standing",
      nseMedalYears: "Not recorded",
    },
  );

  assert.equal(result.checks.find((item) => item.label === "SHH membership")?.outcome, "pass");
  assert.deepEqual(
    result.checks.filter((item) => item.label.startsWith("NSE/NPE medal")).map((item) => item.outcome),
    ["unknown", "unknown"],
  );
  assert.equal(result.status, "Needs information");
});

test("organization membership and good-standing activity text are not medal evidence", () => {
  const result = assess(
    { requiredMembership: "Synthetic Honor Society", requiredNseMedalYears: [2025] },
    {
      activities: "Synthetic Honor Society member in good standing; participated in the language exam",
      nseMedalYears: "",
    },
  );

  assert.equal(result.checks.find((item) => item.label === "Organization membership")?.outcome, "pass");
  assert.equal(result.checks.find((item) => item.label === "NSE/NPE medal — 2025")?.outcome, "unknown");
  assert.equal(result.failed, 0);
});

test("negative medal statements cannot count a year as an earned medal", () => {
  const result = assess(
    { requiredNseMedalYears: [2025, 2026] },
    { nseMedalYears: "No medal in 2025, but earned a medal in 2026" },
  );
  assert.equal(result.checks.find((item) => item.label === "NSE/NPE medal — 2025")?.outcome, "fail");
  assert.equal(result.checks.find((item) => item.label === "NSE/NPE medal — 2026")?.outcome, "pass");
});

test("confirmed medal wording is not mistaken for a pending confirmation", () => {
  const result = assess(
    { requiredNseMedalYears: [2025, 2026] },
    { nseMedalYears: "Confirmed medals in 2025 and 2026" },
  );
  assert.deepEqual(
    result.checks.filter((item) => item.label.startsWith("NSE/NPE medal")).map((item) => item.outcome),
    ["pass", "pass"],
  );
});

test("negative qualifiers override a leading yes or confirmed membership status", () => {
  const cases = [
    [{ requiresShhMembership: true }, { shhMembershipStatus: "Confirmed but inactive" }, "SHH membership"],
    [{ requiresSpanishAchievement: true }, { spanishAchievementStatus: "Yes, but not confirmed" }, "Spanish achievement"],
    [{ requiresNseRegistration2027: true }, { nseRegistered2027: "Yes, but not registered" }, "NSE/NPE 2026/27 participation"],
    [{ requiresFourHMembership: true }, { fourHMembershipStatus: "Confirmed but inactive" }, "4-H membership"],
    [{ requiresFirstGeneration: true }, { firstGeneration: "Yes, but not first-generation" }, "First-generation status"],
  ];
  for (const [criteria, profile, label] of cases) {
    const result = assess(criteria, profile);
    assert.equal(result.checks.find((item) => item.label === label)?.outcome, "unknown", label);
  }
});

test("confirmed membership does not establish a separately required Spanish achievement", () => {
  const result = assess(
    { requiresShhMembership: true, requiresSpanishAchievement: true },
    {
      shhMembershipStatus: "Confirmed active member in good standing",
      spanishAchievementStatus: "Not confirmed",
    },
  );

  assert.equal(result.checks.find((item) => item.label === "SHH membership")?.outcome, "pass");
  assert.equal(result.checks.find((item) => item.label === "Spanish achievement")?.outcome, "unknown");
  assert.equal(result.failed, 0);
  assert.equal(result.status, "Needs information");
});
