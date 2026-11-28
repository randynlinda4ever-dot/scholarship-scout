const MAX_SEARCH_PAGE = 2;
const MAX_RESULTS = 40;
const SEARCH_CONCURRENCY = 4;
const MAX_SEARCH_CONCURRENCY = 8;
const MAX_BODY_BYTES = 8192;
const DISCOVERY_CACHE_TTL_MS = 120_000;
const DISCOVERY_CACHE_MAX_ENTRIES = 100;
const MAX_SEARCH_REQUESTS = 24;
const MIN_QUALITY_RESULTS_PER_CATEGORY = 5;
const MIN_CANDIDATE_QUALITY_SCORE = 5;
const RRF_RANK_CONSTANT = 60;
const MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 150;
const MAX_RETRY_DELAY_MS = 1_000;
const MAX_TOTAL_SEARCH_BUDGET_MS = 22_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
import { normalizeUsState, stateMatchesText } from "./us-states.mjs";
import { createPublicRateLimiter } from "./discovery-rate-limit.mjs";
export { createPublicRateLimiter, createUpstashRateLimiter, getPublicClientAddress } from "./discovery-rate-limit.mjs";
export const ALLOWED_CATEGORIES = Object.freeze([
  "local", "school_resources", "regional", "state", "academic", "humanities",
  "leadership", "community_service", "language", "employment", "arts",
  "incoming_college", "national", "general",
]);
const clean = (value, maxLength) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
function parseRetryAfterDelayMs(value, nowMs) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) * 1000;
  const retryAt = Date.parse(raw);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : Number.NaN;
}
const CATEGORY_VARIATIONS = {
  local: [
    "local and county scholarships from community foundations and civic organizations",
    "city and county student awards, local foundations, and official sponsor application pages",
    "regional volunteer, neighborhood, rural-community, and resident scholarship programs",
  ],
  school_resources: [
    "high school counselor scholarship lists, district foundations, and school award programs",
    "school-specific scholarships, graduating class awards, and district education foundations",
    "official high school financial aid resources, local donor awards, and application requirements",
  ],
  regional: [
    "regional student scholarship programs and community foundations",
    "multi-county scholarship awards, regional education foundations, and official program pages",
    "regional student grants, resident eligibility, and sponsor application deadlines",
  ],
  state: [
    "statewide scholarship programs and education grants for students",
    "state resident scholarships, state education agency grants, and official eligibility requirements",
    "state scholarship compendiums, public higher education aid programs, and current application cycles",
  ],
  academic: [
    "academic merit scholarships for students, grades, honors, and achievement",
    "GPA, class rank, academic competition, and high-achievement student scholarships",
    "official merit award criteria, academic recognition programs, and application deadlines",
  ],
  humanities: [
    "humanities, history, culture, social science, and writing scholarships for students",
    "literature, languages, anthropology, cultural heritage, philosophy, and history student awards",
    "research, archives, public humanities, and social-science scholarship application programs",
  ],
  leadership: [
    "student leadership, organization officer, civic engagement, and youth leadership scholarships",
    "student government, youth councils, nonprofit leadership, and civic leadership awards",
    "official leadership recognition scholarships and community impact application criteria",
  ],
  community_service: [
    "volunteer service, nonprofit involvement, and community service scholarships",
    "civic engagement, public service, volunteer leadership, and community impact awards",
    "service-learning, volunteer recognition, and nonprofit participation student scholarships",
  ],
  language: [
    "world language learning, multilingual students, and language study scholarships",
    "bilingual achievement, language immersion, translation, and world-language student awards",
    "language proficiency competitions, heritage language programs, and application criteria",
  ],
  employment: [
    "employer sponsored scholarships, workplace scholarships, and career training awards",
    "employee family scholarships, trade associations, apprenticeships, and workforce education grants",
    "career pathway, industry association, and employer foundation application programs",
  ],
  arts: [
    "visual art, design, theater, music, speech, and creative student scholarships",
    "portfolio awards, creative writing, performing arts, film, and design scholarships",
    "arts foundations, juried student competitions, and official sponsor application criteria",
  ],
  incoming_college: [
    "incoming college student scholarships and first year university awards",
    "new undergraduate, admitted student, department, and college-specific scholarships",
    "official university freshman award criteria, college application deadlines, and merit programs",
  ],
  national: [
    "national scholarships open to students across the United States",
    "nationwide student awards from foundations, nonprofits, and corporate sponsors",
    "national scholarship competitions, broad eligibility, and official application cycles",
  ],
  general: [
    "general student scholarships with broad eligibility requirements",
    "student grants, education awards, and scholarships without narrow subject restrictions",
    "broad-eligibility student scholarships, official sponsor application pages, and current application requirements",
  ],
};
export function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "metadata.google.internal" || host === "metadata" || host.endsWith(".internal") ||
      host === "home.arpa" || host.endsWith(".home.arpa") || host.endsWith(".lan") || host.endsWith(".intranet")) return false;
    if (host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || !host.includes(".")) return false;
    return true;
  } catch { return false; }
}
export function canonicalizeUrl(value) {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  const privateParameter = /(?:email|e_mail|phone|mobile|telephone|tel|first.?name|last.?name|full.?name|student|user.?id|account.?id|member.?id|contact|recipient|profile|address|birth|dob|ssn|social.?security|token|auth|authorization|password|secret|session|cookie|api.?key|client.?key|access.?key|credential|verification.?code)/i;
  const privateValue = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:^|\D)\d{3}[- .]?\d{2}[- .]?\d{4}(?:\D|$)|(?:^|\D)\+?\d[\d ().-]{6,}\d(?:\D|$))/i;
  for (const [key, entry] of [...url.searchParams.entries()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"].includes(lower) ||
        privateParameter.test(key) || privateValue.test(entry)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
function isScholarshipDirectoryLandingUrl(value, title = "") {
  try {
    const pathSegments = new URL(value).pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment).toLowerCase());
    const explicitDirectoryPath = pathSegments.some((segment) => [
      "scholarship-directory", "scholarships-directory", "scholarship-search",
      "scholarship-list", "scholarship-listings", "scholarship-database",
      "scholarships-by-state", "scholarship-by-state", "scholarships-by-major",
    ].includes(segment));
    if (explicitDirectoryPath) return true;
    const scholarshipSegmentIndex = pathSegments.findIndex((segment) => /^scholarships?$/.test(segment));
    if (scholarshipSegmentIndex >= 0) {
      const trailingSegments = pathSegments.slice(scholarshipSegmentIndex + 1);
      if (trailingSegments.some((segment) => /^for-[a-z-]+-students?$/.test(segment))) return true;
      if (trailingSegments.length === 1 && normalizeUsState(trailingSegments[0])) return true;
      if (new URL(value).searchParams.has("state")) return true;
    }
    const titleText = String(title ?? "").trim();
    const stateIndexTitle = titleText.match(/^(.+?)\s+scholarships\b/i);
    if (stateIndexTitle && normalizeUsState(stateIndexTitle[1])) return true;
    if (/^(?:alphabetical\s+)?(?:index|directory|list|database|catalog(?:ue)?)\b.*\bscholarships?\b/i.test(titleText)) return true;
    if (/^(?:top|best|list of|browse|all)\s+(?:\d+\s+)?(?:[a-z0-9&,'’-]+\s+){0,5}(?:scholarships?|grants?|fellowships?)\b/i.test(titleText)) return true;

    const genericTitleTerms = new Set([
      "scholarship", "scholarships", "fellowship", "fellowships", "grant", "grants", "award", "awards",
      "student", "students", "high", "school", "senior", "seniors", "class", "college", "undergraduate", "graduate",
      "for", "and", "the", "of", "to", "in", "at", "all", "browse", "find", "available", "search", "directory", "listing", "listings",
    ]);
    const normalizedTitle = normalizeTitle(title);
    const hasOpportunityTerm = /\b(?:scholarships?|fellowships?|grants?|awards?)\b/.test(normalizedTitle);
    const hasSpecificTitleTerm = normalizedTitle.split(" ").some((term) => term.length > 2 && !genericTitleTerms.has(term) && !/^\d+$/.test(term));
    const broadAudiencePath = pathSegments.some((segment) => [
      "high-school", "high-school-senior", "high-school-seniors", "college-student", "college-students",
      "undergraduate", "undergraduates", "graduate-student", "graduate-students", "students",
    ].includes(segment));
    return hasOpportunityTerm && !hasSpecificTitleTerm && broadAudiencePath;
  } catch { return true; }
}

export function normalizeTitle(value) {
  return clean(value, 220).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function buildSearchJobs(state, graduationYear, categories) {
  const jobs = [];
  const selectedCategories = [...new Set(Array.isArray(categories) ? categories : [])]
    .filter((category) => ALLOWED_CATEGORIES.includes(category));
  for (const category of selectedCategories) {
    const variations = CATEGORY_VARIATIONS[category] || [];
    for (let variationIndex = 0; variationIndex < variations.length; variationIndex += 1) {
      const variation = variations[variationIndex];
      const detailIntent = variationIndex === 2 ? " award amount scholarship value application deadline current cycle" : "";
      const query = clean(`${variation} ${state} ${graduationYear} scholarship application eligibility${detailIntent}`, 600);
      for (let page = 1; page <= MAX_SEARCH_PAGE; page += 1) {
        jobs.push({ category, query, page, variation: variationIndex + 1 });
      }
    }
  }
  return jobs;
}
export function scoreCandidateQuality({ title = "", excerpt = "", domain = "", state = "", year = "" } = {}) {
  const titleText = clean(title, 220).toLowerCase();
  const excerptText = clean(excerpt, 1800).toLowerCase();
  const searchableText = `${titleText} ${excerptText}`;
  const host = clean(domain, 180).toLowerCase();
  const reasons = [];
  let score = 0;
  const titleOpportunity = /scholarship|fellowship|grant|bursary|student award|education award/.test(titleText);
  const opportunitySignal = /scholarship|fellowship|grant|bursary|student award|education award/.test(searchableText);
  if (titleOpportunity) { score += 3; reasons.push("Opportunity-specific title"); }
  else if (opportunitySignal) { score += 1; reasons.push("Mentions a scholarship or award"); }
  if (/eligible|eligibility|application|apply|deadline|criteria|requirements/.test(searchableText)) {
    score += 2;
    reasons.push("Contains application or eligibility details");
  }
  const searchSignals = extractScholarshipSearchSignals(searchableText);
  if (searchSignals.awardText) { score += 1; reasons.push("Snippet includes an award amount"); }
  if (searchSignals.deadline) { score += 1; reasons.push("Snippet includes a dated deadline"); }
  if (/student|undergraduate|high school|high-school|graduating senior|college applicant/.test(searchableText)) {
    score += 1;
    reasons.push("Identifies a student audience");
  }
  if (state && stateMatchesText(searchableText, state)) {
    score += 2;
    reasons.push("Matches the selected state");
  }
  if (year && searchableText.includes(String(year))) {
    score += 2;
    reasons.push("Mentions the graduation year");
  }
  if (host.endsWith(".gov") || host.endsWith(".edu")) {
    score += 1;
    reasons.push("Institutional host signal; authority remains unverified");
  }
  return { score, reasons, isUseful: opportunitySignal && score >= MIN_CANDIDATE_QUALITY_SCORE };
}
function calculateRelevance(title, excerpt, domain, state, year) {
  const searchableText = `${title} ${excerpt}`;
  const searchable = searchableText.toLowerCase();
  const reasons = [];
  let score = 0;
  if (stateMatchesText(searchableText, state)) { score += 4; reasons.push("Matches the selected state"); }
  const yearMentioned = new RegExp(`(?:class\\s+of\\s+${String(year)}|${String(year)}\\s+graduates?|graduating\\s+(?:in\\s+)?${String(year)}|graduation\\s+(?:year\\s+)?${String(year)})\\b`, "i").test(searchable);
  if (yearMentioned) { score += 4; reasons.push(`Mentions class of ${year}`); }
  if (/scholarship|fellowship|grant|student award/.test(searchable)) { score += 2; reasons.push("Mentions a scholarship or award"); }
  if (/high school|high-school|graduating senior|graduating student|class of/.test(searchable)) { score += 2; reasons.push("Mentions high-school or senior applicants"); }
  if (domain.endsWith(".gov") || domain.endsWith(".edu")) { score += 1; reasons.push("Institutional domain signal; sponsor still needs verification"); }
  return { score, reasons };
}
export async function fetchSearchPage(gatewayBase, gatewayToken, job, {
  fetchImpl = fetch,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxRetries = MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  deadlineAt = Number.POSITIVE_INFINITY,
  clock = () => Date.now(),
} = {}) {
  const searchUrl = new URL("/search", gatewayBase);
  searchUrl.searchParams.set("q", job.query);
  searchUrl.searchParams.set("pageno", String(job.page));
  let retryAttempts = 0;
  try {
    while (true) {
      const remainingMs = deadlineAt - clock();
      if (remainingMs <= 0) return { ok: false, job, failureCode: "search_budget_exhausted", retryAttempts };
      const response = await fetchImpl(searchUrl, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${gatewayToken}` },
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, Math.min(12_000, remainingMs))),
      });
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, job, status: response.status, failureCode: "http_redirect", retryAttempts };
      }
      const finalResponseUrl = response.url || searchUrl.href;
      if (response.redirected || !isSafeHttpsUrl(finalResponseUrl) || new URL(finalResponseUrl).href !== searchUrl.href) {
        return { ok: false, job, failureCode: "unsafe_response_url", retryAttempts };
      }
      if (response.ok) {
        const payload = await response.json();
        if (!Array.isArray(payload?.results)) return { ok: false, job, status: 502, failureCode: "invalid_response_payload", retryAttempts };
        return { ok: true, job, results: payload.results.slice(0, 15), retryAttempts };
      }
      if (!RETRYABLE_STATUSES.has(response.status) || retryAttempts >= maxRetries) {
        return { ok: false, job, status: response.status, retryAttempts };
      }
      const retryAfter = response.headers?.get?.("retry-after");
      const requestedDelay = retryAfter == null
        ? retryDelayMs
        : parseRetryAfterDelayMs(retryAfter, clock());
      if (!Number.isFinite(requestedDelay) || requestedDelay < 0 || requestedDelay > MAX_RETRY_DELAY_MS) {
        return { ok: false, job, status: response.status, retryAttempts };
      }
      if (deadlineAt - clock() <= requestedDelay) return { ok: false, job, status: response.status, failureCode: "search_budget_exhausted", retryAttempts };
      await sleepImpl(Math.ceil(requestedDelay));
      retryAttempts += 1;
    }
  } catch (error) {
    const errorName = String(error?.name ?? "").toLowerCase();
    const causeCode = String(error?.cause?.code ?? error?.code ?? "").toUpperCase();
    const safeMessage = `${String(error?.message ?? "")} ${String(error?.cause?.message ?? "")}`.toLowerCase();
    const failureCode = errorName === "timeouterror" || safeMessage.includes("timeout") || safeMessage.includes("timed out")
      ? "network_timeout"
      : /^[A-Z0-9_]{2,32}$/.test(causeCode)
      ? `network_${causeCode.toLowerCase()}`
      : safeMessage.includes("certificate") || safeMessage.includes("tls")
      ? "network_tls_error"
      : safeMessage.includes("dns") || safeMessage.includes("resolve") || safeMessage.includes("lookup")
      ? "network_dns_error"
      : safeMessage.includes("invalid header") || safeMessage.includes("header value")
      ? "network_invalid_header"
      : safeMessage.includes("connect") || safeMessage.includes("socket")
      ? "network_connect_error"
      : safeMessage.includes("error sending request")
      ? "network_send_error"
      : errorName ? `network_${errorName.replace(/[^a-z0-9_]/g, "").slice(0, 24)}` : "network_error";
    // Keep diagnostics categorical: never log request URLs, query text, or credentials.
    return { ok: false, job, failureCode, retryAttempts };
  }
}
export async function runBoundedSearches(gatewayBase, gatewayToken, jobs, {
  fetchImpl = fetch,
  sleepImpl,
  maxRetries = MAX_RETRIES,
  concurrency = SEARCH_CONCURRENCY,
  deadlineAt = Number.POSITIVE_INFINITY,
  clock = () => Date.now(),
} = {}) {
  const outcomes = new Array(jobs.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      outcomes[index] = await fetchSearchPage(gatewayBase, gatewayToken, jobs[index], { fetchImpl, sleepImpl, maxRetries, deadlineAt, clock });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return outcomes;
}
function countQualityCategoryResults(outcomes, category, state = "", graduationYear = "") {
  const unique = new Set();
  for (const outcome of outcomes) {
    if (!outcome.ok || outcome.job.category !== category) continue;
    for (const item of outcome.results) {
      const title = clean(item?.title, 220);
      if (!title || !isSafeHttpsUrl(item?.url) || isScholarshipDirectoryLandingUrl(item.url, item.title)) continue;
      try {
        const url = canonicalizeUrl(item.url);
        const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
        const quality = scoreCandidateQuality({
          title,
          excerpt: item?.content ?? item?.snippet ?? item?.description,
          domain,
          state,
          year: graduationYear,
        });
        if (quality.isUseful) unique.add(`${url}|${normalizeTitle(title)}`);
      } catch { /* malformed result */ }
    }
  }
  return unique.size;
}

export function calculateReciprocalRankFusion(rankings, { rankConstant = RRF_RANK_CONSTANT } = {}) {
  const lists = Array.isArray(rankings) ? rankings.filter(Array.isArray) : [];
  const constant = Math.max(1, Math.min(1_000, Math.floor(Number(rankConstant) || RRF_RANK_CONSTANT)));
  const fused = new Map();
  for (const ranking of lists) {
    const seen = new Set();
    for (let index = 0; index < ranking.length; index += 1) {
      const item = ranking[index];
      const title = clean(item?.title, 220);
      if (!title || !isSafeHttpsUrl(item?.url) || isScholarshipDirectoryLandingUrl(item.url, item.title)) continue;
      let url;
      try { url = canonicalizeUrl(item.url); } catch { continue; }
      const key = `${url}|${normalizeTitle(title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const requestedRank = Number(item?.rank);
      const rank = Number.isSafeInteger(requestedRank) && requestedRank > 0 ? requestedRank : index + 1;
      const entry = fused.get(key) ?? { url, title, score: 0, appearances: 0 };
      entry.score += 1 / (constant + rank);
      entry.appearances += 1;
      fused.set(key, entry);
    }
  }
  const maximumScore = lists.length ? lists.length / (constant + 1) : 0;
  return [...fused.values()].map((item) => ({
    ...item,
    consensusScore: maximumScore > 0 ? Math.min(1, item.score / maximumScore) : 0,
  })).sort((left, right) =>
    right.score - left.score || left.title.localeCompare(right.title),
  );
}

/**
 * Search three complementary query intents per category, expanding only when
 * the candidate pool lacks enough distinct, opportunity-specific leads.
 * The 24-request ceiling stays below the gateway's shared 30/minute ceiling.
 */
export async function runAdaptiveSearches(gatewayBase, gatewayToken, jobs, {
  minimumQualityResults = MIN_QUALITY_RESULTS_PER_CATEGORY,
  minimumUniqueResults,
  maxSearchRequests = MAX_SEARCH_REQUESTS,
  totalBudgetMs = MAX_TOTAL_SEARCH_BUDGET_MS,
  state = "",
  graduationYear = "",
  clock = () => Date.now(),
  ...searchOptions
} = {}) {
  const requestedThreshold = minimumUniqueResults ?? minimumQualityResults;
  const threshold = Math.max(1, Math.min(15, Math.floor(Number(requestedThreshold) || MIN_QUALITY_RESULTS_PER_CATEGORY)));
  const requestBudget = Math.max(1, Math.min(MAX_SEARCH_REQUESTS, Math.floor(Number(maxSearchRequests) || MAX_SEARCH_REQUESTS)));
  const requestedRetries = Number(searchOptions.maxRetries ?? MAX_RETRIES);
  const configuredRetries = Number.isFinite(requestedRetries)
    ? Math.max(0, Math.min(MAX_RETRIES, Math.floor(requestedRetries)))
    : MAX_RETRIES;
  const deadlineAt = clock() + Math.max(1, Math.min(MAX_TOTAL_SEARCH_BUDGET_MS, Number(totalBudgetMs) || MAX_TOTAL_SEARCH_BUDGET_MS));
  const outcomes = [];
  let upstreamAttemptsUsed = 0;
  const stages = [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2]];
  for (const [variation, page] of stages) {
    const remainingAttempts = requestBudget - upstreamAttemptsUsed;
    if (deadlineAt - clock() <= 0 || remainingAttempts < 1) break;
    const eligibleStageJobs = jobs.filter((job) =>
      Number(job.variation ?? 1) === variation &&
      Number(job.page) === page &&
      countQualityCategoryResults(outcomes, job.category, state, graduationYear) < threshold
    );
    if (!eligibleStageJobs.length) continue;
    let stageRetries = configuredRetries;
    let maxJobsInStage = Math.floor(remainingAttempts / (1 + stageRetries));
    if (maxJobsInStage < eligibleStageJobs.length && remainingAttempts >= eligibleStageJobs.length) {
      // Use remaining slots for full category coverage rather than reserving
      // retries that cannot fit for the entire stage.
      stageRetries = 0;
      maxJobsInStage = eligibleStageJobs.length;
    }
    const stageJobs = eligibleStageJobs.slice(0, maxJobsInStage);
    if (!stageJobs.length) break;
    const stageOutcomes = await runBoundedSearches(gatewayBase, gatewayToken, stageJobs, {
      ...searchOptions,
      maxRetries: stageRetries,
      deadlineAt,
      clock,
    });
    outcomes.push(...stageOutcomes);
    upstreamAttemptsUsed += stageOutcomes.reduce((total, outcome) => total + 1 + (outcome.retryAttempts || 0), 0);
  }
  return outcomes;
}
export function createDiscoveryResultCache({
  now = () => Date.now(),
  ttlMs = DISCOVERY_CACHE_TTL_MS,
  maxEntries = DISCOVERY_CACHE_MAX_ENTRIES,
} = {}) {
  const entries = new Map();
  const prune = () => {
    const current = now();
    for (const [key, entry] of entries) {
      if (!Number.isFinite(current - entry.createdAt) || current - entry.createdAt >= ttlMs) entries.delete(key);
    }
  };
  const clone = (value) => structuredClone(value);
  return {
    get size() { prune(); return entries.size; },
    get(key) {
      prune();
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      return { value: clone(entry.value), ageMs: Math.max(0, now() - entry.createdAt) };
    },
    set(key, value) {
      if (typeof key !== "string" || !key || ttlMs <= 0 || maxEntries <= 0) return false;
      prune();
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, { createdAt: now(), value: clone(value) });
      return true;
    },
    clear() { entries.clear(); },
  };
}
const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});

function validCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function explicitDateIn(text) {
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  const monthName = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
  const matches = [iso, monthName].filter(Boolean);
  if (matches.length !== 1) return null;
  const year = Number(iso ? iso[1] : monthName[3]);
  const month = iso ? Number(iso[2]) : MONTHS[monthName[1].toLowerCase()];
  const day = Number(iso ? iso[3] : monthName[2]);
  if (!validCalendarDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Extract only verbatim clues present in a search-result title/snippet.
 * These values are discovery hints, never sponsor verification or inferred facts.
 */
export function extractScholarshipSearchSignals(value) {
  const text = clean(value, 1800);
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  const awardSentence = sentences.find((sentence) =>
    /(?:\$\s?\d|\b(?:USD|CAD|EUR|GBP)\s?\d|\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|euros|pounds)\b)/i.test(sentence) &&
    /scholarship|fellowship|grant|bursary|award|tuition/i.test(sentence) &&
    !/application fee|processing fee|household income|family income|income limit|cost of attendance/i.test(sentence)
  ) || null;
  const deadlineSentence = sentences.find((sentence) =>
    /deadline|apply by|submit by|due by|applications? (?:are )?due|due date|applications? close|closes? on|closing date|must be submitted by/i.test(sentence) &&
    explicitDateIn(sentence)
  ) || null;
  return {
    awardText: awardSentence ? clean(awardSentence, 280) : null,
    deadline: deadlineSentence ? explicitDateIn(deadlineSentence) : null,
    deadlineText: deadlineSentence ? clean(deadlineSentence, 280) : null,
    deadlineNotPublished: false,
  };
}

const GENERIC_SCHOLARSHIP_TITLE_TERMS = new Set(["scholarship", "scholarships", "fellowship", "fellowships", "grant", "grants", "award", "awards", "student", "students", "high", "school", "senior", "seniors", "class", "college", "undergraduate", "graduate"]);
function getTitleMatchedSnippet(title, excerpt) {
  const titleTerms = new Set(normalizeTitle(title).split(" ").filter((term) => term.length > 2 && !GENERIC_SCHOLARSHIP_TITLE_TERMS.has(term)));
  if (!titleTerms.size) return "";
  const sentences = String(excerpt ?? "").match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  const minimumMatches = Math.min(2, titleTerms.size);
  const matchesTitle = (sentence) => {
    const terms = new Set(normalizeTitle(sentence).split(" "));
    return [...titleTerms].filter((term) => terms.has(term)).length >= minimumMatches;
  };
  const hasCompetingNamedEntity = (sentence) => {
    const phrases = String(sentence).match(/\b(?:[A-Z][a-z]+(?:\s+|$)){2,}/g) ?? [];
    return phrases.some((phrase) => phrase.split(/\s+/).filter((word) => {
      const term = normalizeTitle(word);
      return term.length > 2 && !GENERIC_SCHOLARSHIP_TITLE_TERMS.has(term) && !titleTerms.has(term);
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
export function normalizeAndRankResults(outcomes, discoveredAt, state, graduationYear, { randomUUID = () => crypto.randomUUID() } = {}) {
  const unique = new Map();
  const rankingsByPath = new Map();
  let rawResultCount = 0;

  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    const category = outcome.job.category;
    const variation = Math.max(1, Number(outcome.job.variation ?? 1));
    const page = Math.max(1, Number(outcome.job.page ?? 1));
    const retrievalPath = `${category}:${variation}`;
    const ranking = rankingsByPath.get(retrievalPath) ?? [];

    for (let resultIndex = 0; resultIndex < outcome.results.length; resultIndex += 1) {
      const item = outcome.results[resultIndex];
      rawResultCount += 1;
      if (!isSafeHttpsUrl(item?.url) || isScholarshipDirectoryLandingUrl(item.url, item.title)) continue;

      const title = clean(item.title, 220);
      if (!title) continue;

      let normalizedUrl;
      let domain;
      try {
        normalizedUrl = canonicalizeUrl(item.url);
        domain = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
      } catch { continue; }

      // Search page two continues the same query result list after page one.
      const rank = ((page - 1) * 15) + resultIndex + 1;
      ranking.push({ title, url: normalizedUrl, rank });

      const excerpt = clean(item.content ?? item.snippet ?? item.description, 1800);
      const normalized = {
        title,
        source_url: normalizedUrl,
        source_domain: domain,
        excerpt,
        discovery_category: category,
        discovery_categories: [category],
        discovery_query: outcome.job.query,
        discovery_queries: [outcome.job.query],
        discovery_page: page,
        discovery_pages: [page],
        published_at: clean(item.publishedDate ?? item.published_at ?? item.publishedAt, 80) || null,
        search_engine: "searxng",
      };
      const key = `${normalizedUrl}|${normalizeTitle(title)}`;
      const previous = unique.get(key);
      if (!previous) {
        unique.set(key, normalized);
        continue;
      }

      const preferred = excerpt.length > String(previous.excerpt ?? "").length ? normalized : previous;
      const fallback = preferred === normalized ? previous : normalized;
      unique.set(key, {
        ...fallback,
        ...preferred,
        excerpt: preferred.excerpt || fallback.excerpt || "",
        evidence_excerpt: preferred.excerpt || fallback.excerpt || "",
        discovery_category: String(preferred.discovery_category || fallback.discovery_category),
        discovery_categories: [...new Set([...(previous.discovery_categories || []), category])],
        discovery_queries: [...new Set([...(previous.discovery_queries || []), outcome.job.query])],
        discovery_pages: [...new Set([...(previous.discovery_pages || []), page])],
      });
    }

    rankingsByPath.set(retrievalPath, ranking);
  }

  // Each category/variation is one ranked list across both pages. The RRF
  // helper deduplicates within each list so a repeated page-two URL cannot
  // cast a second vote for the same query.
  const fused = calculateReciprocalRankFusion([...rankingsByPath.values()]);
  const fusedByKey = new Map(fused.map((item) => [
    `${item.url}|${normalizeTitle(item.title)}`,
    item,
  ]));
  const bestRankByKey = new Map();
  for (const ranking of rankingsByPath.values()) {
    for (const item of ranking) {
      const key = `${item.url}|${normalizeTitle(item.title)}`;
      const current = bestRankByKey.get(key);
      if (!current || item.rank < current) bestRankByKey.set(key, item.rank);
    }
  }

  const ranked = [...unique.values()].map((item) => {
    const key = `${item.source_url}|${normalizeTitle(item.title)}`;
    const consensus = fusedByKey.get(key);
    const consensusScore = consensus?.consensusScore ?? 0;
    const consensusCount = consensus?.appearances ?? 0;
    const titleMatchedSnippet = getTitleMatchedSnippet(item.title, item.excerpt);
    const match = calculateRelevance(item.title, titleMatchedSnippet, item.source_domain, state, graduationYear);
    const evidenceExcerpt = [item.title, titleMatchedSnippet].filter(Boolean).join(". ").slice(0, 2000);
    const searchSignals = extractScholarshipSearchSignals(titleMatchedSnippet);
    if (searchSignals.awardText) { match.score += 1; match.reasons.push("Search snippet includes an award amount"); }
    if (searchSignals.deadline) { match.score += 1; match.reasons.push("Search snippet includes a dated deadline"); }
    const reasons = [...match.reasons];
    if (consensusCount > 1) reasons.push(`Found across ${consensusCount} independent search variations`);

    return {
      id: randomUUID(),
      title: item.title,
      provider: null,
      award_text: searchSignals.awardText,
      award_evidence_text: searchSignals.awardText || null,
      award_evidence_url: searchSignals.awardText ? item.source_url : null,
      deadline: searchSignals.deadline,
      deadline_text: searchSignals.deadlineText,
      deadline_timezone: null,
      deadline_not_published: false,
      last_checked_date: null,
      source_authority: "unverified-lead",
      source_evidence_url: null,
      source_url: item.source_url,
      discovery_source_url: null,
      discovery_category: item.discovery_category,
      discovery_categories: item.discovery_categories,
      discovery_queries: item.discovery_queries,
      discovery_pages: item.discovery_pages,
      source_domain: item.source_domain,
      excerpt: titleMatchedSnippet,
      evidence_excerpt: evidenceExcerpt,
      published_at: item.published_at,
      search_engine: "searxng",
      search_consensus_score: consensusScore,
      search_consensus_count: consensusCount,
      search_best_rank: bestRankByKey.get(key) ?? null,
      // 70% reflects agreement across independent searches; 30% reflects explicit fit signals.
      // The score is a discovery ranking, not a personalized eligibility percentage.
      relevance_score: Math.max(0, Math.min(100, Math.round(
        (consensusCount >= 2 ? consensusScore * 70 : 0) +
        (Math.min(15, Math.max(0, match.score)) / 15) * 30
      ))),
      relevance_reasons: reasons,
      verification_state: "unverified_lead",
      discovered_at: discoveredAt,
      source_checked_at: null,
      extracted_rules: {
        short_source_summary: titleMatchedSnippet,
        search_signal_source: "search_snippet",
        uncertainties: [
          ...(!searchSignals.awardText ? ["Award amount was not found in the search snippet."] : ["Award wording is a search-snippet clue; confirm it on the sponsor page."]),
          ...(!searchSignals.deadline ? ["A dated deadline was not found in the search snippet."] : ["Deadline wording is a search-snippet clue; confirm it on the sponsor page."]),
          "Eligibility rules have not been confirmed on the official sponsor page.",
          "Search ranking is a relevance aid, not an eligibility decision.",
        ],
      },
    };
  }).sort((a, b) =>
    Number(b.relevance_score) - Number(a.relevance_score) ||
    Number(b.search_consensus_score) - Number(a.search_consensus_score) ||
    String(a.title).localeCompare(String(b.title))
  ).slice(0, MAX_RESULTS);

  const results = ranked.map((item, index) => ({ ...item, server_rank: index + 1 }));
  return { results, rawResultCount };
}
async function readRequestBody(req) {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("body-too-large");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally { reader.releaseLock(); }
}
export function createScholarshipDiscoveryHandler(deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const getEnv = deps.getEnv ?? ((key) => Deno.env.get(key));
  const corsHeaders = deps.corsHeaders ?? {};
  const rateLimiter = deps.rateLimiter ?? createPublicRateLimiter();
  const requestedSearchConcurrency = Number(deps.searchConcurrency);
  const searchConcurrency = Number.isInteger(requestedSearchConcurrency)
    ? Math.max(1, Math.min(MAX_SEARCH_CONCURRENCY, requestedSearchConcurrency))
    : SEARCH_CONCURRENCY;
  const cache = deps.cache ?? createDiscoveryResultCache({ now: () => now().getTime() });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    let rateLimit;
    try { rateLimit = await rateLimiter(req); }
    catch { rateLimit = { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 }; }
    if (!rateLimit || typeof rateLimit !== "object") {
      rateLimit = { allowed: false, storageUnavailable: true, retryAfterSeconds: 0 };
    }
    if (rateLimit.storageUnavailable || rateLimit.unattributed) {
      return json({ error: "The shared search rate-limit service is unavailable. Try again shortly." }, 503);
    }
    if (!rateLimit.allowed) {
      const response = json({ error: "Live search is temporarily rate-limited. Wait before trying again." }, 429);
      response.headers.set("Retry-After", String(Math.max(1, rateLimit.retryAfterSeconds || 1)));
      return response;
    }
    try {
      const gatewayUrl = getEnv("SEARXNG_GATEWAY_URL")?.trim() ?? "";
    const gatewayToken = String(getEnv("SEARXNG_GATEWAY_TOKEN") ?? "").trim();
    if (!gatewayUrl || gatewayToken.length < 48) return json({ error: "The laptop search gateway is not configured in Supabase yet." }, 503);
    let gatewayBase;
    try {
      gatewayBase = new URL(gatewayUrl);
      if (!isSafeHttpsUrl(gatewayUrl) || gatewayBase.search || gatewayBase.hash) return json({ error: "The laptop search gateway URL is not a valid public HTTPS base URL." }, 503);
    } catch { return json({ error: "The laptop search gateway URL is not configured correctly." }, 503); }
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return json({ error: "Send the search filters as JSON." }, 415);
    let rawBody;
    try { rawBody = await readRequestBody(req); }
    catch (error) {
      if (error instanceof RangeError) return json({ error: "Search request is too large." }, 413);
      return json({ error: "Could not read the search request." }, 400);
    }
    let body;
    try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON request." }, 400); }
    const state = normalizeUsState(clean(body?.profile?.state, 60));
    const yearValue = body?.profile?.graduationYear;
    const rawGraduationYear = typeof yearValue === "number" && Number.isFinite(yearValue)
      ? String(yearValue)
      : typeof yearValue === "string" ? yearValue : "";
    const graduationYear = /^\d{4}$/.test(rawGraduationYear) ? Number(rawGraduationYear) : NaN;
    const currentYear = now().getUTCFullYear();
    if (!state) return json({ error: "Choose a valid US state or territory for scholarship search." }, 400);
    if (!Number.isInteger(graduationYear) || graduationYear < currentYear || graduationYear > currentYear + 9) return json({ error: "Enter a valid high-school graduation year." }, 400);
    const rawCategories = Array.isArray(body?.categories) ? body.categories : [];
    const categories = [...new Set(rawCategories.filter((value) => typeof value === "string" && ALLOWED_CATEGORIES.includes(value)))];
    if (categories.length === 0) return json({ error: "Choose at least one scholarship search category." }, 400);

    const cacheKey = `${gatewayBase.href}|${state.toLowerCase()}|${graduationYear}|${[...categories].sort().join(",")}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const cachedPayload = cached.value;
      return json({
        ...cachedPayload,
        summary: {
          requestedQueries: 0,
          successfulQueries: 0,
          failedQueries: 0,
          failureReasons: [],
          pagesChecked: 0,
          rawResultCount: 0,
          uniqueResults: cachedPayload.results.length,
          potentialQueries: cachedPayload.summary.potentialQueries,
          queriesAvoided: cachedPayload.summary.requestedQueries,
          retryAttempts: 0,
          cacheHit: true,
          cacheAgeMs: cached.ageMs,
        },
      });
    }

    const jobs = buildSearchJobs(state, graduationYear, categories);
    const outcomes = await runAdaptiveSearches(gatewayBase, gatewayToken, jobs, { fetchImpl, concurrency: searchConcurrency, state, graduationYear });
    const successfulQueries = outcomes.filter((outcome) => outcome.ok).length;
    const failedQueries = outcomes.length - successfulQueries;
    const retryAttempts = outcomes.reduce((total, outcome) => total + (outcome.retryAttempts || 0), 0);
    const queriesAvoided = Math.max(0, jobs.length - outcomes.length);
    const failureReasonCounts = new Map();
    for (const outcome of outcomes) {
      if (outcome.ok) continue;
      const code = Number.isInteger(outcome.status) ? `http_${outcome.status}` : outcome.failureCode || "network_error";
      failureReasonCounts.set(code, (failureReasonCounts.get(code) || 0) + 1);
    }
    const failureReasons = [...failureReasonCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => ({ code, count }));
    if (failedQueries > 0) {
      console.warn("[scholarship-discover] upstream search failures", {
        gatewayHost: gatewayBase.hostname,
        requestedQueries: outcomes.length,
        successfulQueries,
        failedQueries,
        failureReasons,
      });
    }
    if (successfulQueries === 0) {
      return json({
        error: "The search gateway could not complete any category searches. Check the laptop, tunnel, and SearXNG service.",
        summary: {
          requestedQueries: outcomes.length,
          successfulQueries,
          failedQueries,
          failureReasons,
          pagesChecked: 0,
          rawResultCount: 0,
          uniqueResults: 0,
          potentialQueries: jobs.length,
          queriesAvoided,
          retryAttempts,
          cacheHit: false,
          cacheAgeMs: 0,
        },
      }, 502);    }

    const discoveredAt = now().toISOString();
    const { results, rawResultCount } = normalizeAndRankResults(outcomes, discoveredAt, state, graduationYear, { randomUUID });
    const warnings = failedQueries > 0
      ? ["Some category or page searches did not complete; this result set may be incomplete."]
      : [];
    const summary = {
      requestedQueries: outcomes.length,
      successfulQueries,
      failedQueries,
      failureReasons,
      pagesChecked: successfulQueries,
      rawResultCount,
      uniqueResults: results.length,
      potentialQueries: jobs.length,
      queriesAvoided,
      retryAttempts,
      cacheHit: false,
      cacheAgeMs: 0,
    };
    const payload = { results, count: results.length, provider: "searxng", warnings, summary };
    // Never cache incomplete responses: a later request must be able to retry them.
    if (failedQueries === 0) cache.set(cacheKey, payload);
    return json(payload);
    } finally {
      if (typeof rateLimit.release === "function") {
        try { await rateLimit.release(); } catch { /* the lease expires automatically */ }
      }
    }
  };
}
