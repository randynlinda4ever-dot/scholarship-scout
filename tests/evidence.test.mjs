import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySourceAuthority,
  getSourceAttribution,
  sanitizePublicHttpsUrl,
  resolveSourceAuthority,
  deduplicateScholarshipRecords,
  deriveSourceStatus,
} from "../src/lib/evidence.js";

const verified = {
  name: "Example Senior Award",
  provider: "Example Foundation",
  award: "$1,000",
  awardEvidenceText: "The sponsor awards $1,000 to selected graduating seniors.",
  awardEvidenceUrl: "https://www.aatspshh.org/student-scholarships#award",
  deadline: "2027-05-03",
  deadlineText: "May 3, 2027; time not stated by sponsor",
  sourceUrl: "https://www.aatspshh.org/student-scholarships",
  sourceAuthority: "official-program",
  sourceVerified: true,
  evidenceText: "The sponsor states graduating seniors may apply.",
  evidenceUrl: "https://www.aatspshh.org/student-scholarships/rules#eligibility",
  lastCheckedDate: "2026-11-09",
};

test("requires sponsor identity, official source, evidence, award, deadline and recent check before verified status", () => {
  assert.equal(deriveSourceStatus(verified, new Date("2026-11-09T12:00:00")), "verified");
  assert.equal(deriveSourceStatus({
    ...verified,
    sourceUrl: "https://unrelated-example.org/award",
    sourceAuthority: "official-sponsor",
  }, new Date("2026-11-09T12:00:00")), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, evidenceText: "" }, new Date("2026-11-09T12:00:00")), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, sourceAuthority: "secondary-directory" }, new Date("2026-11-09T12:00:00")), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, lastCheckedDate: "" }, new Date("2026-11-09T12:00:00")), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, award: "" }, new Date("2026-11-09T12:00:00")), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, sourceUrl: "https://example.local/award" }, new Date("2026-11-09T12:00:00")), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, evidenceUrl: "javascript:alert(1)" }, new Date("2026-11-09T12:00:00")), "needs-review");
});

test("requires a general source excerpt to carry its exact official sponsor page URL", () => {
  const now = new Date("2026-11-09T12:00:00");
  assert.equal(deriveSourceStatus({ ...verified, evidenceUrl: "" }, now), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, evidenceUrl: "https://other.example/rules" }, now), "needs-review");
  assert.equal(deriveSourceStatus({
    ...verified,
    evidenceUrl: "https://aatspshh.org/policies/scholarships#eligibility",
  }, now), "verified");
});

test("requires exact award wording and same-source evidence before a sponsor record can be verified", () => {
  const now = new Date("2026-11-09T12:00:00");
  assert.equal(deriveSourceStatus(verified, now), "verified");
  assert.equal(deriveSourceStatus({ ...verified, awardEvidenceText: "" }, now), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, awardEvidenceUrl: "https://other.example/rules" }, now), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, awardEvidenceUrl: "http://www.aatspshh.org/rules" }, now), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, award: "$2,000" }, now), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, awardCurrencyBasis: "USD" }, now), "needs-review");
  assert.equal(deriveSourceStatus({ ...verified, awardBasis: "per year" }, now), "needs-review");
});

test("requires same-domain criterion evidence before a structured scholarship source can be verified", () => {
  const criteria = { state: "TX" };
  assert.equal(deriveSourceStatus({
    ...verified,
    criteria,
  }, new Date("2026-11-09T12:00:00")), "needs-review");

  assert.equal(deriveSourceStatus({
    ...verified,
    criteria,
    criteriaEvidence: {
      state: {
        excerpt: "Applicants must be Texas residents.",
        sourceUrl: "https://aatspshh.org/rules#residency",
      },
    },
  }, new Date("2026-11-09T12:00:00")), "verified");

  assert.equal(deriveSourceStatus({
    ...verified,
    criteria,
    criteriaEvidence: {
      state: {
        excerpt: "Applicants must be Texas residents.",
        sourceUrl: "https://nationalspanishexam.org/rules",
      },
    },
  }, new Date("2026-11-09T12:00:00")), "needs-review");
});

