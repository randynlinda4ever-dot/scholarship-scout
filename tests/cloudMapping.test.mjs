import test from "node:test";
import assert from "node:assert/strict";
import { buildCloudScholarshipRow, findExistingCloudScholarshipMatch, mapCloudScholarship } from "../src/lib/cloudMapping.js";

test("preserves recognized government authority through cloud save and reload verification", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Federal Scholarship",
    provider: "Example Federal Agency",
    award: "$1,000",
    deadline: "2027-05-01",
    sourceUrl: "https://studentaid.gov/scholarships",
    evidenceUrl: "https://studentaid.gov/scholarships/eligibility",
    sourceAuthority: "official-government",
    lastCheckedDate: "2026-11-23",
    sourceVerified: true,
    awardEvidenceText: "The agency awards $1,000.",
    awardEvidenceUrl: "https://studentaid.gov/scholarships/award",
    evidenceText: "Synthetic government scholarship rules.",
  }, "synthetic-user");

  assert.equal(row.eligibility.source_authority, "official-government");
  assert.equal(row.verification_status, "verified");

  const reloaded = mapCloudScholarship({ ...row, id: "synthetic-government-award" });
  assert.equal(reloaded.source_authority, "official-government");
  assert.equal(reloaded.verification_state, "human_verified");
});

