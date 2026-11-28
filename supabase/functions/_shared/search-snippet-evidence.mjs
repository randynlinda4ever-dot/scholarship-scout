import { normalizeUsState } from "./us-states.mjs";

const GENERIC_TITLE_TERMS = new Set([
  "scholarship", "scholarships", "fellowship", "fellowships", "grant", "grants",
  "bursary", "bursaries", "award", "awards", "student", "students", "high",
  "school", "senior", "seniors", "class", "college", "undergraduate", "graduate",
  "for", "and", "the", "of", "to", "in", "at", "all", "browse", "find",
  "available", "search", "directory", "listing", "listings", "opportunity",
  "opportunities", "program", "programs",
]);

const MONTH_PATTERN = [
  "jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may",
  "jun(?:e)?", "jul(?:y)?", "aug(?:ust)?", "sep(?:t(?:ember)?)?",
  "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?",
].join("|");

const DEADLINE_CUE = /\b(?:deadline|apply\s+by|submit\s+by|due(?:\s+date)?|applications?\s+(?:are\s+)?(?:due|close)|closes?\s+(?:on|by)|closing\s+date|must\s+be\s+submitted\s+by|no\s+later\s+than)\b/i;
const MONEY_AMOUNT = /(?:[$€£]\s?\d[\d,]*(?:\.\d{1,2})?|\b(?:USD|CAD|EUR|GBP)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|CAD|EUR|GBP|dollars|euros|pounds)\b)/i;
const AWARD_CONTEXT = /\b(?:scholarships?|fellowships?|grants?|bursaries|awards?|tuition|recipients?|funding|award\s+amount)\b/i;
const AWARD_EXCLUSIONS = /\b(?:application\s+fee|processing\s+fee|household\s+income|family\s+income|income\s+limit|cost\s+of\s+attendance|tuition\s+costs?|fee\s+schedule)\b/i;