test("marks a past dated deadline expired but never invents expiry for a missing deadline", () => {
  assert.equal(deriveSourceStatus({ ...verified, deadline: "2026-11-03" }, new Date("2026-11-09T12:00:00")), "expired");
  assert.equal(deriveSourceStatus({ ...verified, deadline: "", deadlineNotPublished: true }, new Date("2026-11-09T12:00:00")), "verified");
  assert.equal(deriveSourceStatus({ ...verified, lastCheckedDate: "2026-09-01" }, new Date("2026-11-09T12:00:00")), "needs-review");
});

test("keeps impossible structured deadlines unconfirmed even when sponsor wording describes a rolling or unpublished cycle", async () => {  const { normalizeScholarshipRecord, getEvidenceCompleteness } = await import("../src/lib/evidence.js");
  const now = new Date("2026-11-20T12:00:00.000Z");
  const rollingWording = "Applications are reviewed on a rolling basis; no fixed closing date is published.";

  const malformed = normalizeScholarshipRecord({
    ...verified,
    deadline: "2027-02-30",
    deadlineText: rollingWording,
  }, now);
  assert.equal(malformed.deadline, "2027-02-30", "the impossible sponsor date must not be silently normalized");
  assert.equal(malformed.sourceStatus, "needs-review");
  assert.equal(malformed.sourceVerified, false);
  assert.equal(getEvidenceCompleteness(malformed, now).checks.find((item) => item.label === "Deadline evidence").complete, false);

  const contradictoryNoDate = normalizeScholarshipRecord({
    ...verified,
    deadline: "2027-02-30",
    deadlineText: "No deadline published by sponsor",
    deadlineNotPublished: true,
  }, now);
  assert.equal(contradictoryNoDate.sourceStatus, "needs-review");
  const genuinelyDateFree = normalizeScholarshipRecord({
    ...verified,
    deadline: "",
    deadlineText: rollingWording,
  }, now);
  assert.equal(genuinelyDateFree.sourceStatus, "verified");
});

test("shared HTTPS URL validation rejects local, private, credentialed, and malformed host variants", async () => {
  const { isSafeHttpsUrl } = await import("../src/lib/evidence.js");
  for (const url of [
    "http://example.org",
    "https://user:pass@example.org",
    "https://localhost/award",
    "https://sub.localhost/award",
    "https://example.local/award",
    "https://service.internal/award",
    "https://metadata.google.internal/",
    "https://127.0.0.1/award",
    "https://10.0.0.1/award",
    "https://192.168.1.1/award",
    "https://169.254.169.254/latest/meta-data/",
    "https://2130706433/award",
    "https://0x7f000001/award",
    "https://[::1]/award",
    "https://[fe80::1]/award",
    "https://example..org/award",
    "https://-bad.example/award",
  ]) assert.equal(isSafeHttpsUrl(url), false, url);

  for (const url of [
    "https://example.org/award",
    "https://sub.example.org/rules",
    "https://nationalspanishexam.org/awards",
  ]) assert.equal(isSafeHttpsUrl(url), true, url);
});

test("sanitizes public URLs by removing fragments, tracking fields, and private query values", () => {
  assert.equal(
    sanitizePublicHttpsUrl("https://example.org/award?page=2&email=student%40example.test&phone=2545550100&token=secret&utm_source=fixture#access_token=fragment-secret"),
    "https://example.org/award?page=2",
  );
  assert.equal(sanitizePublicHttpsUrl("https://example.org/rules#minimum-gpa"), "https://example.org/rules#minimum-gpa");
  assert.equal(sanitizePublicHttpsUrl("javascript:alert(1)"), null);
  assert.equal(sanitizePublicHttpsUrl("https://127.0.0.1/private"), null);
});