test("maps a scholarship to the existing schema without student profile or free-form notes", () => {
  const row = buildCloudScholarshipRow({
    name: "Example Award",
    provider: "Example Foundation",
    award: "$1,000–$5,000",
    deadline: "2027-05-01",
    sourceUrl: "https://www.aatspshh.org/award",
    evidenceUrl: "https://www.aatspshh.org/rules",
    sourceAuthority: "official-sponsor",
    lastCheckedDate: "2026-11-09",
    deadlineText: "May 1, 2027; time not stated",
    deadlineTimezone: "",
    sourceVerified: true,
    awardEvidenceText: "The sponsor awards $1,000–$5,000 to selected students.",
    awardEvidenceUrl: "https://www.aatspshh.org/rules#award",
    evidenceText: "Sponsor rules excerpt.",
    notes: "Private student note that must not be sent.",
    criteria: {
      minGpa: 3.5,
      graduationYear: 2027,
      otherRequirement: "Do not transmit this free-text field.",
    },
    criteriaEvidence: {
      minGpa: {
        excerpt: "Applicants must have a minimum 3.5 GPA.",
        sourceUrl: "https://www.aatspshh.org/rules#minimum-gpa",
      },
      graduationYear: {
        excerpt: "Applicants must graduate in 2027.",
        sourceUrl: "https://www.aatspshh.org/rules#graduation-year",
      },
    },
  }, "00000000-0000-4000-8000-000000000001");

  assert.equal(row.owner_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(row.title, "Example Award");
  assert.equal(row.award_min, null);
  assert.equal(row.award_max, null);
  assert.equal(row.currency, "UNSPECIFIED");
  const cappedAward = buildCloudScholarshipRow({
    name: "Capped Award", sourceUrl: "https://example.org/capped", award: "Up to $55,000 per year",
  }, "user-1");
  assert.equal(cappedAward.award_min, null);
  assert.equal(cappedAward.award_max, null);
  assert.equal(cappedAward.currency, "UNSPECIFIED");
  assert.equal(row.verification_status, "verified");
  assert.equal(row.eligibility.deadline_text, "May 1, 2027; time not stated");
  assert.equal(row.eligibility.last_checked_date, "2026-11-09");
  assert.equal(row.eligibility.source_authority, "official-program");
  assert.equal(row.eligibility.source_evidence_url, "https://www.aatspshh.org/rules");
  const sanitized = buildCloudScholarshipRow({
    name: "Synthetic URL Award",
    sourceUrl: "https://example.org/award?email=student%40example.test&page=2#session=private", 
    evidenceUrl: "https://example.org/rules?access_token=secret&page=3#token=fragment-secret",
    criteria: { minGpa: 3.0 },
    criteriaEvidence: { minGpa: { excerpt: "Synthetic minimum GPA requirement.", sourceUrl: "https://example.org/rules?studentId=synthetic-1#student-private" } },
  }, "synthetic-user");
  assert.equal(sanitized.official_url, "https://example.org/award?page=2");
  assert.equal(sanitized.eligibility.source_evidence_url, "https://example.org/rules?page=3");
  assert.equal(sanitized.eligibility.criteria_evidence.minGpa.sourceUrl, "https://example.org/rules");
  assert.equal(row.eligibility.criteria.minGpa, 3.5);
  assert.equal("otherRequirement" in row.eligibility.criteria, false);
  assert.deepEqual(row.eligibility.criteria_evidence, {
    minGpa: {
      excerpt: "Applicants must have a minimum 3.5 GPA.",
      sourceUrl: "https://www.aatspshh.org/rules#minimum-gpa",
    },
    graduationYear: {
      excerpt: "Applicants must graduate in 2027.",
      sourceUrl: "https://www.aatspshh.org/rules#graduation-year",
    },
  });
  const reloaded = mapCloudScholarship({
    ...row,
    id: "cloud-row-1",
    created_at: "2026-11-10T00:00:00.000Z",
  });
  assert.deepEqual(reloaded.criteriaEvidence, row.eligibility.criteria_evidence);
  assert.equal("notes" in row, false);
  assert.equal("user_id" in row, false);
  assert.deepEqual(row.evidence, [{
    kind: "official_source_reference",
    text: "Official source: https://www.aatspshh.org/award; supporting rules: https://www.aatspshh.org/rules",
  }]);
});

test("omits inactive any-valued criteria and their stale importance/evidence metadata", () => {
  const row = buildCloudScholarshipRow({
    name: "Inactive Criteria Award",
    provider: "AATSP",
    award: "$1,000",
    deadline: "2027-05-01",
    sourceUrl: "https://www.aatspshh.org/award",
    evidenceUrl: "https://www.aatspshh.org/rules",
    sourceAuthority: "official-program",
    lastCheckedDate: new Date().toISOString().slice(0, 10),
    sourceVerified: true,
    evidenceText: "Official sponsor award rules.",
    awardEvidenceText: "The sponsor awards $1,000.",
    awardEvidenceUrl: "https://www.aatspshh.org/rules#award",
    criteria: {
      schoolState: " ANY ",
      ageRange: {},
      requiresShhMembership: false,
      majorKeywords: [" "],
    },
    criteriaImportance: {
      schoolState: "mandatory",
      ageRange: "mandatory",
      requiresShhMembership: "mandatory",
      majorKeywords: "mandatory",
    },
    criteriaEvidence: {
      schoolState: {
        excerpt: "No school-state restriction.",
        sourceUrl: "https://www.aatspshh.org/rules#school-state",
      },
    },
  }, "user-1");

  assert.deepEqual(row.eligibility.criteria, {});
  assert.deepEqual(row.eligibility.criteria_importance, {});
  assert.deepEqual(row.eligibility.criteria_evidence, {});
  assert.equal(row.verification_status, "verified");
});

test("keeps structured criteria unverified when criterion-level sponsor evidence is missing", () => {
  const row = buildCloudScholarshipRow({
    name: "Evidence Gap Award",
    provider: "AATSP",
    award: "$1,000",
    deadline: "2027-05-01",    sourceUrl: "https://www.aatspshh.org/award",
    evidenceUrl: "https://www.aatspshh.org/rules",
    sourceAuthority: "official-program",
    lastCheckedDate: "2026-11-09",
    sourceVerified: true,
    evidenceText: "Official sponsor award rules.",
    criteria: { minGpa: 3.5 },
  }, "user-1");

  assert.equal(row.verification_status, "unverified");
  assert.deepEqual(row.eligibility.criteria_evidence, {});
  const reloaded = mapCloudScholarship({ ...row, id: "evidence-gap" });
  assert.deepEqual(reloaded.criteriaEvidence, {});
  assert.equal(reloaded.verification_state, "unverified");
});

test("rejects non-HTTPS, private-host, credential-bearing and missing sponsor URLs before database writes", () => {
  for (const sourceUrl of [
    "http://example.org/award",
    "https://localhost/award",
    "https://127.0.0.1/award",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@example.org/award",
  ]) {
    assert.throws(() => buildCloudScholarshipRow({
      name: "Example Award",
      sourceUrl,
    }, "user-1"), /valid public HTTPS sponsor URL/, sourceUrl);
  }
});

test("cloud duplicate matching preserves distinct awards hosted on the same official page", () => {
  const existing = [
    { id: "award-a", title: "Joseph Adams SHH Senior Scholarship", sponsor: "AATSP", deadline: "2027-02-15" },
    { id: "award-b", title: "NSE/NPE Senior Scholarship", sponsor: "AATSP", deadline: "2027-02-15" },
  ];

  const matchingAward = findExistingCloudScholarshipMatch(existing, {
    title: "Joseph Adams SHH Senior Scholarship",
    sponsor: "AATSP",
    deadline: "2027-02-28",
  });
  assert.equal(matchingAward?.id, "award-a");

  const distinctAward = findExistingCloudScholarshipMatch(existing, {
    title: "Premio de Honor",
    sponsor: "AATSP",
    deadline: "2027-02-15",
  });
  assert.equal(distinctAward, null);
});

test("cloud duplicate matching normalizes title and sponsor and ignores deadline day within the same year", () => {
  const existing = [{
    id: "award-1",
    title: "  Example—Award ",
    sponsor: "Example Foundation",
    deadline: "2027-05-01",
  }];
  const match = findExistingCloudScholarshipMatch(existing, {
    title: "example award",
    sponsor: "EXAMPLE FOUNDATION",
    deadline: "2027-06-30",
  });
  assert.equal(match?.id, "award-1");
});

test("cloud matching refuses records with missing or invalid deadline identity", () => {
  const existing = [{
    id: "award-1",
    title: "Example Award",
    sponsor: "Example Foundation",
    deadline: "",
  }];

  assert.equal(findExistingCloudScholarshipMatch(existing, {
    title: "Example Award",
    sponsor: "Example Foundation",
    deadline: "",
  }), null);
  assert.equal(findExistingCloudScholarshipMatch(existing, {
    title: "Example Award",
    sponsor: "Example Foundation",
    deadline: "2027-02-30",
  }), null);
});

test("cloud writes reject impossible calendar dates but preserve real leap days", () => {
  for (const deadline of ["2027-02-29", "2027-02-30", "2027-13-01", "2027-04-31"]) {
    const row = buildCloudScholarshipRow({
      name: "Synthetic Calendar Date Award",
      sourceUrl: "https://example.org/award",
      deadline,
    }, "synthetic-user");
    assert.equal(row.deadline, null, deadline);
  }

  const leapDay = buildCloudScholarshipRow({
    name: "Synthetic Leap Day Award",
    sourceUrl: "https://example.org/leap-day",
    deadline: "2028-02-29",
  }, "synthetic-user");
  assert.equal(leapDay.deadline, "2028-02-29");
});

test("cloud matching refuses ambiguous multiple candidates instead of updating the first row", () => {
  const existing = [
    { id: "award-a", title: "Example Award", sponsor: "Example Foundation", deadline: "2027-05-01" },
    { id: "award-b", title: "Example Award", sponsor: "Example Foundation", deadline: "2027-05-20" },
  ];
  assert.equal(findExistingCloudScholarshipMatch(existing, {
    title: "Example Award",
    sponsor: "Example Foundation",
    deadline: "2027-05-10",
  }), null);
});

test("maps an existing scholarships row into the cloud-search card contract", () => {
  const item = mapCloudScholarship({
    id: "record-1",
    title: "Example Award",
    sponsor: "Example Foundation",
    official_url: "https://example.org/award",
    award_min: 1000,
    award_max: 5000,
    currency: "USD",
    deadline: "2027-05-01",
    eligibility: {
      award_text: "$1,000–$5,000",
      deadline_text: "May 1, 2027; time not stated",
      deadline_timezone: "",
      last_checked_date: "2026-11-09",
      source_authority: "official-sponsor",
      source_evidence_url: "https://example.org/rules",
      criteria: { minGpa: 3.5 },
    },
    evidence: [{ text: "Sponsor excerpt." }],
    verification_status: "needs_review",    created_at: "2026-11-10T00:00:00.000Z",
    updated_at: "2026-11-10T00:00:00.000Z",
  });

  assert.equal(item.id, "record-1");
  assert.equal(item.source_url, "https://example.org/award");
  assert.equal(item.award_text, "$1,000–$5,000");
  assert.equal(item.verification_state, "needs_human_review");
  assert.equal(item.deadline_text, "May 1, 2027; time not stated");
  assert.equal(item.last_checked_date, "2026-11-09");
  assert.equal(item.source_evidence_url, "https://example.org/rules");
  assert.equal(item.source_checked_at, "2026-11-09");
  assert.equal(item.excerpt, "Sponsor excerpt.");
});

test("downgrades stored verification when the general or criterion excerpt lacks its own official source URL", () => {
  const base = {
    id: "verified-source-attribution",
    title: "Synthetic Source Attribution Award",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    eligibility: {
      award_text: "$1,000",
      award_evidence_excerpt: "The award is $1,000.",
      award_evidence_url: "https://www.aatspshh.org/rules#award",
      source_authority: "official-program",
      last_checked_date: "2026-11-23",
    },
    verification_status: "verified",
  };

  const missingGeneralUrl = mapCloudScholarship({ ...base, eligibility: { ...base.eligibility } });
  assert.equal(missingGeneralUrl.verification_state, "needs_human_review");

  const wrongGeneralUrl = mapCloudScholarship({
    ...base,
    eligibility: { ...base.eligibility, source_evidence_url: "https://other.example/rules" },
  });
  assert.equal(wrongGeneralUrl.verification_state, "needs_human_review");

  const wrongCriterionUrl = mapCloudScholarship({
    ...base,
    eligibility: {
      ...base.eligibility,
      source_evidence_url: "https://www.aatspshh.org/rules",
      criteria: { minGpa: 3.0 },
      criteria_evidence: {
        minGpa: { excerpt: "Applicants must have a 3.0 GPA.", sourceUrl: "https://other.example/gpa-rules" },
      },
    },
  });
  assert.equal(wrongCriterionUrl.verification_state, "needs_human_review");
});

test("downgrades a stored verified record when award evidence is missing or from another source", () => {
  const missing = mapCloudScholarship({
    id: "verified-without-award-evidence",
    title: "Synthetic Legacy Verified Award",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    eligibility: { award_text: "$1,000", source_authority: "official-program" },
    verification_status: "verified",
  });
  assert.equal(missing.verification_state, "needs_human_review");

  const mismatched = mapCloudScholarship({
    id: "verified-with-mismatched-award-evidence",
    title: "Synthetic Mismatched Award",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    eligibility: {
      award_text: "$1,000",
      award_evidence_excerpt: "The award is $1,000.",
      award_evidence_url: "https://other.example/rules",
      source_authority: "official-program",
    },
    verification_status: "verified",
  });
  assert.equal(mismatched.verification_state, "needs_human_review");

  const inaccurateExcerpt = mapCloudScholarship({
    id: "verified-with-inaccurate-award-excerpt",
    title: "Synthetic Inaccurate Award",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    eligibility: {
      award_text: "$2,000",
      award_evidence_excerpt: "The sponsor awards $1,000.",
      award_evidence_url: "https://www.aatspshh.org/rules#award",
      source_authority: "official-program",
    },
    verification_status: "verified",
  });
  assert.equal(inaccurateExcerpt.verification_state, "needs_human_review");
});

test("downgrades a directory's stored official-sponsor label when mapping cloud records", () => {
  const item = mapCloudScholarship({
    id: "synthetic-directory-record",
    title: "Synthetic Award Listing",
    sponsor: "Example Foundation",
    official_url: "https://synthetic-scholarship-directory.example/listing",
    eligibility: { source_authority: "official-sponsor" },
    evidence: [{ text: "Synthetic directory listing." }],
    verification_status: "unverified",
  });

  assert.equal(item.source_authority, "secondary-directory");
  assert.equal(item.source_url, "https://synthetic-scholarship-directory.example/listing");
});

test("downgrades a stored verified status when its official URL is a directory", () => {
  const item = mapCloudScholarship({
    id: "synthetic-forged-verification",
    title: "Synthetic Directory Award",
    sponsor: "Example Foundation",
    official_url: "https://synthetic-scholarship-directory.example/listing",
    eligibility: { source_authority: "official-sponsor" },
    evidence: [{ text: "Synthetic directory listing." }],
    verification_status: "verified",  });

  assert.equal(item.source_authority, "unverified-lead");
  assert.equal(item.verification_state, "needs_human_review");
});

test("stores a source authority derived from the submitted source URL, not an inherited sponsor label", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Aggregator Award",
    provider: "Example Foundation",
    award: "$1,000",
    deadline: "2027-05-01",
    sourceUrl: "https://synthetic-scholarship-directory.example/listing",
    discoverySourceUrl: "https://jkcf.org/scholarships",
    sourceAuthority: "official-sponsor",
    sourceVerified: false,
  }, "synthetic-user");

  assert.equal(row.eligibility.source_authority, "secondary-directory");
  assert.equal(row.verification_status, "unverified");
});

