const OFFICIAL_HOSTS = new Map([
  ["studentaid.gov", "official-government"],
  ["ed.gov", "official-government"],
  ["grants.gov", "official-government"],
  ["usa.gov", "official-government"],
  ["dol.gov", "official-government"],
  ["texas.gov", "official-government"],
  ["aatspshh.org", "official-program"],
  ["nationalspanishexam.org", "official-program"],
  ["texas4hfoundation.org", "official-program"],
  ["risdweb.org", "official-school"],
  ["tarleton.edu", "official-school"],
  ["jkcf.org", "official-sponsor"],
  ["equitable.com", "official-sponsor"],
  ["chick-fil-a.com", "official-sponsor"],
  ["txpta.org", "official-program"],
  ["nhs.us", "official-program"],
  ["horatioalger.org", "official-program"],
]);

const TRUSTED_AUTHORITIES = new Set(["official-sponsor", "official-program", "official-school", "official-government"]);

/**
 * Shared client-side URL allowlist check for evidence and discovery links.
 * This rejects obvious local/private destinations; DNS rebinding protections
 * require enforcement at the server/network layer.
 */
export function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password || !host) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "metadata" || host === "metadata.google.internal" ||
      host.endsWith(".internal") || host === "home.arpa" || host.endsWith(".home.arpa") ||
      host.endsWith(".lan") || host.endsWith(".intranet")) return false;
    // URL canonicalizes nonstandard IPv4 forms (integer, hex, octal) to dotted decimal.
    if (host.includes(":") || /^\d+(?:\.\d+){0,3}$/.test(host)) return false;
    if (!host.includes(".")) return false;
    return host.split(".").every((label) =>
      label.length > 0 && label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    );
  } catch {
    return false;
  }
}

const PRIVATE_URL_PARAMETER = /(?:email|e_mail|phone|mobile|telephone|tel|first.?name|last.?name|full.?name|student|user.?id|account.?id|member.?id|contact|recipient|profile|address|birth|dob|ssn|social.?security|token|auth|authorization|password|secret|session|cookie|api.?key|client.?key|access.?key|credential|verification.?code)/i;
const TRACKING_URL_PARAMETER = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i;
const PRIVATE_URL_VALUE = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:^|\D)\d{3}[- .]?\d{2}[- .]?\d{4}(?:\D|$)|(?:^|\D)\+?\d[\d ().-]{6,}\d(?:\D|$))/i;