test("attributes only recognized sponsor, program, and school domains as official sources", () => {
  assert.deepEqual(getSourceAttribution("https://apply.jkcf.org/scholarships"), {
    authority: "official-sponsor", label: "Official sponsor website", linkLabel: "Open sponsor website",
  });
  assert.deepEqual(getSourceAttribution("https://nationalspanishexam.org/awards"), {
    authority: "official-program", label: "Official scholarship program website", linkLabel: "Open program website",
  });
  assert.deepEqual(getSourceAttribution("https://tarleton.edu/scholarships"), {
    authority: "official-school", label: "Official school / district website", linkLabel: "Open school source",
  });
  assert.deepEqual(getSourceAttribution("https://example-directory.org/award"), {
    authority: "unverified-lead", label: "Sponsor not confirmed", linkLabel: "Open source page",
  });
  assert.equal(getSourceAttribution("http://jkcf.org/award").authority, "unverified-lead");
  assert.equal(getSourceAttribution("not a URL").authority, "unverified-lead");
});

test("classifies only explicitly recognized sponsor and school domains as official", () => {
  assert.equal(classifySourceAuthority("https://www.aatspshh.org/student-scholarships"), "official-program");
  assert.equal(classifySourceAuthority("https://nationalspanishexam.org/awards/students/senior-scholarship/"), "official-program");
  assert.equal(classifySourceAuthority("https://texas4hfoundation.org/about-scholarships/"), "official-program");
  assert.equal(classifySourceAuthority("https://example-directory.org/listing"), "unverified-lead");
  assert.equal(classifySourceAuthority("http://example.org/listing"), "unverified-lead");
});

test("recognizes named government hosts and the restricted .gov suffix without trusting lookalikes", () => {
  assert.equal(classifySourceAuthority("https://studentaid.gov/scholarships"), "official-government");
  assert.equal(classifySourceAuthority("https://studentaid.gov.example/award"), "unverified-lead");
  assert.equal(classifySourceAuthority("https://notstudentaid.gov/award"), "official-government");
  assert.equal(classifySourceAuthority("https://unlisted-agency.gov/award"), "official-government");
  assert.equal(classifySourceAuthority("http://studentaid.gov/award"), "unverified-lead");
});

test("attributes recognized government domains and their subdomains without trusting lookalikes", () => {
  assert.deepEqual(getSourceAttribution("https://fsapartners.ed.gov/knowledge-center"), {
    authority: "official-government",
    label: "Official government website",
    linkLabel: "Open government source",
  });
  assert.equal(getSourceAttribution("https://grants.gov/search").authority, "official-government");
  assert.equal(getSourceAttribution("https://grants.gov.attacker.example/search").authority, "unverified-lead");
});

test("government authority is derived from the exact recognized source and can support evidence verification", () => {
  const governmentRecord = {
    ...verified,
    sourceUrl: "https://studentaid.gov/scholarships",
    sourceAuthority: "official-government",
    evidenceUrl: "https://studentaid.gov/scholarships/eligibility",
    awardEvidenceUrl: "https://studentaid.gov/scholarships/award",
  };
  assert.equal(resolveSourceAuthority(governmentRecord), "official-government");
  assert.equal(deriveSourceStatus(governmentRecord, new Date("2026-11-09T12:00:00")), "verified");
  assert.equal(resolveSourceAuthority({
    sourceUrl: "https://unlisted-agency.gov/award",
    sourceAuthority: "official-government",
    sourceVerified: true,
  }), "official-government");
});

test("derives trusted authority from the source URL instead of a conflicting explicit label", () => {
  assert.equal(resolveSourceAuthority({
    sourceUrl: "https://www.tarleton.edu/becomeatexan/guaranteed-scholarship-program/",
    sourceVerified: true,
  }), "official-school");
  assert.equal(resolveSourceAuthority({
    sourceUrl: "https://www.tarleton.edu/award",
    sourceAuthority: "official-sponsor",
  }), "official-school");
  assert.equal(resolveSourceAuthority({
    sourceUrl: "https://apply.jkcf.org/scholarships",
    sourceAuthority: "official-program",
  }), "official-sponsor");});