test("preserves exact award wording, source excerpt, currency and award basis without numeric inference", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic International Award",
    provider: "Example Foundation",
    award: "CAD $2,500 per academic year, renewable for up to four years",
    awardEvidenceText: "Recipients receive CAD $2,500 per academic year, renewable for up to four years.",
    awardEvidenceUrl: "https://example.org/official-awards#amount",
    awardCurrencyBasis: "CAD",
    awardBasis: "per academic year; renewable for up to four years",
    sourceUrl: "https://example.org/official-awards",
  }, "synthetic-user");

  assert.equal(row.award_min, null);
  assert.equal(row.award_max, null);
  assert.equal(row.currency, "CAD");
  assert.equal(row.eligibility.award_text, "CAD $2,500 per academic year, renewable for up to four years");
  assert.equal(row.eligibility.award_evidence_excerpt, "Recipients receive CAD $2,500 per academic year, renewable for up to four years.");
  assert.equal(row.eligibility.award_evidence_url, "https://example.org/official-awards#amount");
  assert.equal(row.eligibility.award_currency_basis, "CAD");
  assert.equal(row.eligibility.award_basis, "per academic year; renewable for up to four years");
});

test("does not treat an old cloud sponsor-check date as current verification", () => {
  const item = mapCloudScholarship({
    id: "synthetic-stale-source-check",
    title: "Synthetic Stale Source Award",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    eligibility: {
      award_text: "$1,000",
      award_evidence_excerpt: "The sponsor awards $1,000.",
      award_evidence_url: "https://www.aatspshh.org/rules#award",
      source_authority: "official-program",
      last_checked_date: "2026-10-20",
    },
    verification_status: "verified",
    updated_at: "2026-11-24T12:00:00.000Z",
  });

  assert.equal(item.verification_state, "needs_human_review");
  assert.equal(item.last_checked_date, "2026-10-20");
  assert.equal(item.source_checked_at, "2026-10-20");
});

