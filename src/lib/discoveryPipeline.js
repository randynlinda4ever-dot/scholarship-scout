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

const PROFILE_CONCEPT_GROUPS = Object.freeze([
  ["community service", "community involvement", "volunteer", "volunteering", "volunteerism", "civic engagement", "public service", "nonprofit"],
  ["humanities", "history", "historical studies", "literature", "cultural studies", "social sciences", "anthropology", "heritage"],
  ["environmental science", "environmental studies", "ecology", "conservation", "sustainability", "climate studies"],
  ["leadership", "student government", "civic leadership", "youth leadership", "organization officer"],
  ["language learning", "world languages", "bilingual", "multilingual", "translation", "language proficiency"],
]);

function relatedProfileTerms(keyword) {
  return PROFILE_CONCEPT_GROUPS.find((group) => group.includes(keyword)) || [keyword];
}

function resultCompleteness(item) {
  return cleanText(item.excerpt, 1800).length +
    asStringArray(item.discovery_queries).join(" ").length +
    asStringArray(item.discovery_categories).length * 40;
}

const GENERIC_EVIDENCE_TITLE_TERMS = new Set(["scholarship", "scholarships", "fellowship", "fellowships", "grant", "grants", "award", "awards", "student", "students", "high", "school", "senior", "seniors", "class", "college", "undergraduate", "graduate"]);

function titleMatchedEvidence(title, value) {
  const titleTerms = new Set(normalizedTitle(title).split(" ").filter((term) => term.length > 2 && !GENERIC_EVIDENCE_TITLE_TERMS.has(term)));
  if (!titleTerms.size) return "";
  const sentences = String(value ?? "").match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const minimumMatches = Math.min(2, titleTerms.size);
  const matchesTitle = (sentence) => {
    const terms = new Set(normalizedTitle(sentence).split(" "));
    return [...titleTerms].filter((term) => terms.has(term)).length >= minimumMatches;
  };
  const hasCompetingNamedEntity = (sentence) => {
    const phrases = String(sentence).match(/\b(?:[A-Z][a-z]+(?:\s+|$)){2,}/g) || [];
    return phrases.some((phrase) => phrase.split(/\s+/).filter((word) => {
      const term = normalizedTitle(word);
      return term.length > 2 && !GENERIC_EVIDENCE_TITLE_TERMS.has(term) && !titleTerms.has(term);
    }).length >= 2);
  };
  const matched = [];
  for (let index = 0; index < sentences.length; index += 1) {
    if (!matchesTitle(sentences[index])) continue;
    matched.push(sentences[index]);
    const next = sentences[index + 1];
    const isGenericDeadlineContinuation = next &&
      /deadline|apply by|submit by|due by|due date|applications? (?:are )?due|applications? close|closes? on|closing date|must be submitted by/i.test(next) &&
      !hasCompetingNamedEntity(next);
    if (isGenericDeadlineContinuation && !matchesTitle(next)) matched.push(next);
  }
  return [...new Set(matched)].join(" ");
}