function normalizeTitle(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function splitSentences(value) {
  const decimalMarker = String.fromCharCode(0xE000);
  const protectedText = String(value ?? "").replace(/(?<=\d)\.(?=\d)/g, decimalMarker);
  return (protectedText.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.replace(new RegExp(decimalMarker, "g"), ".").trim())
    .filter(Boolean);
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

/** Numeric dates are interpreted as US month/day/year; ambiguous day/month input is unsupported. */
export function parseStrictSearchDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const candidates = [];
  const patterns = [
    {
      regex: /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g,
      toParts: (match) => [Number(match[1]), Number(match[2]), Number(match[3])],
    },
    {
      regex: new RegExp("\\b(" + MONTH_PATTERN + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b", "gi"),
      toParts: (match) => {
        const month = match[1].slice(0, 3).toLowerCase();
        const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        return [Number(match[3]), months.indexOf(month) + 1, Number(match[2])];
      },
    },
    {
      regex: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/g,
      toParts: (match) => [Number(match[3]), Number(match[1]), Number(match[2])],
    },
  ];
  for (const { regex, toParts } of patterns) {
    for (const match of raw.matchAll(regex)) {
      const [year, month, day] = toParts(match);
      if (!isValidCalendarDate(year, month, day)) return null;
      candidates.push(String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"));
    }
  }
  const distinct = [...new Set(candidates)];
  return distinct.length === 1 ? distinct[0] : null;
}

function parseDateFromDeadlineSentence(sentence) {
  const datePatterns = [
    /\b20\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b/g,
    new RegExp("\\b(?:" + MONTH_PATTERN + ")\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+20\\d{2}\\b", "gi"),
    /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/20\d{2}\b/g,
  ];
  const matches = datePatterns.flatMap((pattern) => sentence.match(pattern) ?? []);
  const uniqueMatches = [...new Set(matches)];
  return uniqueMatches.length === 1 ? parseStrictSearchDate(uniqueMatches[0]) : null;
}

function isAwardDetailSentence(sentence) {
  return MONEY_AMOUNT.test(sentence) &&
    AWARD_CONTEXT.test(sentence) &&
    !AWARD_EXCLUSIONS.test(sentence);
}

function isDeadlineDetailSentence(sentence) {
  return DEADLINE_CUE.test(sentence) && Boolean(parseDateFromDeadlineSentence(sentence));
}

function hasCompetingNamedEntity(sentence, titleTerms) {
  const phrases = String(sentence).match(/\b(?:[A-Z][a-z]+(?:\s+|$)){2,}/g) ?? [];
  return phrases.some((phrase) => phrase.split(/\s+/).filter((word) => {
    const term = normalizeTitle(word);
    return term.length > 2 && !GENERIC_TITLE_TERMS.has(term) && !titleTerms.has(term);
  }).length >= 2);
}

/** Retains title-matched sentences plus at most two immediate award/deadline details. */
export function matchScholarshipEvidence(title, value) {
  const titleTerms = new Set(normalizeTitle(title).split(" ")
    .filter((term) => term.length > 2 && !GENERIC_TITLE_TERMS.has(term)));
  if (!titleTerms.size) return "";
  const sentences = splitSentences(value);
  const minimumMatches = Math.min(2, titleTerms.size);
  const matchesTitle = (sentence) => {
    const sentenceTerms = new Set(normalizeTitle(sentence).split(" "));
    return [...titleTerms].filter((term) => sentenceTerms.has(term)).length >= minimumMatches;
  };
  const matched = [];
  for (let index = 0; index < sentences.length; index += 1) {
    if (!matchesTitle(sentences[index])) continue;
    matched.push(sentences[index]);
    let included = 0;
    for (let nextIndex = index + 1; nextIndex < sentences.length && included < 2; nextIndex += 1) {
      const next = sentences[nextIndex];
      if (hasCompetingNamedEntity(next, titleTerms)) break;
      if (!isAwardDetailSentence(next) && !isDeadlineDetailSentence(next)) break;
      if (!matchesTitle(next)) matched.push(next);
      included += 1;
    }
  }
  return [...new Set(matched)].join(" ");
}

export function extractScholarshipSearchSignals(value) {
  const sentences = splitSentences(value);
  const awardSentence = sentences.find(isAwardDetailSentence) ?? null;
  const deadlineSentence = sentences.find(isDeadlineDetailSentence) ?? null;
  const deadline = deadlineSentence ? parseDateFromDeadlineSentence(deadlineSentence) : null;
  return {
    awardText: awardSentence ? awardSentence.slice(0, 280) : null,
    deadline,
    deadlineText: deadline ? deadlineSentence.slice(0, 280) : null,
    deadlineNotPublished: false,
  };
}

export function getScholarshipTitleSpecificity(value) {
  const terms = new Set(normalizeTitle(value).split(" ")
    .filter((term) => term.length > 2 && !GENERIC_TITLE_TERMS.has(term)));
  return terms.size * 1000 + Math.min(999, normalizeTitle(value).length);
}

/**
 * Rejects scholarship-directory results, but retains a named award beneath
 * a broad audience route such as /scholarships/for-seniors/award-slug.
 */
export function isScholarshipDirectoryLandingPage(value, title = "", excerpt = "") {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:") return true;
    const pathSegments = url.pathname.split("/").filter(Boolean)
      .map((segment) => decodeURIComponent(segment).toLowerCase());
    const explicitDirectoryPath = pathSegments.some((segment) => [
      "scholarship-directory", "scholarships-directory", "scholarship-search",
      "scholarship-list", "scholarship-listings", "scholarship-database",
      "scholarships-by-state", "scholarship-by-state", "scholarships-by-major",
    ].includes(segment));
    if (explicitDirectoryPath) return true;
    const scholarshipSegmentIndex = pathSegments.findIndex((segment) => /^scholarships?$/.test(segment));
    if (scholarshipSegmentIndex >= 0) {
      const trailingSegments = pathSegments.slice(scholarshipSegmentIndex + 1);
      if (trailingSegments.length === 0 && url.searchParams.has("state")) return true;
      if (trailingSegments.length === 1) {
        if (/^(?:for-[a-z-]+-students?|high-school-seniors?|college-students?)$/.test(trailingSegments[0])) return true;
        if (normalizeUsState(trailingSegments[0])) return true;
      }
    }
    const titleText = String(title ?? "").trim();
    if (/^(?:alphabetical\s+)?(?:index|directory|list|database|catalog(?:ue)?)\b.*\bscholarships?\b/i.test(titleText)) return true;
    if (/^(?:(?:\d[\d,]*\+?)\s+(?:(?:best|top)\s+)?|(?:best|top)\s+(?:\d+\s+)?)(?:[a-z0-9&,'’-]+\s+){0,6}(?:scholarships?|grants?|fellowships?)\b/i.test(titleText)) return true;
    if (/^(?:list of|browse|all)\s+(?:\d+\s+)?(?:[a-z0-9&,'’-]+\s+){0,5}(?:scholarships?|grants?|fellowships?)\b/i.test(titleText)) return true;
    if (/^(?:scholarships?|grants?|fellowships?)\s+(?:for|in|available to)\b/i.test(titleText)) return true;
    const stateIndexTitle = titleText.match(/^(.+?)\s+scholarships\b/i);
    if (stateIndexTitle && normalizeUsState(stateIndexTitle[1])) return true;
    const content = String(excerpt ?? "");
    if (/\b(?:browse|view|compare|filter)\s+(?:our\s+)?(?:complete\s+)?(?:list|directory|database|catalog(?:ue)?|collection)\s+of\s+(?:available\s+)?(?:scholarships?|grants?|fellowships?)\b/i.test(content)) return true;
    if (/\b(?:list|directory|database|catalog(?:ue)?)\s+of\s+(?:\d+\s+)?(?:available\s+)?scholarships?\b/i.test(content)) return true;
    if (/\b(?:top|best)\s+\d[\d,]*\s+(?:scholarships?|grants?|fellowships?)\b/i.test(content)) return true;
    const normalized = normalizeTitle(titleText);
    const hasOpportunityTerm = /\b(?:scholarships?|fellowships?|grants?|awards?)\b/.test(normalized);
    const hasSpecificTitleTerm = normalized.split(" ").some((term) =>
      term.length > 2 && !GENERIC_TITLE_TERMS.has(term) && !/^\d+$/.test(term)
    );
    const broadAudiencePath = pathSegments.some((segment) => [
      "high-school", "high-school-senior", "high-school-seniors", "college-student",
      "college-students", "undergraduate", "undergraduates", "graduate-student",
      "graduate-students", "students",
    ].includes(segment));
    return hasOpportunityTerm && !hasSpecificTitleTerm && broadAudiencePath;
  } catch {
    return true;
  }
}