test("does not substitute cloud row update time for a missing or invalid sponsor-check date", () => {
  const baseRow = {
    id: "synthetic-missing-source-check",
    title: "Synthetic Missing Source Check",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    verification_status: "verified",
    updated_at: "2026-11-24T12:00:00.000Z",
  };
  const eligibility = {
    award_text: "$1,000",
    award_evidence_excerpt: "The sponsor awards $1,000.",
    award_evidence_url: "https://www.aatspshh.org/rules#award",
    source_authority: "official-program",
  };

  const missing = mapCloudScholarship({ ...baseRow, eligibility });
  assert.equal(missing.verification_state, "needs_human_review");
  assert.equal(missing.last_checked_date, null);
  assert.equal(missing.source_checked_at, null);

  const impossibleDate = mapCloudScholarship({
    ...baseRow,
    id: "synthetic-impossible-source-check",
    eligibility: { ...eligibility, last_checked_date: "2026-02-31" },
  });
  assert.equal(impossibleDate.verification_state, "needs_human_review");
  assert.equal(impossibleDate.last_checked_date, null);
  assert.equal(impossibleDate.source_checked_at, null);
});

test("does not accept a future sponsor-check date as current cloud verification", () => {
  const item = mapCloudScholarship({
    id: "synthetic-future-source-check",
    title: "Synthetic Future Source Check",
    sponsor: "AATSP",
    official_url: "https://www.aatspshh.org/award",
    eligibility: {
      award_text: "$1,000",
      award_evidence_excerpt: "The sponsor awards $1,000.",
      award_evidence_url: "https://www.aatspshh.org/rules#award",
      source_authority: "official-program",
      last_checked_date: "2099-01-01",
    },
    verification_status: "verified",
    updated_at: "2026-11-24T12:00:00.000Z",
  });

  assert.equal(item.verification_state, "needs_human_review");
  assert.equal(item.last_checked_date, null);
  assert.equal(item.source_checked_at, null);
});