test("does not let a directory inherit official authority from linked organization metadata", () => {
  assert.equal(resolveSourceAuthority({
    sourceUrl: "https://synthetic-scholarship-directory.example/listing",
    discoverySourceUrl: "https://jkcf.org/scholarships",
    linkedOrganizationUrl: "https://jkcf.org",
    sourceAuthority: "official-sponsor",
    sourceVerified: false,
  }), "secondary-directory");
});

test("normalizes aggregator records to a directory or unverified authority, never official sponsor", async () => {
  const { normalizeScholarshipRecord } = await import("../src/lib/evidence.js");
  const directoryRecord = normalizeScholarshipRecord({
    ...verified,
    sourceUrl: "https://synthetic-aggregator.example/award",
    discoverySourceUrl: "https://jkcf.org/scholarships",
    sourceAuthority: "official-sponsor",
    sourceVerified: false,
  }, new Date("2026-11-09T12:00:00"));

  assert.equal(directoryRecord.sourceAuthority, "secondary-directory");
  assert.equal(directoryRecord.sourceVerified, false);
  assert.equal(directoryRecord.sourceStatus, "needs-review");
  assert.equal(getSourceAttribution(directoryRecord.sourceUrl).authority, "unverified-lead");
});

test("does not mistake a discovery date for a sponsor verification date", async () => {
  const { normalizeScholarshipRecord } = await import("../src/lib/evidence.js");
  const item = normalizeScholarshipRecord({
    ...verified,
    lastCheckedDate: "",
    discoveredOn: "2026-11-09",
  }, new Date("2026-11-09T12:00:00"));
  assert.equal(item.lastCheckedDate, "");
  assert.equal(item.sourceVerified, false);
  assert.equal(item.sourceStatus, "needs-review");
});

test("deduplicates the same award without collapsing different awards hosted on one official page", () => {
  const records = [
    { ...verified, id: "lead-1", sourceVerified: false, evidenceText: "" },
    { ...verified, id: "official-1" },
    { ...verified, name: "Different Travel Award", id: "other-award" },
  ];
  const unique = deduplicateScholarshipRecords(records);
  assert.equal(unique.length, 2);
  assert.equal(unique.find((item) => item.name === "Example Senior Award").id, "official-1");
  assert.equal(unique.some((item) => item.name === "Different Travel Award"), true);
});

test("deduplicates same-cycle records but preserves separate annual and unconfirmed cycles", () => {
  const records = [
    { ...verified, id: "cycle-2027-a", name: "Recurring Senior Award", deadline: "2027-03-01", sourceVerified: false, evidenceText: "" },
    { ...verified, id: "cycle-2027-b", name: "Recurring Senior Award", deadline: "2027-04-15", sourceVerified: true, evidenceText: "More complete sponsor evidence." },
    { ...verified, id: "cycle-2028", name: "Recurring Senior Award", deadline: "2028-03-01" },
    { ...verified, id: "cycle-unknown-a", name: "Recurring Senior Award", deadline: "" },    { ...verified, id: "cycle-unknown-b", name: "Recurring Senior Award", deadline: "" },
  ];

  const unique = deduplicateScholarshipRecords(records);

  assert.deepEqual(unique.map((item) => item.id), [
    "cycle-2027-b",
    "cycle-2028",
    "cycle-unknown-a",
    "cycle-unknown-b",
  ]);
});

test("preserves records without enough identity to safely classify their cycle", () => {
  const records = [
    { ...verified, id: "missing-sponsor-a", provider: "", deadline: "2027-03-01" },
    { ...verified, id: "missing-sponsor-b", provider: "", deadline: "2027-04-15" },
    { ...verified, id: "invalid-date", deadline: "annual" },
  ];

  const unique = deduplicateScholarshipRecords(records);
  assert.deepEqual(unique.map((item) => item.id), [
    "missing-sponsor-a",
    "missing-sponsor-b",
    "invalid-date",
  ]);
});