function decodeForPrivacyCheck(value) {
  let decoded = String(value ?? "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

/**
 * Validate and normalize a public source URL before displaying or persisting it.
 * Remove private fragment state, tracking fields, and query parameters that
 * could carry contact details, student identifiers, credentials, or sessions.
 */
export function sanitizePublicHttpsUrl(value) {
  if (!isSafeHttpsUrl(value)) return null;
  try {
    const url = new URL(value);
    const fragment = decodeForPrivacyCheck(url.hash.slice(1));
    if (PRIVATE_URL_PARAMETER.test(fragment) || PRIVATE_URL_VALUE.test(fragment)) url.hash = "";
    for (const [key, entry] of [...url.searchParams.entries()]) {
      const checkedKey = decodeForPrivacyCheck(key);
      const checkedEntry = decodeForPrivacyCheck(entry);
      if (PRIVATE_URL_PARAMETER.test(checkedKey) || TRACKING_URL_PARAMETER.test(checkedKey) || PRIVATE_URL_VALUE.test(checkedEntry)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Returns a safe, page-specific URL for a scholarship result. A bare sponsor
 * homepage is not presented as an "Open source page" destination.
 */
export function getScholarshipSourcePageUrl(value) {
  const sanitized = sanitizePublicHttpsUrl(value);
  if (!sanitized) return null;
  try {
    const url = new URL(sanitized);
    return url.pathname !== "/" || url.searchParams.size > 0 ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeHttps(value) {
  return isSafeHttpsUrl(value);
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Return the calendar date at an instant in the sponsor-stated time zone.
 * Without a supplied zone, retain the user's local-calendar behavior. An
 * invalid explicit zone returns null rather than silently falling back.
 */
export function calendarDateKey(date, timeZone = "") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (!timeZone) return localDateKey(date);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    if (!values.year || !values.month || !values.day) return null;
    return values.year.padStart(4, "0") + "-" + values.month + "-" + values.day;
  } catch {
    return null;
  }
}

/**
 * Parse one explicit sponsor-stated cutoff time without supplying a missing
 * time or time zone. The original deadline wording remains the source of truth.
 */
export function parseSponsorDeadlineTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const matches = [];
  // Accept common sponsor notation with or without periods (11:59 PM / 11:59 p.m.).
  const twelveHour = /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi;
  for (const match of text.matchAll(twelveHour)) {    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) continue;
    const minute = Number(match[2] ?? "0");
    const isPm = /^p/i.test(match[3]);
    const hour24 = (hour % 12) + (isPm ? 12 : 0);
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      time: `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    });
  }

  // A single explicit HH:mm token is an unambiguous 24-hour clock value.
  // Do not parse it when it is immediately followed by a 12-hour suffix.
  const twentyFourHour = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z]))/gi;
  for (const match of text.matchAll(twentyFourHour)) {
    matches.push({
      index: match.index,
      end: match.index + match[0].length,
      time: `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`,
    });
  }

  // Multiple times (for example, a portal opening and closing time) are ambiguous.
  if (matches.length !== 1) return null;
  const selected = matches[0];
  const zonePattern = /(America\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*|US\/[A-Za-z0-9_+-]+|UTC(?:[+-]\d{1,2}(?::?\d{2})?)?|GMT(?:[+-]\d{1,2}(?::?\d{2})?)?|(?:Eastern|Central|Mountain|Pacific)(?: Standard| Daylight)? Time|(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|ET|CT|MT|PT))/i;
  const cleanEdge = (part) => part.trim().replace(/^[,;(:\s]+/, "").replace(/[.,;):\s]+$/, "");
  const prefix = cleanEdge(text.slice(0, selected.index))
    .replace(/^(?:deadline|cutoff|due)\s*[:=-]\s*/i, "");
  const suffix = cleanEdge(text.slice(selected.end));
  const prefixZone = prefix.match(new RegExp(`^${zonePattern.source}$`, "i"));
  const suffixZone = suffix.match(new RegExp(`^${zonePattern.source}$`, "i"));
  const prefixText = prefixZone?.[1] ?? "";
  const suffixText = suffixZone?.[1] ?? "";
  const timeZoneText = prefixText && suffixText && prefixText.toLowerCase() !== suffixText.toLowerCase()
    ? ""
    : (suffixText || prefixText);

  return { time: selected.time, timeZoneText };
}

function hasNonDateDeadlineEvidence(record = {}) {
  const wording = String(record.deadlineText ?? "").trim();
  return /\brolling\b|\byear[- ]round\b|\brecurr(?:ing|s)?\b|\b(?:every|each)\s+year\b|\bannual\s+(?:cycle|deadline|application\s+window)\b|\b(?:opens?|closes?|applications?|deadline|apply)\b.{0,40}\bannually\b|\bannually\b.{0,40}\b(?:opens?|closes?|applications?|deadline|apply)\b/i.test(wording);
}

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeSourceCheckDate(value, now = new Date()) {
  if (!validDateKey(value) || !(now instanceof Date) || Number.isNaN(now.getTime())) return "";
  const checked = new Date(value + "T12:00:00Z").getTime();
  const today = new Date(localDateKey(now) + "T12:00:00Z").getTime();
  return checked <= today ? value : "";
}

function isRecentCheck(value, now) {
  const normalized = normalizeSourceCheckDate(value, now);
  if (!normalized) return false;
  const checked = new Date(normalized + "T12:00:00Z").getTime();
  const today = new Date(localDateKey(now) + "T12:00:00Z").getTime();
  const ageDays = (today - checked) / 86400000;
  return ageDays <= 30;
}

/**
 * Classify the freshness of a scholarship's official-source review. Missing,
 * malformed, future-dated, or non-official evidence is never treated as fresh.
 */
export function getOfficialSourceFreshness(record = {}, now = new Date()) {
  if (record.sourceVerified !== true ||
      !TRUSTED_AUTHORITIES.has(record.sourceAuthority) ||
      !TRUSTED_AUTHORITIES.has(classifySourceAuthority(record.sourceUrl)) ||
      !safeHttps(record.sourceUrl) ||
      !hasAwardEvidence(record) ||      !isSameOfficialSponsorSource(record.sourceUrl, record.evidenceUrl) ||
      !hasCriterionEvidence(record) ||
      !validDateKey(record.lastCheckedDate)) return "unverified";

  const checked = new Date(record.lastCheckedDate + "T12:00:00Z").getTime();
  const today = new Date(localDateKey(now) + "T12:00:00Z").getTime();
  const ageDays = (today - checked) / 86400000;
  if (ageDays < 0) return "unverified";
  return ageDays <= 30 ? "fresh" : "stale";
}

export function isSameOfficialSponsorSource(sponsorUrl, evidenceUrl) {
  if (!safeHttps(sponsorUrl) || !safeHttps(evidenceUrl)) return false;
  if (classifySourceAuthority(sponsorUrl) === "unverified-lead" ||
      classifySourceAuthority(evidenceUrl) === "unverified-lead") return false;
  const sponsorHost = new URL(sponsorUrl).hostname.toLowerCase();
  const evidenceHost = new URL(evidenceUrl).hostname.toLowerCase();
  return sponsorHost === evidenceHost ||
    sponsorHost.endsWith("." + evidenceHost) ||
    evidenceHost.endsWith("." + sponsorHost);
}

export function isInactiveCriterionValue(value) {
  if (value === undefined || value === null || value === false) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return !normalized || normalized === "any";
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isInactiveCriterionValue);
  }
  if (typeof value === "object") {
    const entries = Object.values(value);
    return entries.length === 0 || entries.every(isInactiveCriterionValue);
  }
  return false;
}

function activeCriterionEntries(record = {}) {
  return Object.entries(record.criteria ?? {}).filter(([key, value]) =>
    key !== "applicationFee" && !isInactiveCriterionValue(value)
  );
}

export function hasAwardEvidence(record = {}) {
  const award = String(record.award ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const excerpt = String(record.awardEvidenceText ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const currency = String(record.awardCurrencyBasis ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const basis = String(record.awardBasis ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return Boolean(
    award && excerpt.includes(award) &&
    (!currency || excerpt.includes(currency)) &&
    (!basis || excerpt.includes(basis)) &&
    isSameOfficialSponsorSource(record.sourceUrl, record.awardEvidenceUrl)
  );
}
function hasCriterionEvidence(record = {}) {
  return activeCriterionEntries(record).every(([key]) => {
    const entry = record.criteriaEvidence?.[key];
    return Boolean(
      String(entry?.excerpt ?? "").trim() &&
      isSameOfficialSponsorSource(record.sourceUrl, entry?.sourceUrl)
    );
  });
}

const HOSTED_CONTENT_SUBDOMAIN = /(?:^|\.)(?:student|students|blog|blogs|people|users|personal|web|webspace|home|homepages?|sites|my|profiles?)(?:\.|$)/i;

export function classifySourceAuthority(value) {
  if (!safeHttps(value)) return "unverified-lead";
  const host = new URL(value).hostname.toLowerCase();
  for (const [domain, authority] of OFFICIAL_HOSTS) {
    if (host === domain || host.endsWith("." + domain)) return authority;
  }
  // Institutional suffixes are acceptable only on direct institution hosts.
  // Explicitly exclude common student/blog/personal content subdomains.
  if (HOSTED_CONTENT_SUBDOMAIN.test(host)) return "unverified-lead";
  if (host.endsWith(".gov")) return "official-government";
  if (host.endsWith(".edu")) return "official-school";
  return "unverified-lead";
}

export function getSourceAttribution(value) {
  const authority = classifySourceAuthority(value);
  if (authority === "official-sponsor") {
    return { authority, label: "Official sponsor website", linkLabel: "Open sponsor website" };
  }
  if (authority === "official-program") {
    return { authority, label: "Official scholarship program website", linkLabel: "Open program website" };
  }
  if (authority === "official-school") {
    return { authority, label: "Official school / district website", linkLabel: "Open school source" };
  }
  if (authority === "official-government") {
    return { authority, label: "Official government website", linkLabel: "Open government source" };
  }
  return { authority: "unverified-lead", label: "Sponsor not confirmed", linkLabel: "Open source page" };
}

function excerptAttribution(excerpt, sourceUrl) {
  if (!String(excerpt ?? "").trim()) return null;
  const url = typeof sourceUrl === "string" ? sourceUrl.trim() : "";
  return { url: safeHttps(url) ? url : "", ...getSourceAttribution(url) };
}

/** Resolve each excerpt's attribution from its own URL, with no cross-field fallback. */
export function getEvidenceExcerptAttributions(record = {}) {
  const criteria = {};
  for (const [key, entry] of Object.entries(record.criteriaEvidence ?? {})) {
    const attribution = excerptAttribution(entry?.excerpt, entry?.sourceUrl);
    if (attribution) criteria[key] = attribution;
  }
  return {
    general: excerptAttribution(record.evidenceText, record.evidenceUrl),
    award: excerptAttribution(record.awardEvidenceText, record.awardEvidenceUrl),
    criteria,
  };
}

export function resolveSourceAuthority(record = {}) {
  const explicit = record.sourceAuthority;  // Explicit conservative labels may downgrade a recognized domain, never upgrade
  // a directory URL into an official source.
  if (explicit === "secondary-directory" || explicit === "unverified-lead") return explicit;

  // Authority comes from the page's own URL. Linked-organization or imported
  // metadata cannot transfer its authority to a directory or aggregator page.
  const classified = classifySourceAuthority(record.sourceUrl);
  if (classified !== "unverified-lead") return classified;
  return record.sourceVerified === true ? "unverified-lead" : "secondary-directory";
}

function sponsorCutoffState(record, now, deadline, currentDate) {
  const time = String(record.deadlineTime ?? "").trim();
  if (!time || deadline !== currentDate) return "not-applicable";
  const timeZone = String(record.deadlineTimezone ?? "").trim();
  if (!timeZone || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return "unknown";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!values.hour || !values.minute) return "unknown";
    const currentTime = `${values.hour.padStart(2, "0")}:${values.minute.padStart(2, "0")}`;
    return currentTime >= time ? "passed" : "not-passed";
  } catch {
    return "unknown";
  }
}

export function deriveSourceStatus(record = {}, now = new Date()) {
  const deadline = record.deadline;
  const validDeadline = validDateKey(deadline);
  const hasRecordedDeadline = String(deadline ?? "").trim() !== "";
  const deadlineTimeZone = String(record.deadlineTimezone ?? "").trim();
  const currentDeadlineDate = validDeadline ? calendarDateKey(now, deadlineTimeZone) : null;
  const openDate = String(record.openDate ?? "").trim();
  const validOpenDate = !openDate || validDateKey(openDate);
  const openDateTimeZone = String(record.openDateTimezone ?? "").trim();
  const currentOpenDate = validOpenDate && openDate ? calendarDateKey(now, openDateTimeZone) : null;
  if (!validOpenDate || (openDate && openDateTimeZone && !currentOpenDate)) return "needs-review";
  // A malformed explicit date is contradictory evidence, not a date-free
  // rolling/unpublished deadline. Never let fallback wording verify it.
  if (hasRecordedDeadline && !validDeadline) return "needs-review";
  if (validDeadline && deadlineTimeZone && !currentDeadlineDate) return "needs-review";
  // A recorded final date before the opening date is not a coherent single-cycle
  // window. Require a fresh sponsor review instead of classifying it as expired.
  if (validDeadline && openDate && deadline < openDate) return "needs-review";
  const notYetOpen = Boolean(openDate && currentOpenDate && openDate > currentOpenDate);
  if (validDeadline && currentDeadlineDate && deadline < currentDeadlineDate) {
    // A future opening date indicates a forthcoming cycle; a stale prior-cycle
    // deadline must not make that opportunity appear expired.
    return notYetOpen ? "needs-review" : "expired";
  }
  const cutoffState = validDeadline && currentDeadlineDate
    ? sponsorCutoffState(record, now, deadline, currentDeadlineDate)
    : "not-applicable";
  if (cutoffState === "unknown") return "needs-review";
  if (cutoffState === "passed") return notYetOpen ? "needs-review" : "expired";

  const hasDeadlineEvidence = validDeadline || record.deadlineNotPublished === true || hasNonDateDeadlineEvidence(record);
  const verified = record.sourceVerified === true &&
    TRUSTED_AUTHORITIES.has(record.sourceAuthority) &&
    TRUSTED_AUTHORITIES.has(classifySourceAuthority(record.sourceUrl)) &&
    safeHttps(record.sourceUrl) &&
    isSameOfficialSponsorSource(record.sourceUrl, record.evidenceUrl) &&
    Boolean(String(record.provider ?? "").trim()) &&
    Boolean(String(record.award ?? "").trim()) &&
    hasAwardEvidence(record) &&
    hasDeadlineEvidence &&
    Boolean(String(record.evidenceText ?? "").trim()) &&
    hasCriterionEvidence(record) &&
    isRecentCheck(record.lastCheckedDate, now);

  return verified ? "verified" : "needs-review";
}

/**
 * Explain which sponsor-listing evidence fields are present. This reviews the
 * scholarship source only; it does not assess any student's eligibility. */
export function getEvidenceCompleteness(record = {}, now = new Date()) {
  const source = record && typeof record === "object" ? record : {};
  const checks = [
    { label: "Sponsor review marked complete", complete: source.sourceVerified === true },
    { label: "Official HTTPS source", complete: TRUSTED_AUTHORITIES.has(source.sourceAuthority) && TRUSTED_AUTHORITIES.has(classifySourceAuthority(source.sourceUrl)) && safeHttps(source.sourceUrl) },
    { label: "Sponsor and award details", complete: Boolean(String(source.provider ?? "").trim() && String(source.award ?? "").trim()) },
    { label: "Award wording and currency evidence", complete: hasAwardEvidence(source) },
    { label: "Deadline evidence", complete: validDateKey(source.deadline) || (!String(source.deadline ?? "").trim() && (source.deadlineNotPublished === true || hasNonDateDeadlineEvidence(source))) },
    { label: "General excerpt's official source URL", complete: isSameOfficialSponsorSource(source.sourceUrl, source.evidenceUrl) },
    { label: "Eligibility evidence excerpt", complete: Boolean(String(source.evidenceText ?? "").trim()) },
    { label: "Criterion-specific sponsor evidence", complete: hasCriterionEvidence(source) },
    { label: "Sponsor check within 30 days", complete: isRecentCheck(source.lastCheckedDate, now) },
  ];
  const missing = checks.filter((item) => !item.complete).map((item) => item.label);
  const completedCount = checks.length - missing.length;
  return { complete: missing.length === 0, completedCount, totalCount: checks.length, missing, checks };
}

function normalizedPart(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function scholarshipDedupeKey(record = {}) {
  const title = normalizedPart(record.name ?? record.title);
  const sponsor = normalizedPart(record.provider ?? record.sponsor);
  const deadline = String(record.deadline ?? "").slice(0, 4);
  return [title, sponsor, deadline].join("|");
}

function completeness(record) {
  return [
    record.sourceVerified === true ? 8 : 0,
    record.sourceAuthority && TRUSTED_AUTHORITIES.has(record.sourceAuthority) ? 5 : 0,
    record.evidenceText ? 4 : 0,
    record.awardEvidenceText && record.awardEvidenceUrl ? 3 : 0,
    record.lastCheckedDate ? 2 : 0,
    record.sourceUrl ? 2 : 0,
    record.deadline ? 1 : 0,
    record.award ? 1 : 0,
    record.criteria && Object.keys(record.criteria).length ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}
export function deduplicateScholarshipRecords(records = []) {
  if (!Array.isArray(records)) return [];
  const unique = new Map();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const title = normalizedPart(record.name ?? record.title);
    const sponsor = normalizedPart(record.provider ?? record.sponsor);
    // Without a confirmed calendar year, the award cycle is ambiguous.
    // Preserve the record independently rather than merging recurring awards.
    if (!title || !sponsor || !validDateKey(record.deadline)) {
      unique.set(Symbol("unconfirmed-scholarship-cycle"), record);
      continue;
    }
    const key = scholarshipDedupeKey(record);
    const previous = unique.get(key);
    if (!previous) {
      unique.set(key, record);
      continue;
    }
    const preferred = completeness(record) > completeness(previous) ? record : previous;
    const fallback = preferred === record ? previous : record;
    unique.set(key, {
      ...fallback,
      ...preferred,
      evidenceText: preferred.evidenceText || fallback.evidenceText || "",
      awardEvidenceText: preferred.awardEvidenceText || fallback.awardEvidenceText || "",
      awardEvidenceUrl: preferred.awardEvidenceUrl || fallback.awardEvidenceUrl || "",
      awardCurrencyBasis: preferred.awardCurrencyBasis || fallback.awardCurrencyBasis || "",
      awardBasis: preferred.awardBasis || fallback.awardBasis || "",
      sourceUrl: preferred.sourceUrl || fallback.sourceUrl || "",
      deadlineText: preferred.deadlineText || fallback.deadlineText || "",
      lastCheckedDate: preferred.lastCheckedDate || fallback.lastCheckedDate || "",
      criteria: Object.keys(preferred.criteria ?? {}).length
        ? preferred.criteria
        : (fallback.criteria ?? {}),
    });
  }
  return [...unique.values()];
}

export function normalizeScholarshipRecord(record = {}, now = new Date()) {
  const deadlineText = String(record.deadlineText ?? "").trim() ||
    (record.deadline ? record.deadline : record.deadlineNotPublished === true ? "No deadline published by sponsor" : "Deadline not confirmed");
  const parsedDeadlineTime = parseSponsorDeadlineTime(deadlineText);
  const recordedTimeZone = String(record.deadlineTimezone ?? "").trim();
  const parsedTimeZone = parsedDeadlineTime?.timeZoneText ?? "";
  const normalized = {
    ...record,
    deadlineText,
    deadlineTime: parsedDeadlineTime?.time ?? "",
    deadlineTimezoneText: parsedTimeZone,
    // The editable calculation zone is kept separate from the sponsor's exact
    // wording; never convert an abbreviation or label into an assumed IANA zone.
    deadlineTimezone: recordedTimeZone,
    // Discovery date is not a sponsor-check date; never promote it into lastCheckedDate.
    lastCheckedDate: normalizeSourceCheckDate(record.lastCheckedDate, now),
    sourceAuthority: resolveSourceAuthority(record),
  };
  const sourceStatus = deriveSourceStatus(normalized, now);
  return { ...normalized, sourceStatus, sourceVerified: sourceStatus === "verified" };
}

/**
 * Normalize tracker records without collapsing records that may have separate
 * application checklists, workspaces, or histories. Duplicate detection belongs
 * in the non-destructive suggestion workflow, not ordinary persistence.
 */
export function normalizeScholarshipRecords(records = [], now = new Date()) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === "object" && !Array.isArray(record))
    .map((record) => normalizeScholarshipRecord(record, now));
}

export function normalizeAndDeduplicateScholarships(records = [], now = new Date()) {
  return normalizeScholarshipRecords(deduplicateScholarshipRecords(records), now);}