test("does not persist an impossible sponsor-check date when saving a cloud row", () => {  const row = buildCloudScholarshipRow({
    name: "Synthetic Impossible Check Date Award",
    provider: "AATSP",
    award: "$1,000",
    awardEvidenceText: "The sponsor awards $1,000.",
    awardEvidenceUrl: "https://www.aatspshh.org/rules#award",
    sourceUrl: "https://www.aatspshh.org/award",
    sourceVerified: true,
    evidenceText: "Official sponsor award rules.",
    deadline: "2027-05-01",
    lastCheckedDate: "2026-02-31",
  }, "synthetic-user");

  assert.equal(row.eligibility.last_checked_date, null);
  assert.equal(row.verification_status, "unverified");
});


test("does not invent a currency or reconstruct award wording from legacy numeric columns", () => {
  const item = mapCloudScholarship({
    id: "legacy-numeric-only",
    title: "Legacy Award",
    sponsor: "Example Foundation",
    official_url: "https://example.org/award",
    award_min: 2500,
    award_max: 5000,
    currency: "USD",
    eligibility: {},
    evidence: [],
    verification_status: "unverified",
  });

  assert.equal(item.award_text, null);
  assert.equal(item.award_evidence_text, "");
  assert.equal(item.award_evidence_url, null);
  assert.equal(item.award_currency_basis, "");
  assert.equal(item.award_basis, "");
});