test("normalizes records without destructively merging distinct tracker records", async () => {
  const { normalizeScholarshipRecords } = await import("../src/lib/evidence.js");
  const records = [
    { ...verified, id: "application-a", name: "Same Award", deadline: "2027-05-03" },
    { ...verified, id: "application-b", name: "Same Award", deadline: "2027-05-03" },
    { ...verified, id: "no-deadline-a", name: "Another Award", deadline: "" },
    { ...verified, id: "no-deadline-b", name: "Another Award", deadline: "" },
  ];

  const normalized = normalizeScholarshipRecords(records, new Date("2026-11-09T12:00:00"));
  assert.deepEqual(normalized.map((item) => item.id), [
    "application-a", "application-b", "no-deadline-a", "no-deadline-b",
  ]);
});

test("does not treat an SHH membership claim as NSE/NPE medal evidence", async () => {
  const { assessEligibility } = await import("../src/eligibility.js");
  const assessment = assessEligibility({
    criteria: { requiredNseMedalYears: [2025, 2026], requiresNseRegistration2027: true },
    sourceUrl: "https://nationalspanishexam.org/awards/students/senior-scholarship/",
    sourceVerified: true,
    evidenceText: "NSE/NPE medals in the 2024/25 and 2025/26 exams and 2026/27 exam participation are required.",
  }, {
    grade: "High school senior",
    graduationYear: "2027",
    shhMembershipStatus: "Confirmed active member in good standing",
    nseMedalYears: "Not recorded",
    nseRegistered2027: "Not confirmed",
  }, new Date("2026-11-09T12:00:00"));
  assert.equal(assessment.checks.filter((item) => item.label.startsWith("NSE/NPE medal")).every((item) => item.outcome === "unknown"), true);
  assert.equal(assessment.checks.find((item) => item.label === "NSE/NPE 2026/27 participation").outcome, "unknown");
});

test("uses an explicit sponsor time zone for expiry without inventing a cutoff time", () => {
  const instant = new Date("2026-11-13T06:00:00.000Z");  assert.equal(deriveSourceStatus({ ...verified, deadline: "2026-11-12", deadlineTimezone: "America/Los_Angeles" }, instant), "verified");
  assert.equal(deriveSourceStatus({ ...verified, deadline: "2026-11-12", deadlineTimezone: "America/Chicago" }, instant), "expired");
  assert.equal(deriveSourceStatus({ ...verified, deadline: "2026-11-12", deadlineTimezone: "Not/A_Zone" }, instant), "needs-review");
});

test("recognizes explicit rolling and recurring sponsor wording as non-date deadline evidence", async () => {
  const { normalizeScholarshipRecord } = await import("../src/lib/evidence.js");
  const rollingText = "Applications are accepted on a rolling basis throughout the year.";
  const recurringText = "The award opens annually each September.";
  const now = new Date("2026-11-09T12:00:00.000Z");
  const rolling = normalizeScholarshipRecord({ ...verified, deadline: "", deadlineText: rollingText }, now);
  const recurring = normalizeScholarshipRecord({ ...verified, deadline: "", deadlineText: recurringText }, now);

  assert.equal(rolling.deadlineText, rollingText);
  assert.equal(recurring.deadlineText, recurringText);
  assert.equal(rolling.sourceStatus, "verified");
  assert.equal(recurring.sourceStatus, "verified");
  const { getEvidenceCompleteness } = await import("../src/lib/evidence.js");
  assert.equal(getEvidenceCompleteness(rolling, now).checks.find((item) => item.label === "Deadline evidence").complete, true);
  assert.equal(getEvidenceCompleteness(recurring, now).checks.find((item) => item.label === "Deadline evidence").complete, true);
  const annualAwardOnly = normalizeScholarshipRecord({ ...verified, deadline: "", deadlineText: "Annual award for graduating seniors" }, now);
  assert.equal(annualAwardOnly.sourceStatus, "needs-review");
  assert.equal(getEvidenceCompleteness(annualAwardOnly, now).checks.find((item) => item.label === "Deadline evidence").complete, false);
});

