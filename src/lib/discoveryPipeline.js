import { sanitizePublicHttpsUrl } from "./evidence.js";
import { stateMatchesText } from "../../supabase/functions/_shared/us-states.mjs";

function cleanText(value, maxLength = 2000) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function canonicalizeUrl(value) {
  const safeUrl = sanitizePublicHttpsUrl(value);
  if (!safeUrl) return null;
  try {
    const url = new URL(safeUrl);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return null;
  }
}

function normalizedTitle(value) {
  return cleanText(value, 220).normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function asStringArray(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => cleanText(item, 600)).filter(Boolean))];
}

const KNOWN_DISCOVERY_CATEGORIES = new Set([
  "local", "school_resources", "regional", "state", "academic", "humanities",
  "leadership", "community_service", "language", "employment", "arts",
  "incoming_college", "national", "general",
]);

function asKnownCategoryArray(value) {
  return asStringArray(value).filter((category) => KNOWN_DISCOVERY_CATEGORIES.has(category));
}

function asNumberArray(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 2))];
}

function resultCompleteness(item) {
  return cleanText(item.excerpt, 1800).length +
    asStringArray(item.discovery_queries).join(" ").length +
    asStringArray(item.discovery_categories).length * 40;
}

function relevance(item, profile = {}) {
  const searchableText = `${item.title} ${item.excerpt}`;
  const searchable = searchableText.toLowerCase();
  const reasons = [];
  let score = 0;
  const state = cleanText(profile.state, 60).toLowerCase();
  const county = cleanText(profile.county, 80).toLowerCase();
  const year = cleanText(profile.graduationYear, 4);

  if (state && stateMatchesText(searchableText, state)) {
    score += 4;
    reasons.push("Matches your state");
  }
  if (county && searchable.includes(county)) {
    score += 4;
    reasons.push("Mentions your county");
  }
  if (year && searchable.includes(year)) {
    score += 4;
    reasons.push(`Mentions class of ${year}`);
  }

  const keywordFields = [
    profile.searchKeywords,
    profile.plannedMajor,
    profile.interests,
    profile.academicStrengths,
    profile.careerInterests,
    profile.awardsHonors,
  ];
  const keywords = [...new Set(keywordFields
    .flatMap((value) => String(value ?? "").split(/[,;\n]/))
    .map((value) => cleanText(value, 80).toLowerCase())
    .filter((value) => value.length >= 3))];
  const matchedKeywords = keywords.filter((keyword) => searchable.includes(keyword));
  if (matchedKeywords.length) {
    score += Math.min(matchedKeywords.length * 3, 9);
    reasons.push(`Matches your interests: ${matchedKeywords.slice(0, 3).join(", ")}`);
  }

  const grade = cleanText(profile.grade, 60).toLowerCase();
  const highSchoolProfile = /high[ -]?school|\b(?:9|10|11|12)(?:th)?\s*grade\b|\b(?:freshman|sophomore|junior|senior)\b/.test(grade) &&
    !/college|undergraduate/.test(grade);
  const collegeProfile = /college|undergraduate|university/.test(grade);
  const mentionsHighSchool = /high school|high-school|graduating senior|graduating student|class of/.test(searchable);
  const mentionsCollege = /college student|undergraduate|university student|enrolled college/.test(searchable);
  if ((highSchoolProfile && mentionsHighSchool) || (collegeProfile && mentionsCollege)) {
    score += 3;
    reasons.push(highSchoolProfile ? "Mentions high-school study level" : "Mentions college study level");
  }

  if (/scholarship|fellowship|grant|student award/.test(searchable)) {
    score += 2;
    reasons.push("Mentions a scholarship or award");
  }
  if (mentionsHighSchool) {
    score += 2;
    reasons.push("Mentions high-school or senior applicants");
  }
  try {
    const host = new URL(item.source_url).hostname.toLowerCase();
    if (host.endsWith(".gov") || host.endsWith(".edu")) {
      score += 1;
      reasons.push("Institutional domain signal (still requires sponsor verification)");
    }
  } catch {
    // Unsafe URLs are filtered before scoring.
  }
  return { score, reasons };
}

/**
 * Defense-in-depth normalization for live search results. It deduplicates
 * equivalent source URLs, merges the categories/queries/pages that found a
 * lead, and deliberately keeps every result unverified.
 */
export function rankAndDeduplicateLiveResults(results, profile = {}) {
  if (!Array.isArray(results)) return [];
  const unique = new Map();

  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const sourceUrl = canonicalizeUrl(raw.source_url);
    const title = cleanText(raw.title, 220);
    if (!sourceUrl || !title) continue;

    let domain = "";
    try {
      domain = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }

    const categoryValues = asKnownCategoryArray(raw.discovery_categories ?? raw.discovery_category);
    const queryValues = asStringArray(raw.discovery_queries ?? raw.discovery_query);
    const pageValues = asNumberArray(raw.discovery_pages ?? raw.discovery_page);
    // Whitelist discovery fields instead of spreading untrusted search metadata.
    // In particular, authority labels and verification claims must never travel
    // from a search result (or a neighboring deduplicated result) into the UI.
    const normalized = {
      id: cleanText(raw.id, 100) || sourceUrl,
      title,
      provider: null,
      source_url: sourceUrl,
      source_domain: domain,
      excerpt: cleanText(raw.excerpt, 1800),
      published_at: cleanText(raw.published_at, 40),
      discovery_source_url: null,
      discovery_category: categoryValues[0] || "",
      discovery_categories: categoryValues,
      discovery_queries: queryValues,
      discovery_pages: pageValues,
      award_text: null,
      deadline: null,
      deadline_text: null,
      deadline_timezone: null,
      deadline_not_published: false,
      last_checked_date: null,
      source_authority: "unverified-lead",
      source_evidence_url: null,
      source_checked_at: null,
      verification_state: "unverified_lead",
    };

    const key = `${sourceUrl}|${normalizedTitle(title)}`;
    const previous = unique.get(key);
    if (!previous) {
      unique.set(key, normalized);
      continue;
    }

    const preferred = resultCompleteness(normalized) > resultCompleteness(previous)
      ? normalized
      : previous;
    const fallback = preferred === normalized ? previous : normalized;
    unique.set(key, {
      ...fallback,
      ...preferred,
      excerpt: cleanText(preferred.excerpt, 1800) || cleanText(fallback.excerpt, 1800),
      discovery_category: preferred.discovery_category || fallback.discovery_category,
      discovery_categories: [...new Set([
        ...asStringArray(previous.discovery_categories),
        ...categoryValues,
      ])],
      discovery_queries: [...new Set([
        ...asStringArray(previous.discovery_queries),
        ...queryValues,
      ])],
      discovery_pages: [...new Set([
        ...asNumberArray(previous.discovery_pages),
        ...pageValues,
      ])],
    });
  }

  return [...unique.values()].map((item) => {
    const match = relevance(item, profile);
    return {
      ...item,
      relevance_score: match.score,
      relevance_reasons: match.reasons,
    };
  }).sort((a, b) =>
    b.relevance_score - a.relevance_score ||
    a.title.localeCompare(b.title),
  );
}

export { canonicalizeUrl as canonicalizeDiscoveryUrl };