test("requires award wording evidence from the same official source and drops unsafe award evidence URLs", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Evidence Award",
    provider: "Example Foundation",
    award: "$1,000",
    awardEvidenceText: "The award is $1,000.",
    awardEvidenceUrl: "https://other.example/rules",
    sourceUrl: "https://example.org/award",
    sourceAuthority: "official-sponsor",
    sourceVerified: true,
    evidenceText: "Official sponsor rules.",
    deadline: "2027-05-01",
    lastCheckedDate: "2026-11-23",
  }, "synthetic-user");

  assert.equal(row.eligibility.award_evidence_url, "https://other.example/rules");
  assert.equal(row.verification_status, "unverified");
  const unsafe = buildCloudScholarshipRow({
    name: "Unsafe Evidence Award",
    award: "$1,000",
    awardEvidenceText: "The award is $1,000.",
    awardEvidenceUrl: "http://example.org/rules",
    sourceUrl: "https://example.org/award",
  }, "synthetic-user");
  assert.equal(unsafe.eligibility.award_evidence_url, null);
});

test("round-trips award evidence fields through the cloud mapping", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Round Trip Award",
    award: "Varies by program; amounts are listed in the official rules",
    awardEvidenceText: "Award amounts vary by program.",
    awardEvidenceUrl: "https://example.org/rules#award",
    awardCurrencyBasis: "Not stated",
    awardBasis: "Varies by program",
    sourceUrl: "https://example.org/award",
  }, "synthetic-user");
  const item = mapCloudScholarship({ ...row, id: "round-trip" });

  assert.equal(item.award_text, "Varies by program; amounts are listed in the official rules");
  assert.equal(item.award_evidence_text, "Award amounts vary by program.");
  assert.equal(item.award_evidence_url, "https://example.org/rules#award");
  assert.equal(item.award_currency_basis, "Not stated");
  assert.equal(item.award_basis, "Varies by program");
});

test("does not expose unsafe database evidence URLs as clickable cloud links", () => {
  const invalidSponsorUrl = mapCloudScholarship({
    id: "record-unsafe-source",
    title: "Example Award",
    official_url: "https://127.0.0.1/private",
    eligibility: {},
    evidence: [],
  });
  assert.equal(invalidSponsorUrl.source_url, "");

  for (const sourceEvidenceUrl of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.org/rules",
    "https://user:pass@example.org/rules",
    "https://127.0.0.1/private",
  ]) {
    const item = mapCloudScholarship({
      id: "record-unsafe",
      title: "Example Award",
      official_url: "https://example.org/award",
      eligibility: { source_evidence_url: sourceEvidenceUrl },
      evidence: [],
    });
    assert.equal(item.source_evidence_url, null, sourceEvidenceUrl);
  }
});

test("keeps local source evidence history out of cloud sponsor records", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic History Boundary Award",
    sourceUrl: "https://example.org/current-award",
    evidenceUrl: "https://example.org/current-rules",
    evidenceText: "Current synthetic public sponsor excerpt.",
    sourceEvidenceHistory: [{      recordedAt: "2026-11-20T12:00:00.000Z",
      sourceUrl: "https://example.org/previous-award",
      evidenceText: "Previous synthetic excerpt.",
    }],
  }, "synthetic-user");

  assert.equal("sourceEvidenceHistory" in row, false);
  assert.equal("source_evidence_history" in row.eligibility, false);
  assert.equal(row.evidence.length, 1);
  assert.equal(row.evidence[0].text, "Official source: https://example.org/current-award; supporting rules: https://example.org/current-rules");
});