function parseStrictSearchDate(value) {
  const raw = String(value ?? "").trim();
  let year;
  let month;
  let day;
  const iso = raw.match(/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const named = raw.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})$/i);
    if (!named) return null;
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[1].slice(0, 3).toLowerCase());
    if (monthIndex < 0) return null;
    year = Number(named[3]);
    month = monthIndex + 1;
    day = Number(named[2]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractSearchSignals(value) {
  const text = cleanText(value, 3600);
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const awardText = sentences.find((sentence) =>
    /(?:\$\s?\d|\b(?:USD|CAD|EUR|GBP)\s?\d|\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|euros|pounds)\b)/i.test(sentence) &&
    /scholarship|fellowship|grant|bursary|award|tuition/i.test(sentence) &&
    !/application fee|processing fee|household income|family income|income limit|cost of attendance/i.test(sentence)
  ) || null;
  const deadlineText = sentences.find((sentence) =>
    /deadline|apply by|submit by|due by|applications? (?:are )?due|due date|applications? close|closes? on|closing date|must be submitted by/i.test(sentence) &&
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b|\b20\d{2}-\d{2}-\d{2}\b/i.test(sentence)
  ) || null;
  const dateText = deadlineText?.match(/\b20\d{2}-\d{2}-\d{2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b/i)?.[0];
  const deadline = dateText ? parseStrictSearchDate(dateText) : null;
  return { awardText: awardText ? cleanText(awardText, 280) : null, deadline, deadlineText: deadline ? cleanText(deadlineText, 280) : null };
}

function relevance(item, profile = {}) {
  const searchableText = `${item.title} ${item.excerpt}`;
  const searchable = searchableText.toLowerCase();
  const reasons = [];
  let earned = 0;
  let available = 0;
  const state = cleanText(profile.state, 60).toLowerCase();
  const county = cleanText(profile.county, 80).toLowerCase();
  const year = cleanText(profile.graduationYear, 4);

  if (state) {
    available += 15;
    if (stateMatchesText(searchableText, state)) { earned += 15; reasons.push("Matches your state"); }
  }
  if (county) {
    available += 10;
    if (` ${searchable.replace(/[^a-z0-9]+/g, " ").trim()} `.includes(` ${county.replace(/[^a-z0-9]+/g, " ").trim()} `)) { earned += 10; reasons.push("Mentions your county"); }
  }
  if (year) {
    available += 15;
    const yearMentioned = new RegExp(`(?:class\\s+of\\s+${year}|${year}\\s+graduates?|graduating\\s+(?:in\\s+)?${year})\\b`, "i").test(searchable);
    if (yearMentioned) { earned += 15; reasons.push(`Mentions class of ${year}`); }
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
  const keywordMatches = keywords.map((keyword) => {
    const matchedTerm = relatedProfileTerms(keyword).find((term) => searchable.includes(term));
    return matchedTerm ? { keyword, matchedTerm, related: matchedTerm !== keyword } : null;
  }).filter(Boolean);
  if (keywords.length) {
    available += 20;
    earned += Math.min(20, keywordMatches.filter((match) => !match.related).length * 10 + keywordMatches.filter((match) => match.related).length * 6);
    const directMatches = keywordMatches.filter((match) => !match.related).map((match) => match.keyword);
    const relatedMatches = keywordMatches.filter((match) => match.related).map((match) => match.keyword);
    if (directMatches.length) reasons.push(`Matches your interests: ${directMatches.slice(0, 3).join(", ")}`);
    if (relatedMatches.length) reasons.push(`Matches related concepts for your interests: ${relatedMatches.slice(0, 3).join(", ")}`);
  }

  const consensusCount = Number(item.search_consensus_count) || 0;
  const consensusScore = Number(item.search_consensus_score) || 0;
  if (consensusCount >= 2 && consensusScore > 0) {
    available += 10;
    earned += Math.min(10, consensusScore * 10);
    reasons.push("Found across multiple search variations");
  }

  const grade = cleanText(profile.grade, 60).toLowerCase();
  const highSchoolProfile = /high[ -]?school|\b(?:9|10|11|12)(?:th)?\s*grade\b|\b(?:freshman|sophomore|junior|senior)\b/.test(grade) &&
    !/college|undergraduate/.test(grade);
  const collegeProfile = /college|undergraduate|university/.test(grade);
  const mentionsHighSchool = /high school|high-school|graduating senior|graduating student|class of/.test(searchable);
  const mentionsCollege = /college student|undergraduate|university student|enrolled college/.test(searchable);
  if (highSchoolProfile || collegeProfile) {
    available += 10;
    if ((highSchoolProfile && mentionsHighSchool) || (collegeProfile && mentionsCollege)) {
      earned += 10;
      reasons.push(highSchoolProfile ? "Matches your high-school study level" : "Matches your college study level");
    }
  }

  available += 5;
  if (/scholarship|fellowship|grant|student award/.test(searchable)) { earned += 5; reasons.push("Identifies a scholarship or award"); }
  available += 5;
  if (item.award_text) { earned += 2.5; reasons.push("Includes an award amount"); }
  if (item.deadline && item.deadline_text) { earned += 2.5; reasons.push("Includes a dated deadline"); }
  try {
    const host = new URL(item.source_url).hostname.toLowerCase();
    available += 5;
    if (host.endsWith(".gov") || host.endsWith(".edu")) {
      earned += 5;
      reasons.push("Institutional domain signal (sponsor still needs verification)");
    }
  } catch {
    // Unsafe URLs are filtered before scoring.
  }
  return { score: available ? Math.round((earned / available) * 100) : 0, reasons };
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
    const consensusScoreValue = Number(raw.search_consensus_score);
    const consensusCountValue = Number(raw.search_consensus_count);
    const rawExcerpt = cleanText(raw.excerpt, 1800);
    const rawEvidenceExcerpt = cleanText(raw.evidence_excerpt, 3600) || rawExcerpt;
    const evidenceExcerpt = titleMatchedEvidence(title, rawEvidenceExcerpt);
    const excerpt = rawExcerpt;
    // Re-derive structured clues only from sentences that independently match
    // this scholarship title; never trust adjacent snippets or supplied fields.
    const signals = extractSearchSignals(`${title}. ${evidenceExcerpt}`);
    const safeAwardText = signals.awardText;
    const safeDeadlineText = signals.deadlineText;
    const safeDeadline = signals.deadline;
    const normalized = {
      id: cleanText(raw.id, 100) || sourceUrl,
      title,
      provider: null,
      source_url: sourceUrl,
      source_domain: domain,
      excerpt,
      evidence_excerpt: evidenceExcerpt,
      award_text: safeAwardText,
      award_evidence_text: safeAwardText,
      award_evidence_url: safeAwardText ? sourceUrl : null,
      deadline: safeDeadline || null,
      deadline_text: safeDeadline ? safeDeadlineText : null,
      search_consensus_score: Number.isFinite(consensusScoreValue) ? Math.max(0, Math.min(1, consensusScoreValue)) : 0,
      search_consensus_count: Number.isSafeInteger(consensusCountValue) ? Math.max(0, Math.min(24, consensusCountValue)) : 0,
      published_at: cleanText(raw.published_at, 40),
      discovery_source_url: null,
      discovery_category: categoryValues[0] || "",
      discovery_categories: categoryValues,
      discovery_queries: queryValues,
      discovery_pages: pageValues,
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
    const mergedEvidence = titleMatchedEvidence(title, [previous.evidence_excerpt, normalized.evidence_excerpt].filter(Boolean).join(" ").slice(0, 3600));
    const mergedExcerpt = cleanText(preferred.excerpt, 1800) || cleanText(fallback.excerpt, 1800);
    const mergedSignals = extractSearchSignals(`${title}. ${mergedEvidence}`);
    unique.set(key, {
      ...fallback,
      ...preferred,
      excerpt: mergedExcerpt,
      evidence_excerpt: mergedEvidence,
      award_text: mergedSignals.awardText,
      award_evidence_text: mergedSignals.awardText,
      award_evidence_url: mergedSignals.awardText ? sourceUrl : null,
      deadline: mergedSignals.deadline,
      deadline_text: mergedSignals.deadlineText,
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
      search_consensus_score: Math.max(previous.search_consensus_score || 0, normalized.search_consensus_score || 0),
      search_consensus_count: Math.max(previous.search_consensus_count || 0, normalized.search_consensus_count || 0),
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
    b.search_consensus_score - a.search_consensus_score ||
    a.title.localeCompare(b.title),
  );
}

export { canonicalizeUrl as canonicalizeDiscoveryUrl };