test("labels an officially verified source checked within 30 days as fresh", async () => {
  const { getOfficialSourceFreshness } = await import("../src/lib/evidence.js");
  assert.equal(getOfficialSourceFreshness(verified, new Date("2026-11-23T12:00:00")), "fresh");
});

test("labels an officially verified source checked more than 30 days ago as stale", async () => {
  const { getOfficialSourceFreshness } = await import("../src/lib/evidence.js");
  assert.equal(getOfficialSourceFreshness({ ...verified, lastCheckedDate: "2026-10-20" }, new Date("2026-11-23T12:00:00")), "stale");
});

test("rejects future and impossible sponsor-check dates instead of normalizing them as current", async () => {
  const { normalizeSourceCheckDate, normalizeScholarshipRecord, getOfficialSourceFreshness, getEvidenceCompleteness } = await import("../src/lib/evidence.js");  const now = new Date("2026-11-24T12:00:00");
  assert.equal(normalizeSourceCheckDate("2026-11-25", now), "");
  assert.equal(normalizeSourceCheckDate("2026-02-31", now), "");
  assert.equal(normalizeSourceCheckDate("not-a-date", now), "");
  assert.equal(getOfficialSourceFreshness({ ...verified, lastCheckedDate: "2026-11-25" }, now), "unverified");
  const normalized = normalizeScholarshipRecord({ ...verified, lastCheckedDate: "2026-11-25" }, now);
  assert.equal(normalized.lastCheckedDate, "");
  assert.equal(normalized.sourceStatus, "needs-review");
  assert.ok(getEvidenceCompleteness({ ...verified, lastCheckedDate: "2026-11-25" }, now).missing.includes("Sponsor check within 30 days"));
});

test("labels missing source or verification timestamp evidence as unverified", async () => {
  const { getOfficialSourceFreshness } = await import("../src/lib/evidence.js");
  const now = new Date("2026-11-23T12:00:00");
  assert.equal(getOfficialSourceFreshness({ ...verified, sourceUrl: "" }, now), "unverified");
  assert.equal(getOfficialSourceFreshness({ ...verified, lastCheckedDate: "" }, now), "unverified");
  assert.equal(getOfficialSourceFreshness({ ...verified, lastCheckedDate: "not-a-date" }, now), "unverified");
  assert.equal(getOfficialSourceFreshness({ ...verified, sourceVerified: false }, now), "unverified");
});

test("recognizes institutional .gov and .edu domains but excludes hosted personal/student content", () => {
  assert.equal(classifySourceAuthority("https://scholarships.agency.gov/apply"), "official-government");
  assert.equal(classifySourceAuthority("https://financialaid.university.edu/scholarships"), "official-school");
  assert.equal(classifySourceAuthority("https://students.university.edu/~student/award"), "unverified-lead");
  assert.equal(classifySourceAuthority("https://blogs.university.edu/award"), "unverified-lead");
  for (const label of ["web", "home", "sites", "my", "homepages", "profiles"]) {
    assert.equal(
      classifySourceAuthority(`https://${label}.university.edu/award`),
      "unverified-lead",
      label,
    );
  }
});

test("source status expires only after a published same-day cutoff in its explicit time zone", () => {
  const beforeCutoff = new Date("2026-11-10T22:59:00.000Z");
  const afterCutoff = new Date("2026-11-10T23:01:00.000Z");
  const record = {
    ...verified,
    deadline: "2026-11-10",
    deadlineTime: "17:00",
    deadlineTimezone: "America/Chicago",
  };
  assert.equal(deriveSourceStatus(record, beforeCutoff), "verified");
  assert.equal(deriveSourceStatus(record, afterCutoff), "expired");
  assert.equal(deriveSourceStatus({ ...record, deadlineTimezone: "" }, afterCutoff), "needs-review");
  assert.equal(deriveSourceStatus({ ...record, deadlineTime: "25:00" }, afterCutoff), "needs-review");
});