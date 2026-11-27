const CRITERIA_FIELDS = [
  "state", "schoolState", "collegeState", "district", "requiresShhMembership", "requiresSpanishAchievement",
  "requiredNseMedalYears", "requiresNseRegistration2027", "requiresFourHMembership",
  "requiresTestScore", "citizenship", "educationLevel", "graduationYear", "ageRange", "minGpa",
  "topPercentMax", "minAct", "minSat", "minActOrSat", "majorKeywords", "institution",
  "requiresFullTimeEnrollment", "enrollmentStatuses", "minServiceHours", "requiredMembership",
  "requiresFinancialNeed", "requiresFirstGeneration", "applicationFee",
];

import { deriveSourceStatus, getOfficialSourceFreshness, hasAwardEvidence, isInactiveCriterionValue, normalizeSourceCheckDate, resolveSourceAuthority, sanitizePublicHttpsUrl } from "./evidence.js";

function hasValidDeadlineIdentity(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Match only when title, sponsor, and a valid deadline year identify exactly
 * one existing record. Missing/invalid dates and multiple candidates are
 * ambiguous, so callers must insert a separate record rather than overwrite.
 */
export function findExistingCloudScholarshipMatch(records = [], candidate = {}) {
  if (!Array.isArray(records)) return null;
  const candidateTitle = String(candidate.title ?? candidate.name ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const candidateSponsor = String(candidate.sponsor ?? candidate.provider ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!candidateTitle || !candidateSponsor || !hasValidDeadlineIdentity(candidate.deadline)) return null;

  const candidateYear = candidate.deadline.slice(0, 4);
  const matches = records.filter((record) => {
    if (!record || typeof record !== "object" || !hasValidDeadlineIdentity(record.deadline)) return false;
    const title = String(record.title ?? record.name ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const sponsor = String(record.sponsor ?? record.provider ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return title === candidateTitle && sponsor === candidateSponsor && record.deadline.slice(0, 4) === candidateYear;
  });
  return matches.length === 1 ? matches[0] : null;
}

function cleanText(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeCriteria(criteria = {}) {
  const result = {};
  for (const key of CRITERIA_FIELDS) {
    const value = criteria?.[key];
    if (isInactiveCriterionValue(value)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value) && value.every((entry) => typeof entry === "string" || typeof entry === "number")) {
      result[key] = value.slice(0, 40);
    } else if (key === "minActOrSat" && typeof value === "object") {
      result[key] = {
        ...(Number.isFinite(value.act) ? { act: value.act } : {}),
        ...(Number.isFinite(value.sat) ? { sat: value.sat } : {}),
      };
    } else if (key === "ageRange" && typeof value === "object" && !Array.isArray(value)) {
      const ageRange = {};
      for (const bound of ["min", "max"]) {
        const present = value[bound] !== undefined && value[bound] !== null && value[bound] !== "";
        if (present) ageRange[bound] = Number.isInteger(value[bound]) && value[bound] >= 0 && value[bound] <= 120
          ? value[bound]
          : "invalid";
      }
      if (Object.hasOwn(ageRange, "min") && typeof value.minInclusive === "boolean") ageRange.minInclusive = value.minInclusive;
      if (Object.hasOwn(ageRange, "max") && typeof value.maxInclusive === "boolean") ageRange.maxInclusive = value.maxInclusive;
      if (Object.hasOwn(ageRange, "min") || Object.hasOwn(ageRange, "max")) result[key] = ageRange;
    }
  }
  return result;
}

function safeCriteriaImportance(criteria = {}, importance = {}) {
  const result = {};
  for (const key of [...CRITERIA_FIELDS, "otherRequirement"]) {
    if (isInactiveCriterionValue(criteria?.[key])) continue;
    if (importance?.[key] === "preferred" || importance?.[key] === "mandatory") {
      result[key] = importance[key];
    }
  }
  return result;
}

function safeCriteriaEvidence(criteria = {}, evidence = {}) {
  const result = {};
  for (const key of CRITERIA_FIELDS) {
    const criterion = criteria?.[key];
    if (isInactiveCriterionValue(criterion)) continue;
    const entry = evidence?.[key];
    const excerpt = cleanText(entry?.excerpt, 1000);
    const sourceUrl = cleanText(entry?.sourceUrl, 2048);
    const safeSourceUrl = sanitizePublicHttpsUrl(sourceUrl);
    if (!excerpt || !safeSourceUrl) continue;
    result[key] = { excerpt, sourceUrl: safeSourceUrl };
  }
  return result;}

export function buildCloudScholarshipRow(item, ownerId) {
  if (!ownerId) throw new Error("A signed-in account is required.");
  const title = cleanText(item?.name, 220);
  if (!title) throw new Error("A scholarship title is required.");
  const sourceUrl = cleanText(item?.sourceUrl, 2048);
  const officialUrl = sanitizePublicHttpsUrl(sourceUrl);
  if (!officialUrl) throw new Error("Add a valid public HTTPS sponsor URL before saving this scholarship to the cloud.");

  const award = cleanText(item?.award, 500);
  const awardEvidenceText = cleanText(item?.awardEvidenceText, 1000);
  const awardEvidenceUrl = sanitizePublicHttpsUrl(cleanText(item?.awardEvidenceUrl, 2048));
  const awardCurrencyBasis = cleanText(item?.awardCurrencyBasis, 80);
  const awardBasis = cleanText(item?.awardBasis, 160);
  const criteria = safeCriteria(item?.criteria);
  const criteriaImportance = safeCriteriaImportance(item?.criteria, item?.criteriaImportance);
  const criteriaEvidence = safeCriteriaEvidence(criteria, item?.criteriaEvidence);
  const evidenceUrl = cleanText(item?.evidenceUrl, 2048);
  const safeEvidenceUrl = sanitizePublicHttpsUrl(evidenceUrl) || "";
  const sourceAuthority = resolveSourceAuthority({ ...item, sourceUrl: officialUrl });
  const lastCheckedDate = normalizeSourceCheckDate(item?.lastCheckedDate);
  const sourceStatus = deriveSourceStatus({
    ...item,
    provider: cleanText(item?.provider, 180),
    award,
    criteria,
    criteriaEvidence,
    sourceUrl: officialUrl,
    sourceAuthority,
    awardEvidenceText,
    awardEvidenceUrl: awardEvidenceUrl || "",
    lastCheckedDate,
    evidenceUrl: safeEvidenceUrl,
  });
  return {
    owner_id: ownerId,
    title,
    sponsor: cleanText(item?.provider, 180) || null,
    official_url: officialUrl,
    // Preserve the sponsor's wording in JSONB. Numeric values and USD are not inferred.
    award_min: null,
    award_max: null,
    currency: awardCurrencyBasis || "UNSPECIFIED",
    deadline: hasValidDeadlineIdentity(item?.deadline) ? item.deadline : null,
    eligibility: {
      criteria,
      criteria_importance: criteriaImportance,
      criteria_evidence: criteriaEvidence,
      award_text: award,
      award_evidence_excerpt: awardEvidenceText,
      award_evidence_url: awardEvidenceUrl,
      award_currency_basis: awardCurrencyBasis,
      award_basis: awardBasis,
      deadline_text: cleanText(item?.deadlineText, 300),
      deadline_timezone: cleanText(item?.deadlineTimezone, 100),
      open_date: hasValidDeadlineIdentity(item?.openDate) ? item.openDate : null,
      open_date_timezone: cleanText(item?.openDateTimezone, 100),
      priority_deadline: hasValidDeadlineIdentity(item?.priorityDeadline) ? item.priorityDeadline : null,
      priority_deadline_text: cleanText(item?.priorityDeadlineText, 300),
      priority_deadline_timezone: cleanText(item?.priorityDeadlineTimezone, 100),
      deadline_not_published: item?.deadlineNotPublished === true,
      last_checked_date: lastCheckedDate || null,
      source_authority: sourceAuthority,
      source_evidence_url: safeEvidenceUrl || null,
    },
    // Evidence excerpts and free-form notes may contain personal information; keep them local.
    evidence: [{
      kind: "official_source_reference",
      text: `Official source: ${officialUrl}${safeEvidenceUrl ? `; supporting rules: ${safeEvidenceUrl}` : ""}`,
    }],
    verification_status: sourceStatus === "verified" ? "verified" : sourceStatus === "expired" ? "needs_review" : "unverified",
  };
}

export function mapCloudScholarship(row) {
  const eligibility = row?.eligibility && typeof row.eligibility === "object" ? row.eligibility : {};
  const evidence = Array.isArray(row?.evidence) ? row.evidence : [];
  const excerpt = evidence
    .map((entry) => typeof entry?.text === "string" ? entry.text : "")
    .filter(Boolean)
    .join("\n");
  // Legacy numeric columns do not prove the sponsor's exact wording or currency basis.
  const awardText = cleanText(eligibility.award_text, 500);
  const awardEvidenceText = cleanText(eligibility.award_evidence_excerpt, 1000);
  const awardEvidenceUrl = sanitizePublicHttpsUrl(cleanText(eligibility.award_evidence_url, 2048));
  const lastCheckedDate = normalizeSourceCheckDate(cleanText(eligibility.last_checked_date, 10));
  const storedStatus = row?.verification_status === "verified"
    ? "human_verified"
    : row?.verification_status === "needs_review"
      ? "needs_human_review"
      : row?.verification_status || "unverified";
  const sourceEvidenceUrl = cleanText(eligibility.source_evidence_url, 2048);
  const safeSourceEvidenceUrl = sanitizePublicHttpsUrl(sourceEvidenceUrl);
  const sourceUrl = cleanText(row?.official_url, 2048);
  const safeSourceUrl = sanitizePublicHttpsUrl(sourceUrl) || "";
  const sourceAuthority = resolveSourceAuthority({
    sourceAuthority: cleanText(eligibility.source_authority, 40),
    sourceUrl: safeSourceUrl,
    sourceVerified: storedStatus === "human_verified",  });
  const criteria = safeCriteria(eligibility.criteria);
  const criteriaImportance = safeCriteriaImportance(criteria, eligibility.criteria_importance);
  const criteriaEvidence = safeCriteriaEvidence(criteria, eligibility.criteria_evidence);
  const awardEvidenceValid = hasAwardEvidence({
    award: awardText,
    awardEvidenceText,
    awardEvidenceUrl,
    awardCurrencyBasis: cleanText(eligibility.award_currency_basis, 80),
    awardBasis: cleanText(eligibility.award_basis, 160),
    sourceUrl: safeSourceUrl,
  });
  const sourceFreshness = getOfficialSourceFreshness({
    sourceVerified: storedStatus === "human_verified",
    sourceAuthority,
    sourceUrl: safeSourceUrl,
    award: awardText,
    awardEvidenceText,
    awardEvidenceUrl: awardEvidenceUrl || "",
    awardCurrencyBasis: cleanText(eligibility.award_currency_basis, 80),
    awardBasis: cleanText(eligibility.award_basis, 160),
    evidenceUrl: safeSourceEvidenceUrl || "",
    criteria,
    criteriaEvidence,
    lastCheckedDate,
  });
  const status = storedStatus === "human_verified" && (
    !["official-sponsor", "official-program", "official-school", "official-government"].includes(sourceAuthority) ||
    !awardEvidenceValid ||
    sourceFreshness !== "fresh"
  ) ? "needs_human_review" : storedStatus;

  return {
    id: String(row?.id ?? ""),
    title: cleanText(row?.title, 220),
    provider: cleanText(row?.sponsor, 180) || null,
    award_text: awardText || null,
    award_evidence_text: awardEvidenceText,
    award_evidence_url: awardEvidenceUrl,
    award_currency_basis: cleanText(eligibility.award_currency_basis, 80),
    award_basis: cleanText(eligibility.award_basis, 160),
    deadline: row?.deadline || null,
    deadline_text: cleanText(eligibility.deadline_text, 300),
    deadline_timezone: cleanText(eligibility.deadline_timezone, 100),
    open_date: hasValidDeadlineIdentity(eligibility.open_date) ? eligibility.open_date : null,
    open_date_timezone: cleanText(eligibility.open_date_timezone, 100),
    priority_deadline: hasValidDeadlineIdentity(eligibility.priority_deadline) ? eligibility.priority_deadline : null,
    priority_deadline_text: cleanText(eligibility.priority_deadline_text, 300),
    priority_deadline_timezone: cleanText(eligibility.priority_deadline_timezone, 100),
    deadline_not_published: eligibility.deadline_not_published === true,
    last_checked_date: lastCheckedDate || null,
    source_authority: sourceAuthority,
    source_evidence_url: safeSourceEvidenceUrl,
    criteriaEvidence,
    criteriaImportance,
    source_url: safeSourceUrl,
    source_domain: (() => {
      try { return safeSourceUrl ? new URL(safeSourceUrl).hostname.toLowerCase().replace(/^www[.]/, "") : null; }
      catch { return null; }
    })(),
    discovery_source_url: null,
    discovery_category: "saved",
    excerpt,
    verification_state: status,
    // A saved cloud row is not necessarily a discovery event. Keep its database
    // creation timestamp separate and never infer discovery from created_at/updated_at.
    discovered_at: null,
    record_created_at: typeof row?.created_at === "string" && row.created_at.trim() ? row.created_at : null,
    extracted_rules: eligibility,
    // Only an explicit sponsor review date is evidence that the sponsor page was checked.
    source_checked_at: lastCheckedDate || null,
  };
}