test("keeps cloud record creation separate from discovery and sponsor-check dates", () => {
  const item = mapCloudScholarship({
    id: "synthetic-date-semantics",
    title: "Synthetic Date Semantics Award",
    official_url: "https://example.org/award",
    eligibility: { last_checked_date: "2026-11-20" },
    created_at: "2026-11-21T10:30:00.000Z",
    updated_at: "2026-11-23T15:45:00.000Z",
  });

  assert.equal(item.discovered_at, null);
  assert.equal(item.record_created_at, "2026-11-21T10:30:00.000Z");
  assert.equal(item.source_checked_at, "2026-11-20");
  assert.equal(item.last_checked_date, "2026-11-20");
});

test("does not infer a discovery date from cloud record creation or update timestamps", () => {
  const item = mapCloudScholarship({
    id: "synthetic-no-discovery-date",
    title: "Synthetic No Discovery Date Award",
    official_url: "https://example.org/award",
    eligibility: {},
    created_at: "2026-11-21T10:30:00.000Z",
    updated_at: "2026-11-23T15:45:00.000Z",
  });

  assert.equal(item.discovered_at, null);
  assert.equal(item.record_created_at, "2026-11-21T10:30:00.000Z");
  assert.equal(item.source_checked_at, null);
});

test("leaves cloud record creation date unknown instead of substituting its update date", () => {
  const item = mapCloudScholarship({
    id: "synthetic-missing-created-at",
    title: "Synthetic Missing Created Date Award",
    official_url: "https://example.org/award",
    eligibility: {},
    updated_at: "2026-11-23T15:45:00.000Z",
  });

  assert.equal(item.discovered_at, null);
  assert.equal(item.record_created_at, null);
  assert.equal(item.source_checked_at, null);
});

test("round-trips mandatory and preferred criterion classifications through cloud mapping", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Criteria Importance Award",
    sourceUrl: "https://example.org/award",
    criteria: { minGpa: 3.5, state: "Texas" },
    criteriaImportance: { minGpa: "preferred", state: "mandatory", unrelatedField: "preferred" },
    criteriaEvidence: {
      minGpa: { excerpt: "Preferred GPA recommendation.", sourceUrl: "https://example.org/rules#gpa" },
      state: { excerpt: "Applicants must reside in Texas.", sourceUrl: "https://example.org/rules#state" },
    },
  }, "synthetic-user");

  assert.deepEqual(row.eligibility.criteria_importance, { minGpa: "preferred", state: "mandatory" });
  const reloaded = mapCloudScholarship({ ...row, id: "synthetic-criteria-importance" });
  assert.deepEqual(reloaded.criteriaImportance, { minGpa: "preferred", state: "mandatory" });
});

test("round-trips explicit inclusive and exclusive age-range boundaries", () => {
  const ageRange = { min: 18, minInclusive: true, max: 24, maxInclusive: false };
  const row = buildCloudScholarshipRow({
    name: "Synthetic Age Range Award",
    sourceUrl: "https://example.org/award",
    criteria: { ageRange },
    criteriaEvidence: {
      ageRange: { excerpt: "Applicants must be at least 18 and under 24 years old.", sourceUrl: "https://example.org/rules#age" },
    },
  }, "synthetic-user");

  assert.deepEqual(row.eligibility.criteria.ageRange, ageRange);
  const reloaded = mapCloudScholarship({ ...row, id: "synthetic-age-range" });
  assert.deepEqual(reloaded.extracted_rules.criteria.ageRange, ageRange);
  assert.equal(reloaded.criteriaEvidence.ageRange.excerpt, "Applicants must be at least 18 and under 24 years old.");
});

test("round-trips current school and intended college state rules and derives source domain", () => {
  const row = buildCloudScholarshipRow({
    name: "Example state-specific award",
    provider: "Example sponsor",
    sourceUrl: "https://www.example.org/award",
    criteria: { schoolState: "TX", collegeState: "CA" },
  }, "synthetic-user");
  assert.deepEqual(row.eligibility.criteria, { schoolState: "TX", collegeState: "CA" });
  const restored = mapCloudScholarship({ ...row, id: "synthetic-state-award" });
  assert.deepEqual(restored.extracted_rules.criteria, { schoolState: "TX", collegeState: "CA" });
  assert.equal(restored.source_domain, "example.org");
});
